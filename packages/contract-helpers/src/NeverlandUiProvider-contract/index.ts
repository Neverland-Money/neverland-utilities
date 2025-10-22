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
  OptimalClaimResult,
  UnlockSchedule,
  EmissionData,
  EssentialUserView,
  UserEmissionAssetBreakdown,
  UiBootstrap,
  UiFullBundle,
} from './types';

export class NeverlandUiService extends AbiBaseService<Abi> {
  private contract: ethers.Contract;

  constructor(contractAddress: string, provider: ethers.providers.Provider) {
    super(provider, neverlandUiProviderAbi as any);
    this.contract = this.getContractInstance(contractAddress);
  }

  async getUserEmissionBreakdown(
    userAddress: string,
    rewardToken: string
  ): Promise<UserEmissionAssetBreakdown> {
    try {
      const result = await this.contract.getUserEmissionBreakdown(
        userAddress,
        rewardToken
      );
      return {
        assets: result.assets as string[],
        amounts: result.amounts as BigNumber[],
      };
    } catch {
      throw new Error(
        'NeverlandUiProvider: getUserEmissionBreakdown is not available on this deployment'
      );
    }
  }

  async getUiBootstrap(): Promise<UiBootstrap> {
    const boot = await this.contract.getUiBootstrap();
    return boot as UiBootstrap;
  }

  async getUiFullBundle(userAddress: string): Promise<UiFullBundle | null> {
    try {
      return await this.getUiFullBundlePaginated(userAddress, 5);
    } catch {
      return null;
    }
  }

  async getUiFullBundleFromParts(
    userAddress: string
  ): Promise<UiFullBundle | null> {
    try {
      const boot = await this.getUiBootstrap();
      const userDash = await this.getUserDashboardWithPagination(userAddress, 5);
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
            };
          } else {
            emissions = { rewardTokens: [], totalRewards: [] };
          }
        } catch {
          emissions = { rewardTokens: [], totalRewards: [] };
        }
      }

      let unlockSchedule: UnlockSchedule = { unlockTimes: [], amounts: [], tokenIds: [] };
      try { unlockSchedule = await this.getUnlockSchedule(userAddress); } catch {}

      let rewardsSummary = { totalRevenue: [] as BigNumber[], totalEmissions: [] as BigNumber[], totalHistorical: [] as BigNumber[] };
      try {
        const rt = boot?.meta?.revenueRewardTokens || [];
        if (rt.length > 0) rewardsSummary = await this.getUserRewardsSummary(userAddress, rt);
      } catch {}

      return {
        meta: boot.meta,
        essential: { user: userDash, globalStats: boot.globalStats, emissions, marketData: boot.marketData },
        extended: { unlockSchedule, rewardsSummary, allPrices: boot.allPrices },
        network: boot.network,
      } as UiFullBundle;
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
    return { rewardTokens: result.rewardTokens as string[], totalRewards: result.totalRewards as BigNumber[] };
  }

  async getUserDashboard(userAddress: string): Promise<UserDashboardData> {
    return this.getUserDashboardWithPagination(userAddress, 5);
  }

  async getUserTokenCount(userAddress: string): Promise<number> {
    const count = await this.contract.getUserTokenCount(userAddress);
    const bn = BigNumber.isBigNumber(count) ? (count as BigNumber) : BigNumber.from(count);
    return bn.toNumber();
  }

  async getUserDashboardWithPagination(userAddress: string, pageSize = 5): Promise<UserDashboardData> {
    const tokenIdsAll: BigNumber[] = [];
    const locksAll: LockInfo[] = [];
    const rewardsAll: RewardSummary[] = [];

    const total = await this.getUserTokenCount(userAddress);
    if (!total || total <= 0) {
      return { user: userAddress, tokenIds: [], locks: [], rewardSummaries: [], totalVotingPower: BigNumber.from(0), totalLockedAmount: BigNumber.from(0) };
    }

    let offset = 0;
    while (offset < total) {
      const limit = Math.min(pageSize, total - offset);
      try {
        const page = (await this.contract.getEssentialUserView(userAddress, BigNumber.from(offset), BigNumber.from(limit))) as EssentialUserView;
        const pageUser: UserDashboardData = page.user;
        if (pageUser?.tokenIds?.length) tokenIdsAll.push(...pageUser.tokenIds);
        if (pageUser?.locks?.length) locksAll.push(...pageUser.locks);
        if (pageUser?.rewardSummaries?.length) rewardsAll.push(...pageUser.rewardSummaries);
        offset += limit;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('NeverlandUiProvider.getEssentialUserView reverted', { offset, limit, userAddress, error });
        break;
      }
    }

    const totalVotingPower = locksAll.reduce((acc, l) => acc.add(l?.votingPower || BigNumber.from(0)), BigNumber.from(0));
    const totalLockedAmount = locksAll.reduce((acc, l) => acc.add(l?.amount || BigNumber.from(0)), BigNumber.from(0));

    return { user: userAddress, tokenIds: tokenIdsAll, locks: locksAll, rewardSummaries: rewardsAll, totalVotingPower, totalLockedAmount };
  }

  async getUiFullBundlePaginated(userAddress: string, pageSize = 5): Promise<UiFullBundle> {
    const total = await this.getUserTokenCount(userAddress);
    let combined: UiFullBundle | null = null;
    const pages: { offset: number; limit: number }[] = total > 0
      ? Array.from({ length: Math.ceil(total / pageSize) }, (_, i) => ({ offset: i * pageSize, limit: Math.min(pageSize, total - i * pageSize) }))
      : [{ offset: 0, limit: 0 }];

    const results = await Promise.all(pages.map(p => this.contract.getUiFullBundle(userAddress, BigNumber.from(p.offset), BigNumber.from(p.limit)) as Promise<UiFullBundle>));

    results.forEach(pageBundle => {
      if (!combined) {
        combined = { meta: pageBundle.meta, essential: { ...pageBundle.essential, user: { ...pageBundle.essential.user, tokenIds: [...(pageBundle.essential.user.tokenIds || [])], locks: [...(pageBundle.essential.user.locks || [])], rewardSummaries: [...(pageBundle.essential.user.rewardSummaries || [])] } }, extended: pageBundle.extended, network: pageBundle.network };
      } else {
        const u: UserDashboardData = combined.essential.user;
        const pu: UserDashboardData = pageBundle.essential.user;
        if (pu?.tokenIds?.length) u.tokenIds.push(...(pu.tokenIds as BigNumber[]));
        if (pu?.locks?.length) u.locks.push(...(pu.locks as LockInfo[]));
        if (pu?.rewardSummaries?.length) u.rewardSummaries.push(...(pu.rewardSummaries as RewardSummary[]));
      }
    });

    if (!combined) {
      const boot = await this.getUiBootstrap();
      return {
        meta: boot.meta,
        essential: { user: { user: userAddress, tokenIds: [], locks: [], rewardSummaries: [], totalVotingPower: BigNumber.from(0), totalLockedAmount: BigNumber.from(0) }, globalStats: boot.globalStats, emissions: { rewardTokens: [], totalRewards: [] }, marketData: boot.marketData },
        extended: { unlockSchedule: { unlockTimes: [], amounts: [], tokenIds: [] }, rewardsSummary: { totalRevenue: [], totalEmissions: [], totalHistorical: [] }, allPrices: boot.allPrices },
        network: boot.network,
      } as UiFullBundle;
    }

    const bundle = combined as UiFullBundle;
    const locksAll: LockInfo[] = bundle.essential.user.locks || [];
    const totalVotingPower = locksAll.reduce((acc: BigNumber, l: LockInfo) => acc.add(l?.votingPower || BigNumber.from(0)), BigNumber.from(0));
    const totalLockedAmount = locksAll.reduce((acc: BigNumber, l: LockInfo) => acc.add(l?.amount || BigNumber.from(0)), BigNumber.from(0));
    bundle.essential.user.totalVotingPower = totalVotingPower;
    bundle.essential.user.totalLockedAmount = totalLockedAmount;
    return bundle;
  }

  async getUserPortfolioValue(userAddress: string): Promise<BigNumber> {
    return await this.contract.getUserPortfolioValue(userAddress);
  }

  async getAllPrices(): Promise<PriceData> {
    const result = await this.contract.getAllPrices();
    return { tokens: result.tokens, prices: result.prices, lastUpdated: result.lastUpdated, isStale: result.isStale };
  }

  async getGlobalStats(): Promise<GlobalStats> {
    const result = await this.contract.getGlobalStats();
    return { totalSupply: result.totalSupply, totalVotingPower: result.totalVotingPower, permanentLockBalance: result.permanentLockBalance, rewardTokens: result.rewardTokens, totalRewardsPerToken: result.totalRewardsPerToken, epoch: result.epoch, activeTokenCount: result.activeTokenCount };
  }

  async getMarketData(): Promise<MarketData> {
    const result = await this.contract.getMarketData();
    return { rewardTokens: result.rewardTokens, rewardTokenBalances: result.rewardTokenBalances, distributionRates: result.distributionRates, nextEpochTimestamp: result.nextEpochTimestamp, currentEpoch: result.currentEpoch, epochRewards: result.epochRewards, nextEpochRewards: result.nextEpochRewards, totalValueLockedUSD: result.totalValueLockedUSD };
  }

  async getUserRewardsSummary(userAddress: string, rewardTokens: string[]): Promise<{ totalRevenue: BigNumber[]; totalEmissions: BigNumber[]; totalHistorical: BigNumber[] }> {
    const result = await this.contract.getUserRewardsSummary(userAddress, rewardTokens);
    return { totalRevenue: result.totalRevenue, totalEmissions: result.totalEmissions, totalHistorical: result.totalHistorical };
  }

  async getNetworkData(): Promise<NetworkData> {
    const result = await this.contract.getNetworkData();
    return { currentBlock: result.currentBlock, currentTimestamp: result.currentTimestamp, gasPrice: result.gasPrice };
  }

  async getBatchTokenDetails(tokenIds: BigNumber[]): Promise<{ locks: LockInfo[]; rewards: RewardSummary[] }> {
    const result = await this.contract.getBatchTokenDetails(tokenIds);
    return { locks: result.locks, rewards: result.rewards };
  }

  async getTokenDetails(tokenId: BigNumber): Promise<{ lockInfo: LockInfo; rewardSummary: RewardSummary }> {
    const result = await this.contract.getTokenDetails(tokenId);
    return { lockInfo: result[0], rewardSummary: result[1] };
  }

  async getOptimalClaimOrder(userAddress: string): Promise<OptimalClaimResult> {
    const result = await this.contract.getOptimalClaimOrder(userAddress);
    return { tokenIds: result.tokenIds, totalGasOptimized: result.totalGasOptimized };
  }

  async getUnlockSchedule(userAddress: string): Promise<UnlockSchedule> {
    const result = await this.contract.getUnlockSchedule(userAddress);
    return { unlockTimes: result.unlockTimes, amounts: result.amounts, tokenIds: result.tokenIds };
  }

  async getUserTokensPaginated(userAddress: string, offset: BigNumber, limit: BigNumber): Promise<{ tokenIds: BigNumber[]; hasMore: boolean }> {
    const result = await this.contract.getUserTokensPaginated(userAddress, offset, limit);
    return { tokenIds: result.tokenIds, hasMore: result.hasMore };
  }

  async calculateUnlockPenalty(tokenId: BigNumber, userAddress: string): Promise<BigNumber> {
    return await this.contract.calculateUnlockPenalty(tokenId, userAddress);
  }

  async getOptimalLockDuration(amount: BigNumber): Promise<{ duration: BigNumber; projectedRewards: BigNumber }> {
    const result = await this.contract.getOptimalLockDuration(amount);
    return { duration: result.duration, projectedRewards: result.projectedRewards };
  }

  async simulateClaim(userAddress: string, tokenIds: BigNumber[], rewardTokens: string[]): Promise<{ claimAmounts: BigNumber[]; gasEstimate: BigNumber }> {
    const result = await this.contract.simulateClaim(userAddress, tokenIds, rewardTokens);
    return { claimAmounts: result.claimAmounts, gasEstimate: result.gasEstimate };
  }

  calculateTotalRewardsUSD(rewardSummaries: RewardSummary[], priceData: PriceData, dustTokenAddress: string): { totalRewards: string; totalRewardsUSD: string } {
    let totalDustRewards = BigNumber.from(0);
    rewardSummaries.forEach(summary => {
      summary.rewardTokens.forEach((token, index) => {
        if (token.toLowerCase() === dustTokenAddress.toLowerCase()) {
          const revenueReward = summary.revenueRewards[index];
          const emissionReward = summary.emissionRewards[index];
          totalDustRewards = totalDustRewards.add(revenueReward || BigNumber.from(0)).add(emissionReward || BigNumber.from(0));
        }
      });
    });
    const dustPriceIndex = priceData.tokens.findIndex(token => token.toLowerCase() === dustTokenAddress.toLowerCase());
    let totalRewardsUSD = '0';
    if (dustPriceIndex !== -1 && !priceData.isStale[dustPriceIndex]) {
      const dustPrice = priceData.prices[dustPriceIndex];
      const rewardsInDust = parseFloat(formatUnits(totalDustRewards, 18));
      const priceInUSD = parseFloat(formatUnits(dustPrice || 0, 8));
      const usdValue = rewardsInDust * priceInUSD;
      if (usdValue > 0 && usdValue < 0.01) totalRewardsUSD = '< 0.01'; else totalRewardsUSD = usdValue.toFixed(2);
    }
    return { totalRewards: totalDustRewards.toString(), totalRewardsUSD };
  }

  formatPortfolioValue(portfolioValueBN: BigNumber): string {
    const valueUSD = parseFloat(formatUnits(portfolioValueBN, 8));
    return valueUSD.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatDustAmount(dustAmountBN: BigNumber): string {
    const amount = parseFloat(formatUnits(dustAmountBN, 18));
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }
}

export default NeverlandUiService;
