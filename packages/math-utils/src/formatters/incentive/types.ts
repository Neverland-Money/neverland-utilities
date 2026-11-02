// From UiIncentiveDatProvider
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface ReservesIncentiveDataHumanized {
  underlyingAsset: string;
  aIncentiveData: IncentiveDataHumanized;
  vIncentiveData: IncentiveDataHumanized;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface UserReservesIncentivesDataHumanized {
  underlyingAsset: string;
  aTokenIncentivesUserData: UserIncentiveDataHumanized;
  vTokenIncentivesUserData: UserIncentiveDataHumanized;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface UserReserveCalculationData {
  scaledATokenBalance: string;
  scaledVariableDebt: string;
  reserve: {
    underlyingAsset: string;
    totalLiquidity: string;
    liquidityIndex: string;
    totalScaledVariableDebt: string;
    decimals: number;
  };
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface ReserveCalculationData {
  underlyingAsset: string;
  symbol: string;
  totalLiquidity: string;
  totalVariableDebt: string;
  formattedPriceInMarketReferenceCurrency: string;
  decimals: number;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface UserIncentiveDataHumanized {
  tokenAddress: string;
  incentiveControllerAddress: string;
  userRewardsInformation: UserRewardInfoHumanized[];
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface UserRewardInfoHumanized {
  rewardTokenSymbol: string;
  rewardOracleAddress: string;
  rewardTokenAddress: string;
  userUnclaimedRewards: string;
  tokenIncentivesUserIndex: string;
  rewardPriceFeed: string;
  priceFeedDecimals: number;
  rewardTokenDecimals: number;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface IncentiveDataHumanized {
  tokenAddress: string;
  incentiveControllerAddress: string;
  rewardsTokenInformation: RewardInfoHumanized[];
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface RewardInfoHumanized {
  rewardTokenSymbol: string;
  rewardTokenAddress: string;
  rewardOracleAddress: string;
  emissionPerSecond: string;
  incentivesLastUpdateTimestamp: number;
  tokenIncentivesIndex: string;
  emissionEndTimestamp: number;
  rewardPriceFeed: string;
  rewardTokenDecimals: number;
  precision: number;
  priceFeedDecimals: number;
}
