import { neverlandUiProviderAbi } from '@neverland-money/contract-types';
import type {
  Abi,
  AbiParameter,
  AbiParameterToPrimitiveType,
  ExtractAbiFunction,
  ExtractAbiFunctionNames,
} from 'abitype';
import { ethers, formatUnits } from 'ethers';
import { materializeContractResult } from '../commons/abi-result';
import { asAbiContract, type AbiContract } from '../commons/abi-types';
import { AbiBaseService } from '../commons/base-service';
import type {
  EmissionData,
  GlobalStats,
  MarketData,
  NetworkData,
  PoolMarket,
  PriceData,
  ProtocolMeta,
  RewardSummary,
  UiBootstrap,
  UiFullBundle,
  UiPaginationOptions,
  UnlockSchedule,
  UserDashboardData,
  UserEmissionBreakdown,
  UserRewardsSummary,
} from './types';
type UiReadMethod = ExtractAbiFunctionNames<typeof neverlandUiProviderAbi>;
type UiOutputs<N extends UiReadMethod> = ExtractAbiFunction<
  typeof neverlandUiProviderAbi,
  N
>['outputs'];
type MutableEthersValue<T> = T extends number
  ? bigint
  : T extends string
    ? string
    : T extends readonly unknown[]
      ? { -readonly [K in keyof T]: MutableEthersValue<T[K]> }
      : T extends object
        ? { -readonly [K in keyof T]: MutableEthersValue<T[K]> }
        : T;
type UiReadResult<N extends UiReadMethod> =
  UiOutputs<N> extends readonly [infer Output extends AbiParameter]
    ? MutableEthersValue<AbiParameterToPrimitiveType<Output, 'outputs'>>
    : {
        [
          Output in UiOutputs<N>[number] as Output['name'] extends string ? Output['name'] : never
        ]: MutableEthersValue<AbiParameterToPrimitiveType<Output, 'outputs'>>;
      };
type PaginationState = { rawTokenCount: bigint | null; tokenIds: Set<bigint> };
const DEFAULT_PAGE_SIZE = 5;
const emptyDashboard = (user: string): UserDashboardData => ({
  user,
  tokenIds: [],
  locks: [],
  rewardSummaries: [],
  totalVotingPower: 0n,
  totalLockedAmount: 0n,
  rawTokenCount: 0n,
  nextRawOffset: 0n,
  hasMore: false,
});
const emptyEmissions = (): EmissionData => ({
  rewardTokens: [],
  totalRewards: [],
  resolved: false,
  asOfBlock: 0n,
  asOfTimestamp: 0n,
});
const sumField = <T>(items: T[], pick: (item: T) => bigint | undefined): bigint =>
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Preserve the historical falsy-to-zero behavior before bigint conversion, including untyped nonfinite inputs.
  items.reduce((acc, item) => acc + ethers.getBigInt(pick(item) || 0n), 0n);
export class NeverlandUiService extends AbiBaseService<Abi> {
  /**
   * True when bit `index` of a `resolvedMask` is set. Only the first 256 rows are representable,
   * so any later row always reads as unresolved.
   */
  static isRowResolved(mask: bigint, index: number): boolean {
    if (index < 0 || index > 255) return false;
    // eslint-disable-next-line no-bitwise -- Solidity reserve configuration and resolution flags require exact bigint bit masks.
    return !(((mask >> ethers.getBigInt(index)) & 1n) === 0n);
  }

  /** True when the first `count` bits of a `resolvedMask` are all set. */
  static areAllRowsResolved(mask: bigint, count: number): boolean {
    for (let i = 0; i < count; i++) {
      if (!NeverlandUiService.isRowResolved(mask, i)) return false;
    }

    return true;
  }

  private readonly contract: AbiContract<
    typeof neverlandUiProviderAbi,
    | 'getAllPrices'
    | 'getGlobalStats'
    | 'getMarketData'
    | 'getNetworkData'
    | 'getProtocolMeta'
    | 'getRegisteredPoolMarkets'
    | 'getUiBootstrap'
    | 'getUiFullBundle'
    | 'getUnlockSchedule'
    | 'getUserDashboard'
    | 'getUserEmissionBreakdown'
    | 'getUserEmissions'
    | 'getUserRewardsSummary'
    | 'getUserTokenCount'
  >;

  constructor(contractAddress: string, provider: ethers.Provider) {
    super(provider, neverlandUiProviderAbi, contractAddress);
    this.contract = asAbiContract<
      typeof neverlandUiProviderAbi,
      | 'getAllPrices'
      | 'getGlobalStats'
      | 'getMarketData'
      | 'getNetworkData'
      | 'getProtocolMeta'
      | 'getRegisteredPoolMarkets'
      | 'getUiBootstrap'
      | 'getUiFullBundle'
      | 'getUnlockSchedule'
      | 'getUserDashboard'
      | 'getUserEmissionBreakdown'
      | 'getUserEmissions'
      | 'getUserRewardsSummary'
      | 'getUserTokenCount'
    >(this.getContractInstance(contractAddress), neverlandUiProviderAbi);
  }

  async getProtocolMeta(): Promise<ProtocolMeta> {
    const awaitedResult = await this.contract.getProtocolMeta();
    return this.materializeRead('getProtocolMeta', awaitedResult);
  }

  /** Every lending market registered on the provider's pool address provider registry. */
  async getRegisteredPoolMarkets(): Promise<PoolMarket[]> {
    const markets = await this.contract.getRegisteredPoolMarkets();
    return this.materializeRead('getRegisteredPoolMarkets', markets);
  }

  async getUserEmissionBreakdown(
    userAddress: string,
    rewardToken: string,
  ): Promise<UserEmissionBreakdown> {
    const result = await this.contract.getUserEmissionBreakdown(userAddress, rewardToken);
    return this.materializeRead('getUserEmissionBreakdown', result);
  }

  async getUiBootstrap(): Promise<UiBootstrap> {
    const boot = await this.contract.getUiBootstrap();
    return this.materializeRead('getUiBootstrap', boot);
  }

  async getUiFullBundle(userAddress: string): Promise<UiFullBundle | null> {
    try {
      const awaitedResult = await this.getUiFullBundlePaginated(userAddress, DEFAULT_PAGE_SIZE);
      return awaitedResult;
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
      console.error('NeverlandUiProvider.getUiFullBundleFromParts failed:', {
        error,
        contractAddress: this.contract.target,
        userAddress,
      });
      return null;
    }
  }

  async getUserEmissions(userAddress: string): Promise<EmissionData> {
    const result = await this.contract.getUserEmissions(userAddress);
    return this.materializeRead('getUserEmissions', result);
  }

  async getUserDashboard(userAddress: string): Promise<UserDashboardData> {
    return this.getUserDashboardWithPagination(userAddress, DEFAULT_PAGE_SIZE);
  }

  async getUserTokenCount(userAddress: string): Promise<number> {
    const count = await this.contract.getUserTokenCount(userAddress);
    const bn = ethers.getBigInt(count);
    return ethers.getNumber(bn);
  }

  /**
   * Walks every raw DustLock enumeration page for a user. Pages are compacted to live veNFTs, so
   * the cursor is the contract's `nextRawOffset`, never the number of tokens returned. `pageSize`
   * must be a positive safe integer. If a later page reverts or the cursor stops advancing, the
   * partial result is returned with `hasMore` set and `nextRawOffset` pointing at the page to
   * retry; a revert on the first page throws, since there is nothing to return. `requireComplete`
   * instead propagates every page error and checks stable live counts, aligned unique positions,
   * and terminal cardinality. Equal counts across calls do not establish a fixed snapshot or
   * guarantee unrelated per-asset reads resolved.
   */
  async getUserDashboardWithPagination(
    userAddress: string,
    pageSize = DEFAULT_PAGE_SIZE,
    options?: UiPaginationOptions,
  ): Promise<UserDashboardData> {
    const merged = emptyDashboard(userAddress);
    const strict = this.paginationState(pageSize, options);
    let offset = 0n;
    for (;;) {
      let page: UserDashboardData;
      try {
        // eslint-disable-next-line no-await-in-loop -- Preserve sequential enumeration/cursor reads, per-item fallback handling and the original request order.
        const result = await this.contract.getUserDashboard(
          userAddress,
          offset,
          ethers.getBigInt(pageSize),
        );
        page = this.materializeRead('getUserDashboard', result);
      } catch (error) {
        if (strict) throw error;
        // An empty first page would look like a user with no locks, so only later pages degrade.
        if (offset === 0n) throw error;
        console.warn('NeverlandUiProvider.getUserDashboard reverted', {
          offset,
          pageSize,
          userAddress,
          error,
        });
        merged.hasMore = true;
        merged.nextRawOffset = offset;
        break;
      }

      if (strict) this.validateDashboardPage(page, offset, strict);
      this.appendDashboardPage(merged, page);
      if (!page.hasMore) break;
      const next = page.nextRawOffset;
      if (next <= offset) break;
      offset = next;
    }

    this.recomputeDashboardTotals(merged);
    return merged;
  }

  /**
   * Fetches the full UI bundle, following the same raw-offset cursor as
   * {@link getUserDashboardWithPagination}. Global, market and price data come from the first page;
   * the unlock schedule is built per page by the contract, so it is concatenated across pages. If a
   * later page reverts, the pages already loaded are returned with `hasMore` set and
   * `nextRawOffset` pointing at the page to retry; a revert on the first page throws. `pageSize`
   * must be a positive safe integer. The optional `requireComplete` policy applies the same
   * ownership-cardinality checks as dashboard pagination.
   */
  async getUiFullBundlePaginated(
    userAddress: string,
    pageSize = DEFAULT_PAGE_SIZE,
    options?: UiPaginationOptions,
  ): Promise<UiFullBundle> {
    const user = emptyDashboard(userAddress);
    const unlockSchedule: UnlockSchedule = { unlockTimes: [], amounts: [], tokenIds: [] };
    let first: UiFullBundle | null = null;
    const strict = this.paginationState(pageSize, options);
    let offset = 0n;
    for (;;) {
      let page: UiFullBundle;
      try {
        // eslint-disable-next-line no-await-in-loop -- Preserve sequential enumeration/cursor reads, per-item fallback handling and the original request order.
        const result = await this.contract.getUiFullBundle(
          userAddress,
          offset,
          ethers.getBigInt(pageSize),
        );
        page = this.materializeRead('getUiFullBundle', result);
      } catch (error) {
        if (strict) throw error;
        // Without the first page there is no meta, market or price data to return.
        if (!first) throw error;

        console.warn('NeverlandUiProvider.getUiFullBundle reverted', {
          offset,
          pageSize,
          userAddress,
          error,
        });
        user.hasMore = true;
        user.nextRawOffset = offset;
        break;
      }

      if (strict) {
        this.validateDashboardPage(page.essential.user, offset, strict);
        this.validateUnlockSchedule(page.extended.unlockSchedule);
      }

      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing, logical-assignment-operators -- Preserve the existing first-page selection and falsy-default evaluation order. Retain the existing lookup/default write order and financial accumulator behavior.
      if (!first) first = page;
      this.appendDashboardPage(user, page.essential.user);
      unlockSchedule.unlockTimes.push(...page.extended.unlockSchedule.unlockTimes);
      unlockSchedule.amounts.push(...page.extended.unlockSchedule.amounts);
      unlockSchedule.tokenIds.push(...page.extended.unlockSchedule.tokenIds);
      if (!page.essential.user.hasMore) break;
      const next = page.essential.user.nextRawOffset;
      if (next <= offset) break;
      offset = next;
    }

    this.recomputeDashboardTotals(user);
    const head = first;
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
    const awaitedResult = await this.contract.getAllPrices();
    return this.materializeRead('getAllPrices', awaitedResult);
  }

  async getGlobalStats(): Promise<GlobalStats> {
    const awaitedResult = await this.contract.getGlobalStats();
    return this.materializeRead('getGlobalStats', awaitedResult);
  }

  async getMarketData(): Promise<MarketData> {
    const awaitedResult = await this.contract.getMarketData();
    return this.materializeRead('getMarketData', awaitedResult);
  }

  async getUserRewardsSummary(
    userAddress: string,
    rewardTokens: string[],
  ): Promise<UserRewardsSummary> {
    const awaitedResult = await this.contract.getUserRewardsSummary(userAddress, rewardTokens);
    return this.materializeRead('getUserRewardsSummary', awaitedResult);
  }

  async getNetworkData(): Promise<NetworkData> {
    const awaitedResult = await this.contract.getNetworkData();
    return this.materializeRead('getNetworkData', awaitedResult);
  }

  async getUnlockSchedule(userAddress: string): Promise<UnlockSchedule> {
    const result = await this.contract.getUnlockSchedule(userAddress);
    return this.materializeRead('getUnlockSchedule', result);
  }

  /**
   * Total DUST rewards and their USD value. Revenue rewards come from the per-token summaries;
   * pass `emissions` to include the user's per-user DUST emissions as well. Emissions whose read
   * did not resolve (`emissions.resolved` false) are left out of both totals rather than counted
   * as zero or partial amounts, and `emissionsIncluded` is then false; it is omitted when no
   * emissions are passed. The USD value is '0' when the DUST price row is unresolved.
   */
  calculateTotalRewardsUSD(
    rewardSummaries: RewardSummary[],
    priceData: PriceData,
    dustTokenAddress: string,
    emissions?: EmissionData,
  ): {
    totalRewards: string;
    totalRewardsUSD: string;
    /** Present only when `emissions` is passed: false when they were unresolved and left out. */
    emissionsIncluded?: boolean;
  } {
    const dust = dustTokenAddress.toLowerCase();
    let totalDustRewards = 0n;
    rewardSummaries.forEach(summary => {
      summary.rewardTokens.forEach((token, index) => {
        if (token.toLowerCase() === dust) {
          totalDustRewards += ethers.getBigInt(summary.revenueRewards[index] || 0n);
        }
      });
    });
    const emissionsIncluded = emissions ? emissions.resolved : undefined;
    if (emissions && emissionsIncluded) {
      emissions.rewardTokens.forEach((token, index) => {
        if (token.toLowerCase() === dust) {
          totalDustRewards += ethers.getBigInt(emissions.totalRewards[index] || 0n);
        }
      });
    }

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

    return emissionsIncluded === undefined
      ? { totalRewards: totalDustRewards.toString(), totalRewardsUSD }
      : { totalRewards: totalDustRewards.toString(), totalRewardsUSD, emissionsIncluded };
  }

  formatPortfolioValue(portfolioValueBN: bigint): string {
    const valueUSD = parseFloat(formatUnits(portfolioValueBN, 8));
    return valueUSD.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  formatDustAmount(dustAmountBN: bigint): string {
    const amount = parseFloat(formatUnits(dustAmountBN, 18));
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }

  private materializeRead<N extends UiReadMethod>(method: N, value: unknown): UiReadResult<N> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ParamType recursion uses the same canonical ABI as ethers; the return type is derived from that method's ABI outputs.
    return materializeContractResult(this.iface, method, value) as UiReadResult<N>;
  }

  /** Rejects a page size the contract cannot page with (0 would return an empty, final page). */
  private paginationState(pageSize: number, options?: UiPaginationOptions): PaginationState | null {
    if (!Number.isSafeInteger(pageSize) || pageSize <= 0)
      throw new Error('UI pagination requires a positive safe-integer page size');
    if (!options?.requireComplete) return null;
    return { rawTokenCount: null, tokenIds: new Set() };
  }

  private validateDashboardPage(
    page: UserDashboardData,
    offset: bigint,
    state: PaginationState,
  ): void {
    if (state.rawTokenCount !== null && page.rawTokenCount !== state.rawTokenCount)
      throw new Error('UI pagination live token count changed across pages');
    state.rawTokenCount = page.rawTokenCount;
    if (
      page.tokenIds.length !== page.locks.length ||
      page.tokenIds.length !== page.rewardSummaries.length
    )
      throw new Error('UI pagination position arrays are misaligned');
    for (const [index, tokenId] of page.tokenIds.entries()) {
      if (tokenId === 0n || state.tokenIds.has(tokenId))
        throw new Error('UI pagination returned a zero or duplicate token ID');
      const lock = page.locks[index];
      const summary = page.rewardSummaries[index];
      if (
        lock.tokenId !== tokenId ||
        summary.tokenId !== tokenId ||
        summary.rewardTokens.length !== summary.revenueRewards.length
      )
        throw new Error('UI pagination position rows are misaligned');
      state.tokenIds.add(tokenId);
    }

    if (page.hasMore) {
      if (page.nextRawOffset <= offset)
        throw new Error('UI pagination continuation cursor did not advance');
    } else if (
      page.nextRawOffset < page.rawTokenCount ||
      BigInt(state.tokenIds.size) !== page.rawTokenCount
    )
      throw new Error('UI pagination ended before every owned token was collected');
  }

  private validateUnlockSchedule(schedule: UnlockSchedule): void {
    if (
      schedule.tokenIds.length !== schedule.unlockTimes.length ||
      schedule.tokenIds.length !== schedule.amounts.length
    )
      throw new Error('UI pagination unlock schedule arrays are misaligned');
  }

  /** Copies one decoded page into `target`, which stays a plain mutable object. */
  private appendDashboardPage(target: UserDashboardData, page: UserDashboardData): void {
    target.tokenIds.push(...(page.tokenIds || []));
    target.locks.push(...(page.locks || []));
    target.rewardSummaries.push(...(page.rewardSummaries || []));
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
