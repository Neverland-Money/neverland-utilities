import { ethers } from 'ethers';
export interface BaseContractHelperConfig {
  provider: ethers.Provider;
  contractAddress: string;
}
export interface RewardData {
  index: bigint;
  emissionPerSecond: bigint;
  lastUpdateTimestamp: bigint;
  distributionEnd: bigint;
}
export interface UserRewardsResult {
  rewardTokens: string[];
  unclaimedAmounts: bigint[];
}
export interface DustIncentiveData {
  incentiveControllerAddress: string;
  rewardTokenAddress: string;
  rewardTokenSymbol: string;
  rewardTokenDecimals: number;
  precision: number;
  priceFeed: string;
  priceFeedTimestamp: number;
  priceFeedDecimals: number;
  emissionPerSecond: string;
  incentivesLastUpdateTimestamp: number;
  tokenIncentivesIndex: string;
  emissionEndTimestamp: number;
  rewardPriceFeed: string;
  distributionEnd: number;
  incentiveAPR: string;
}
export interface AssetRewardBreakdown {
  assetAddress: string;
  assetSymbol: string;
  assetType: 'aToken' | 'variableDebtToken';
  rewardAmount: string;
  rewardPercentage: number;
}
export interface UserRewardsData {
  rewardTokens: string[];
  unclaimedAmounts: string[];
  totalRewards: string;
  totalRewardsUSD: string;
  assetBreakdown?: AssetRewardBreakdown[];
}
export interface RewardDataHumanized {
  index: string;
  emissionPerSecond: string;
  lastUpdateTimestamp: number;
  distributionEnd: number;
}
export interface IncentiveDataHumanized {
  assetAddress: string;
  rewardTokenAddress: string;
  rewardTokenSymbol: string;
  rewardTokenDecimals: number;
  emissionPerSecond: string;
  lastUpdateTimestamp: number;
  distributionEnd: number;
  incentiveAPR: string;
}
