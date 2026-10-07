import type { BigNumber } from 'ethers';

export interface PoolMarket {
  /** The market's pool address provider. Key on this, never on `marketId` or list position. */
  provider: string;
  /** Display-only label from the market's own `getMarketId()`, or '' if that read failed. */
  marketId: string;
}

export interface UserDashboardData {
  user: string;
  tokenIds: BigNumber[];
  locks: LockInfo[];
  rewardSummaries: RewardSummary[];
  totalVotingPower: BigNumber;
  totalLockedAmount: BigNumber;
  /** Raw `DustLock.balanceOf(user)` enumeration length at query time. */
  rawTokenCount: BigNumber;
  /** Raw offset to pass as the next call's `offset`. */
  nextRawOffset: BigNumber;
  /** True when the page left live entries or sparse raw slots unscanned. */
  hasMore: boolean;
}

export interface LockInfo {
  tokenId: BigNumber;
  amount: BigNumber;
  end: BigNumber;
  effectiveStart: BigNumber;
  isPermanent: boolean;
  votingPower: BigNumber;
  rewardReceiver: string;
  owner: string;
}

/** Emission rewards are per user, not per token: use `getUserEmissions` for those. */
export interface RewardSummary {
  tokenId: BigNumber;
  revenueRewards: BigNumber[];
  rewardTokens: string[];
}

export interface PriceData {
  tokens: string[];
  /** USD prices, 8 decimals. */
  prices: BigNumber[];
  lastUpdated: BigNumber[];
  /** Bit i set means row i resolved. Only the first 256 rows are representable. */
  resolvedMask: BigNumber;
  /** True when the DUST price (row 0) came from the live oracle path. */
  dustPriceFromOracle: boolean;
  asOfBlock: BigNumber;
  asOfTimestamp: BigNumber;
}

export interface GlobalStats {
  totalSupply: BigNumber;
  totalVotingPower: BigNumber;
  permanentLockBalance: BigNumber;
  rewardTokens: string[];
  totalRewardsPerToken: BigNumber[];
  epoch: BigNumber;
  activeTokenCount: BigNumber;
}

export interface MarketData {
  rewardTokens: string[];
  rewardTokenBalances: BigNumber[];
  distributionRates: BigNumber[];
  nextEpochTimestamp: BigNumber;
  currentEpoch: BigNumber;
  epochRewards: BigNumber[];
  nextEpochRewards: BigNumber[];
  totalValueLockedUSD: BigNumber;
  followingEpochRewards: BigNumber[];
  totalValueLockedUSDResolved: boolean;
  asOfBlock: BigNumber;
  asOfTimestamp: BigNumber;
}

export interface NetworkData {
  currentBlock: BigNumber;
  currentTimestamp: BigNumber;
  gasPrice: BigNumber;
}

export interface UnlockSchedule {
  unlockTimes: BigNumber[];
  amounts: BigNumber[];
  tokenIds: BigNumber[];
}

export interface ProtocolMeta {
  dustLock: string;
  revenueReward: string;
  dustRewardsController: string;
  dustOracle: string;
  earlyWithdrawPenalty: BigNumber;
  minLockAmount: BigNumber;
  rewardDistributor: string;
  revenueRewardTokens: string[];
  emissionRewardTokens: string[];
  emissionStrategies: string[];
}

export interface EmissionData {
  rewardTokens: string[];
  totalRewards: BigNumber[];
  /** False only when the aggregate emissions read failed. */
  resolved: boolean;
  asOfBlock: BigNumber;
  asOfTimestamp: BigNumber;
}

export interface EssentialUserView {
  user: UserDashboardData;
  globalStats: GlobalStats;
  emissions: EmissionData;
  marketData: MarketData;
}

export interface ExtendedUserView {
  unlockSchedule: UnlockSchedule;
  allPrices: PriceData;
}

export interface UserRewardsSummary {
  totalRevenue: BigNumber[];
  totalEmissions: BigNumber[];
  /** Bit j set means `totalRevenue[j]` is trustworthy, aligned with the `rewardTokens` argument. */
  revenueResolvedMask: BigNumber;
  /** Bit j set means `totalEmissions[j]` is trustworthy, aligned with the `rewardTokens` argument. */
  emissionsResolvedMask: BigNumber;
  asOfBlock: BigNumber;
  asOfTimestamp: BigNumber;
}

export interface UserEmissionAsset {
  asset: string;
  amount: BigNumber;
  symbol: string;
  isDebt: boolean;
  /** False means `amount` defaulted to 0 because this asset's read failed. */
  resolved: boolean;
}

export interface UserEmissionBreakdown {
  breakdown: UserEmissionAsset[];
  /** False means at least one registered pool's asset list could not be enumerated. */
  enumerationResolved: boolean;
}

export interface UiBootstrap {
  meta: ProtocolMeta;
  globalStats: GlobalStats;
  marketData: MarketData;
  allPrices: PriceData;
  network: NetworkData;
}

export interface UiFullBundle {
  meta: ProtocolMeta;
  essential: EssentialUserView;
  extended: ExtendedUserView;
  network: NetworkData;
}
