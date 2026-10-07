import { BigNumber, ethers } from 'ethers';
import { formatUnits } from 'ethers/lib/utils';
import { neverlandUiProviderAbi } from '@neverland-money/contract-types';
import { AbiBaseService } from '../commons/BaseService';
import type { Abi } from 'abitype';
import type {
  UserDashboardData,
  LockInfo,
  RewardSummary,
  PriceData,
  GlobalStats,
  MarketData,
  NetworkData,
  UnlockSchedule,
  EmissionData,
  UserEmissionBreakdown,
  UserRewardsSummary,
  UiBootstrap,
  UiFullBundle,
  ProtocolMeta,
  PoolMarket,
} from './types';

const DEFAULT_PAGE_SIZE = 5;

const emptyDashboard = (user: string): UserDashboardData => ({
  user,
  tokenIds: [],
  locks: [],
  rewardSummaries: [],
  totalVotingPower: BigNumber.from(0),
  totalLockedAmount: BigNumber.from(0),
  rawTokenCount: BigNumber.from(0),
  nextRawOffset: BigNumber.from(0),
  hasMore: false,
});

const emptyEmissions = (): EmissionData => ({
  rewardTokens: [],
  totalRewards: [],
  resolved: false,
  asOfBlock: BigNumber.from(0),
  asOfTimestamp: BigNumber.from(0),
});

const sumField = <T>(items: T[], pick: (item: T) => BigNumber | undefined): BigNumber =>
  items.reduce((acc, item) => acc.add(pick(item) || BigNumber.from(0)), BigNumber.from(0));

export class NeverlandUiService extends AbiBaseService<Abi> {
  private contract: ethers.Contract;

  constructor(contractAddress: string, provider: ethers.providers.Provider) {
    super(provider, neverlandUiProviderAbi as any, contractAddress);
    this.contract = this.getContractInstance(contractAddress);
  }

  /**
   * True when bit `index` of a `resolvedMask` is set. Only the first 256 rows are representable,
   * so any later row always reads as unresolved.
   */
  static isRowResolved(mask: BigNumber, index: number): boolean {
    if (index < 0 || index > 255) return false;
    return !mask.shr(index).and(1).isZero();
  }

  /** True when the first `count` bits of a `resolvedMask` are all set. */
  static areAllRowsResolved(mask: BigNumber, count: number): boolean {
    for (let i = 0; i < count; i++) {
      if (!NeverlandUiService.isRowResolved(mask, i)) return false;
    }
    return true;
  }

  async getProtocolMeta(): Promise<ProtocolMeta> {
    return (await this.contract.getProtocolMeta()) as ProtocolMeta;
  }

  /** Every lending market registered on the provider's pool address provider registry. */
  async getRegisteredPoolMarkets(): Promise<PoolMarket[]> {
    const markets = await this.contract.getRegisteredPoolMarkets();
    return markets.map((m: PoolMarket) => ({ provider: m.provider, marketId: m.marketId }));
  }

  async getUserEmissionBreakdown(
    userAddress: string,
    rewardToken: string,
  ): Promise<UserEmissionBreakdown> {
    const result = await this.contract.getUserEmissionBreakdown(userAddress, rewardToken);
    return {
      breakdown: result.breakdown,
      enumerationResolved: result.enumerationResolved as boolean,
    };
  }

  async getUiBootstrap(): Promise<UiBootstrap> {
    const boot = await this.contract.getUiBootstrap();
    return boot as UiBootstrap;
  }

  async getUiFullBundle(userAddress: string): Promise<UiFullBundle | null> {
    try {
      return await this.getUiFullBundlePaginated(userAddress, DEFAULT_PAGE_SIZE);
    } catch {
      return null;
    }
  }

  async getUiFullBundleFromParts(userAddress: string): Promise<UiFullBundle | null> {
    try {
      const boot = await this.getUiBootstrap();
      const userDash = await this.getUserDashboardWithPagination(userAddress, DEFAULT_PAGE_SIZE);
      let emissions: EmissionData;
      try {
        emissions = await this.getUserEmissions(userAddress);
      } catch {
        const emissionTokens = boot?.meta?.emissionRewardTokens || [];
        try {
          if (emissionTokens.length > 0) {
            const summary = await this.getUserRewardsSummary(userAddress, emissionTokens);
            emissions = {
              rewardTokens: emissionTokens,
              totalRewards: summary.totalEmissions || [],
              resolved: NeverlandUiService.areAllRowsResolved(
                summary.emissionsResolvedMask,
                emissionTokens.length,
              ),
              asOfBlock: summary.asOfBlock,
              asOfTimestamp: summary.asOfTimestamp,
            };
          } else {
            emissions = emptyEmissions();
          }
        } catch {
          emissions = emptyEmissions();
        }
      }

      let unlockSchedule: UnlockSchedule = { unlockTimes: [], amounts: [], tokenIds: [] };
      try {
        unlockSchedule = await this.getUnlockSchedule(userAddress);
      } catch {
        // The schedule is optional; keep the empty default.
      }

      return {
        meta: boot.meta,
        essential: {
          user: userDash,
          globalStats: boot.globalStats,
          emissions,
          marketData: boot.marketData,
        },
        extended: { unlockSchedule, allPrices: boot.allPrices },
        network: boot.network,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('NeverlandUiProvider.getUiFullBundleFromParts failed:', {
        error,
        contractAddress: this.contract.address,
        userAddress,
      });
      return null;
    }
  }

  async getUserEmissions(userAddress: string): Promise<EmissionData> {
    const result = await this.contract.getUserEmissions(userAddress);
    return {
      rewardTokens: result.rewardTokens as string[],
      totalRewards: result.totalRewards as BigNumber[],
      resolved: result.resolved as boolean,
      asOfBlock: result.asOfBlock as BigNumber,
      asOfTimestamp: result.asOfTimestamp as BigNumber,
    };
  }

  async getUserDashboard(userAddress: string): Promise<UserDashboardData> {
    return this.getUserDashboardWithPagination(userAddress, DEFAULT_PAGE_SIZE);
  }

  async getUserTokenCount(userAddress: string): Promise<number> {
    const count = await this.contract.getUserTokenCount(userAddress);
    const bn = BigNumber.isBigNumber(count) ? (count as BigNumber) : BigNumber.from(count);
    return bn.toNumber();
  }

  /**
   * Walks every raw DustLock enumeration page for a user. Pages are compacted to live veNFTs, so
   * the cursor is the contract's `nextRawOffset`, never the number of tokens returned. If a page
   * reverts or the cursor stops advancing, the partial result is returned with `hasMore` set and
   * `nextRawOffset` pointing at the page to retry.
   */
  async getUserDashboardWithPagination(
    userAddress: string,
    pageSize = DEFAULT_PAGE_SIZE,
  ): Promise<UserDashboardData> {
    const merged = emptyDashboard(userAddress);
    let offset = 0;

    for (;;) {
      let page: UserDashboardData;
      try {
        page = (await this.contract.getUserDashboard(
          userAddress,
          BigNumber.from(offset),
          BigNumber.from(pageSize),
        )) as UserDashboardData;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('NeverlandUiProvider.getUserDashboard reverted', {
          offset,
          pageSize,
          userAddress,
          error,
        });
        merged.hasMore = true;
        merged.nextRawOffset = BigNumber.from(offset);
        break;
      }

      this.appendDashboardPage(merged, page);
      if (!page.hasMore) break;

      const next = page.nextRawOffset.toNumber();
      if (next <= offset) break;
      offset = next;
    }

    this.recomputeDashboardTotals(merged);
    return merged;
  }

  /**
   * Fetches the full UI bundle, following the same raw-offset cursor as
   * {@link getUserDashboardWithPagination}. Global, market and price data come from the first page;
   * the unlock schedule is built per page by the contract, so it is concatenated across pages.
   */
  async getUiFullBundlePaginated(
    userAddress: string,
    pageSize = DEFAULT_PAGE_SIZE,
  ): Promise<UiFullBundle> {
    const user = emptyDashboard(userAddress);
    const unlockSchedule: UnlockSchedule = { unlockTimes: [], amounts: [], tokenIds: [] };
    let first: UiFullBundle | null = null;
    let offset = 0;

    for (;;) {
      const page = (await this.contract.getUiFullBundle(
        userAddress,
        BigNumber.from(offset),
        BigNumber.from(pageSize),
      )) as UiFullBundle;
      if (!first) first = page;

      this.appendDashboardPage(user, page.essential.user);
      unlockSchedule.unlockTimes.push(...page.extended.unlockSchedule.unlockTimes);
      unlockSchedule.amounts.push(...page.extended.unlockSchedule.amounts);
      unlockSchedule.tokenIds.push(...page.extended.unlockSchedule.tokenIds);
      if (!page.essential.user.hasMore) break;

      const next = page.essential.user.nextRawOffset.toNumber();
      if (next <= offset) break;
      offset = next;
    }

    this.recomputeDashboardTotals(user);

    const head = first as UiFullBundle;
    return {
      meta: head.meta,
      essential: {
        user,
        globalStats: head.essential.globalStats,
        emissions: head.essential.emissions,
        marketData: head.essential.marketData,
      },
      extended: { unlockSchedule, allPrices: head.extended.allPrices },
      network: head.network,
    };
  }

  async getAllPrices(): Promise<PriceData> {
    return (await this.contract.getAllPrices()) as PriceData;
  }

  async getGlobalStats(): Promise<GlobalStats> {
    return (await this.contract.getGlobalStats()) as GlobalStats;
  }

  async getMarketData(): Promise<MarketData> {
    return (await this.contract.getMarketData()) as MarketData;
  }

  async getUserRewardsSummary(
    userAddress: string,
    rewardTokens: string[],
  ): Promise<UserRewardsSummary> {
    return (await this.contract.getUserRewardsSummary(
      userAddress,
      rewardTokens,
    )) as UserRewardsSummary;
  }

  async getNetworkData(): Promise<NetworkData> {
    return (await this.contract.getNetworkData()) as NetworkData;
  }

  async getUnlockSchedule(userAddress: string): Promise<UnlockSchedule> {
    const result = await this.contract.getUnlockSchedule(userAddress);
    return {
      unlockTimes: result.unlockTimes,
      amounts: result.amounts,
      tokenIds: result.tokenIds,
    };
  }

  /**
   * Total DUST rewards and their USD value. Revenue rewards come from the per-token summaries;
   * pass `emissions` to include the user's per-user DUST emissions as well. The USD value is '0'
   * when the DUST price row is unresolved.
   */
  calculateTotalRewardsUSD(
    rewardSummaries: RewardSummary[],
    priceData: PriceData,
    dustTokenAddress: string,
    emissions?: EmissionData,
  ): { totalRewards: string; totalRewardsUSD: string } {
    const dust = dustTokenAddress.toLowerCase();
    let totalDustRewards = BigNumber.from(0);
    rewardSummaries.forEach(summary => {
      summary.rewardTokens.forEach((token, index) => {
        if (token.toLowerCase() === dust) {
          totalDustRewards = totalDustRewards.add(
            summary.revenueRewards[index] || BigNumber.from(0),
          );
        }
      });
    });
    emissions?.rewardTokens.forEach((token, index) => {
      if (token.toLowerCase() === dust) {
        totalDustRewards = totalDustRewards.add(emissions.totalRewards[index] || BigNumber.from(0));
      }
    });

    const dustPriceIndex = priceData.tokens.findIndex(token => token.toLowerCase() === dust);
    let totalRewardsUSD = '0';
    if (
      dustPriceIndex !== -1 &&
      NeverlandUiService.isRowResolved(priceData.resolvedMask, dustPriceIndex)
    ) {
      const dustPrice = priceData.prices[dustPriceIndex];
      const rewardsInDust = parseFloat(formatUnits(totalDustRewards, 18));
      const priceInUSD = parseFloat(formatUnits(dustPrice || 0, 8));
      const usdValue = rewardsInDust * priceInUSD;
      totalRewardsUSD = usdValue > 0 && usdValue < 0.01 ? '< 0.01' : usdValue.toFixed(2);
    }
    return { totalRewards: totalDustRewards.toString(), totalRewardsUSD };
  }

  formatPortfolioValue(portfolioValueBN: BigNumber): string {
    const valueUSD = parseFloat(formatUnits(portfolioValueBN, 8));
    return valueUSD.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  formatDustAmount(dustAmountBN: BigNumber): string {
    const amount = parseFloat(formatUnits(dustAmountBN, 18));
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }

  /** Copies one decoded page into `target`, which stays a plain mutable object. */
  private appendDashboardPage(target: UserDashboardData, page: UserDashboardData): void {
    target.tokenIds.push(...(page.tokenIds || []));
    target.locks.push(...((page.locks || []) as LockInfo[]));
    target.rewardSummaries.push(...((page.rewardSummaries || []) as RewardSummary[]));
    target.rawTokenCount = page.rawTokenCount;
    target.nextRawOffset = page.nextRawOffset;
    target.hasMore = page.hasMore;
  }

  private recomputeDashboardTotals(dashboard: UserDashboardData): void {
    dashboard.totalVotingPower = sumField(dashboard.locks, l => l?.votingPower);
    dashboard.totalLockedAmount = sumField(dashboard.locks, l => l?.amount);
  }
}

export default NeverlandUiService;
