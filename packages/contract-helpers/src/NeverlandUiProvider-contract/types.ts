export interface UserDashboardData {
  user: string;
  tokenIds: import('ethers').BigNumber[];
  locks: LockInfo[];
  rewardSummaries: RewardSummary[];
  totalVotingPower: import('ethers').BigNumber;
  totalLockedAmount: import('ethers').BigNumber;
}

export interface LockInfo {
  tokenId: import('ethers').BigNumber;
  amount: import('ethers').BigNumber;
  end: import('ethers').BigNumber;
  effectiveStart: import('ethers').BigNumber;
  isPermanent: boolean;
  votingPower: import('ethers').BigNumber;
  rewardReceiver: string;
  owner: string;
}

export interface RewardSummary {
  tokenId: import('ethers').BigNumber;
  revenueRewards: import('ethers').BigNumber[];
  emissionRewards: import('ethers').BigNumber[];
  rewardTokens: string[];
  totalEarned: import('ethers').BigNumber[];
}

export interface PriceData {
  tokens: string[];
  prices: import('ethers').BigNumber[];
  lastUpdated: import('ethers').BigNumber[];
  isStale: boolean[];
}

export interface GlobalStats {
  totalSupply: import('ethers').BigNumber;
  totalVotingPower: import('ethers').BigNumber;
  permanentLockBalance: import('ethers').BigNumber;
  rewardTokens: string[];
  totalRewardsPerToken: import('ethers').BigNumber[];
  epoch: import('ethers').BigNumber;
  activeTokenCount: import('ethers').BigNumber;
}

export interface MarketData {
  rewardTokens: string[];
  rewardTokenBalances: import('ethers').BigNumber[];
  distributionRates: import('ethers').BigNumber[];
  nextEpochTimestamp: import('ethers').BigNumber;
  currentEpoch: import('ethers').BigNumber;
  epochRewards: import('ethers').BigNumber[];
  nextEpochRewards: import('ethers').BigNumber[];
  totalValueLockedUSD: import('ethers').BigNumber;
}

export interface NetworkData {
  currentBlock: import('ethers').BigNumber;
  currentTimestamp: import('ethers').BigNumber;
  gasPrice: import('ethers').BigNumber;
}

export interface OptimalClaimResult {
  tokenIds: import('ethers').BigNumber[];
  totalGasOptimized: import('ethers').BigNumber;
}

export interface UnlockSchedule {
  unlockTimes: import('ethers').BigNumber[];
  amounts: import('ethers').BigNumber[];
  tokenIds: import('ethers').BigNumber[];
}

export interface ProtocolMeta {
  dustLock: string;
  revenueReward: string;
  dustRewardsController: string;
  dustOracle: string;
  earlyWithdrawPenalty: import('ethers').BigNumber;
  minLockAmount: import('ethers').BigNumber;
  rewardDistributor: string;
  revenueRewardTokens: string[];
  emissionRewardTokens: string[];
  emissionStrategies: string[];
}

export interface EmissionData {
  rewardTokens: string[];
  totalRewards: import('ethers').BigNumber[];
}

export interface EssentialUserView {
  user: UserDashboardData;
  globalStats: GlobalStats;
  emissions: EmissionData;
  marketData: MarketData;
}

export interface ExtendedUserView {
  unlockSchedule: UnlockSchedule;
  rewardsSummary: {
    totalRevenue: import('ethers').BigNumber[];
    totalEmissions: import('ethers').BigNumber[];
    totalHistorical: import('ethers').BigNumber[];
  };
  allPrices: PriceData;
}

export interface UserEmissionAssetBreakdown {
  assets: string[];
  amounts: import('ethers').BigNumber[];
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
