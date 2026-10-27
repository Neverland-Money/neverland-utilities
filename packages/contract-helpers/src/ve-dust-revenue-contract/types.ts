import type { Provider } from 'ethers';
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface VeDustNFTData {
  tokenId: number;
  votingPower: string;
  lockedAmount: string;
  rewardAmount: string;
  rewardAmountUSD: string;
  hasRewards: boolean;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
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
  individualNftRewards: Record<number, string[]>;
  individualNftVotingPower: Record<number, string>;
  individualNftLockedAmounts: Record<number, string>;
  individualNftEndTimes: Record<number, number>;
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
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface VeDustRevenueHelperContext {
  provider: Provider;
  chainId: number;
  revenueAddress: string;
  dustLockAddress: string;
}
