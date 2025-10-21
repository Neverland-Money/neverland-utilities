export interface VeDustNFTData {
  tokenId: number;
  votingPower: string;
  lockedAmount: string;
  rewardAmount: string;
  rewardAmountUSD: string;
  hasRewards: boolean;
}

export interface VeDustRevenueData {
  totalRevenueUSD: string;
  rewardTokens: string[];
  rewardAmounts: string[];
  selfRepayEnabled: boolean;
  selfRepayTokenIds: number[];
  votingPower: string;
  lockedAmount: string;
  veNftCount: number;
  veNftIds: number[];
  veNftData?: VeDustNFTData[];
  individualNftRewards: { [tokenId: number]: string[] };
  individualNftVotingPower: { [tokenId: number]: string };
  individualNftLockedAmounts: { [tokenId: number]: string };
  individualNftEndTimes: { [tokenId: number]: number };
  pendingRewardsUSD: string;
  nextEpochTimestamp: number;
  totalVeDustSupply: string;
  selfRepayVotingPower: string;
  userRevenueShare: string;
  weeklyRevenueUSD: string;
  formattedRevenueUSD: string;
  hasRewards: boolean;
  hasVeNfts: boolean;
}

export interface VeDustRevenueHelperContext {
  provider: import('ethers').providers.Provider;
  chainId: number;
  revenueAddress: string;
  dustLockAddress: string;
}


