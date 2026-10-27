import { type ethers } from 'ethers';
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface BaseContractHelperConfig {
  provider: ethers.Provider;
  contractAddress: string;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface RewardData {
  index: bigint;
  emissionPerSecond: bigint;
  lastUpdateTimestamp: bigint;
  distributionEnd: bigint;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface UserRewardsResult {
  rewardTokens: string[];
  unclaimedAmounts: bigint[];
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
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
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface AssetRewardBreakdown {
  assetAddress: string;
  assetSymbol: string;
  assetType: 'aToken' | 'variableDebtToken';
  rewardAmount: string;
  rewardPercentage: number;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface UserRewardsData {
  rewardTokens: string[];
  unclaimedAmounts: string[];
  totalRewards: string;
  totalRewardsUSD: string;
  assetBreakdown?: AssetRewardBreakdown[];
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface RewardDataHumanized {
  index: string;
  emissionPerSecond: string;
  lastUpdateTimestamp: number;
  distributionEnd: number;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
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
