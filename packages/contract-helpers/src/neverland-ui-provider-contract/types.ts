// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface PoolMarket {
  /** The market's pool address provider. Key on this, never on `marketId` or list position. */
  provider: string;
  /** Display-only label from the market's own `getMarketId()`, or '' if that read failed. */
  marketId: string;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface UserDashboardData {
  user: string;
  tokenIds: bigint[];
  locks: LockInfo[];
  rewardSummaries: RewardSummary[];
  totalVotingPower: bigint;
  totalLockedAmount: bigint;
  /** Live owned-token cardinality from `DustLock.balanceOf(user)`, not the sparse raw-index bound. */
  rawTokenCount: bigint;
  /** Raw offset to pass as the next call's `offset`. */
  nextRawOffset: bigint;
  /** True when the page left live entries or sparse raw slots unscanned. */
  hasMore: boolean;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface LockInfo {
  tokenId: bigint;
  amount: bigint;
  end: bigint;
  effectiveStart: bigint;
  isPermanent: boolean;
  votingPower: bigint;
  rewardReceiver: string;
  owner: string;
}
/** Emission rewards are per user, not per token: use `getUserEmissions` for those. */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface RewardSummary {
  tokenId: bigint;
  revenueRewards: bigint[];
  rewardTokens: string[];
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface PriceData {
  tokens: string[];
  /** USD prices, 8 decimals. */
  prices: bigint[];
  lastUpdated: bigint[];
  /** Bit i set means row i resolved. Only the first 256 rows are representable. */
  resolvedMask: bigint;
  /** True when the DUST price (row 0) came from the live oracle path. */
  dustPriceFromOracle: boolean;
  asOfBlock: bigint;
  asOfTimestamp: bigint;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface GlobalStats {
  totalSupply: bigint;
  totalVotingPower: bigint;
  permanentLockBalance: bigint;
  rewardTokens: string[];
  totalRewardsPerToken: bigint[];
  epoch: bigint;
  activeTokenCount: bigint;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface MarketData {
  rewardTokens: string[];
  rewardTokenBalances: bigint[];
  distributionRates: bigint[];
  nextEpochTimestamp: bigint;
  currentEpoch: bigint;
  epochRewards: bigint[];
  nextEpochRewards: bigint[];
  totalValueLockedUSD: bigint;
  followingEpochRewards: bigint[];
  totalValueLockedUSDResolved: boolean;
  asOfBlock: bigint;
  asOfTimestamp: bigint;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface NetworkData {
  currentBlock: bigint;
  currentTimestamp: bigint;
  gasPrice: bigint;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface UnlockSchedule {
  unlockTimes: bigint[];
  amounts: bigint[];
  tokenIds: bigint[];
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface ProtocolMeta {
  dustLock: string;
  revenueReward: string;
  dustRewardsController: string;
  dustOracle: string;
  earlyWithdrawPenalty: bigint;
  minLockAmount: bigint;
  rewardDistributor: string;
  revenueRewardTokens: string[];
  emissionRewardTokens: string[];
  emissionStrategies: string[];
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface EmissionData {
  rewardTokens: string[];
  totalRewards: bigint[];
  /** False only when the aggregate emissions read failed. */
  resolved: boolean;
  asOfBlock: bigint;
  asOfTimestamp: bigint;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface EssentialUserView {
  user: UserDashboardData;
  globalStats: GlobalStats;
  emissions: EmissionData;
  marketData: MarketData;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface ExtendedUserView {
  unlockSchedule: UnlockSchedule;
  allPrices: PriceData;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface UserRewardsSummary {
  totalRevenue: bigint[];
  totalEmissions: bigint[];
  /** Bit j set means `totalRevenue[j]` is trustworthy, aligned with the `rewardTokens` argument. */
  revenueResolvedMask: bigint;
  /** Bit j set means `totalEmissions[j]` is trustworthy, aligned with the `rewardTokens` argument. */
  emissionsResolvedMask: bigint;
  asOfBlock: bigint;
  asOfTimestamp: bigint;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface UserEmissionAsset {
  asset: string;
  amount: bigint;
  symbol: string;
  isDebt: boolean;
  /** False means `amount` defaulted to 0 because this asset's read failed. */
  resolved: boolean;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface UserEmissionBreakdown {
  breakdown: UserEmissionAsset[];
  /** False means at least one registered pool's asset list could not be enumerated. */
  enumerationResolved: boolean;
}
export type DecodedUserEmissionBreakdown = {
  assets: string[];
  amounts: bigint[];
  symbols: string[] | null;
  sides: boolean[] | null;
  resolved: boolean[] | null;
  enumerationResolved: boolean | null;
};
export type UiPaginationOptions = {
  /**
   * Reject page failures, inconsistent position metadata, or incomplete owned-token cardinality.
   * Equal live counts across calls do not establish a fixed snapshot or unrelated asset resolution.
   */
  requireComplete?: boolean;
};
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface UiBootstrap {
  meta: ProtocolMeta;
  globalStats: GlobalStats;
  marketData: MarketData;
  allPrices: PriceData;
  network: NetworkData;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface UiFullBundle {
  meta: ProtocolMeta;
  essential: EssentialUserView;
  extended: ExtendedUserView;
  network: NetworkData;
}
