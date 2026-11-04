import { uiIncentiveDataProviderV3Abi } from '@neverland-money/contract-types';
import { getAddress, getNumber } from 'ethers';
import { AbiBaseService } from '../commons/base-service';
import type {
  LendingIncentiveDataHumanized,
  UserIncentiveDataHumanized,
} from '../commons/incentive-types';
import type { Options, ReservesHelperInput, UserReservesHelperInput } from '../commons/read-types';
import type {
  FullReservesIncentiveData,
  ReservesIncentiveData,
  StableReservesIncentiveDataHumanized,
  StableUserReservesIncentivesDataHumanized,
  UiIncentiveDataProviderContext,
  UserReservesIncentiveData,
} from './types';
export type * from './types';

function abiAddress(address: string): `0x${string}` {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- getAddress validates and canonicalizes the address before ABI encoding.
  return getAddress(address) as `0x${string}`;
}

function humanizeIncentive(
  data: ReservesIncentiveData[number]['aIncentiveData'],
): LendingIncentiveDataHumanized {
  return {
    tokenAddress: data.tokenAddress,
    incentiveControllerAddress: data.incentiveControllerAddress,
    rewardsTokenInformation: data.rewardsTokenInformation.map(reward => ({
      rewardTokenSymbol: reward.rewardTokenSymbol,
      rewardTokenAddress: reward.rewardTokenAddress,
      rewardOracleAddress: reward.rewardOracleAddress,
      emissionPerSecond: reward.emissionPerSecond.toString(),
      incentivesLastUpdateTimestamp: getNumber(reward.incentivesLastUpdateTimestamp),
      tokenIncentivesIndex: reward.tokenIncentivesIndex.toString(),
      emissionEndTimestamp: getNumber(reward.emissionEndTimestamp),
      rewardPriceFeed: reward.rewardPriceFeed.toString(),
      rewardTokenDecimals: getNumber(reward.rewardTokenDecimals),
      precision: getNumber(reward.precision),
      priceFeedDecimals: getNumber(reward.priceFeedDecimals),
    })),
  };
}

function humanizeUserIncentive(
  data: UserReservesIncentiveData[number]['aTokenIncentivesUserData'],
): UserIncentiveDataHumanized {
  return {
    tokenAddress: data.tokenAddress,
    incentiveControllerAddress: data.incentiveControllerAddress,
    userRewardsInformation: data.userRewardsInformation.map(reward => ({
      rewardTokenSymbol: reward.rewardTokenSymbol,
      rewardOracleAddress: reward.rewardOracleAddress,
      rewardTokenAddress: reward.rewardTokenAddress,
      userUnclaimedRewards: reward.userUnclaimedRewards.toString(),
      tokenIncentivesUserIndex: reward.tokenIncentivesUserIndex.toString(),
      rewardPriceFeed: reward.rewardPriceFeed.toString(),
      priceFeedDecimals: getNumber(reward.priceFeedDecimals),
      rewardTokenDecimals: getNumber(reward.rewardTokenDecimals),
    })),
  };
}

/** Ethers 6 incentive reads for the lending 1.1 UI provider; humanized amounts stay in raw units. */
export class UiIncentiveDataProvider extends AbiBaseService<typeof uiIncentiveDataProviderV3Abi> {
  private readonly chainId: number;

  public constructor(context: UiIncentiveDataProviderContext) {
    super(
      context.provider,
      uiIncentiveDataProviderV3Abi,
      getAddress(context.uiIncentiveDataProviderAddress),
    );
    if (!Number.isSafeInteger(context.chainId) || context.chainId < 0) {
      throw new RangeError('chainId must be a nonnegative safe integer');
    }

    this.chainId = context.chainId;
  }

  public async getReservesIncentivesData(
    { lendingPoolAddressProvider }: ReservesHelperInput,
    options?: Options,
  ): Promise<ReservesIncentiveData> {
    return this.readContract(
      this.defaultAddress!,
      'getReservesIncentivesData',
      [abiAddress(lendingPoolAddressProvider)],
      options,
    );
  }

  public async getUserReservesIncentivesData(
    { lendingPoolAddressProvider, user }: UserReservesHelperInput,
    options?: Options,
  ): Promise<UserReservesIncentiveData> {
    return this.readContract(
      this.defaultAddress!,
      'getUserReservesIncentivesData',
      [abiAddress(lendingPoolAddressProvider), abiAddress(user)],
      options,
    );
  }

  public async getFullReservesIncentiveData(
    { lendingPoolAddressProvider, user }: UserReservesHelperInput,
    options?: Options,
  ): Promise<FullReservesIncentiveData> {
    return this.readContract(
      this.defaultAddress!,
      'getFullReservesIncentiveData',
      [abiAddress(lendingPoolAddressProvider), abiAddress(user)],
      options,
    );
  }

  public async getReservesIncentivesDataHumanized(
    args: ReservesHelperInput,
    options?: Options,
  ): Promise<StableReservesIncentiveDataHumanized[]> {
    const rows = await this.getReservesIncentivesData(args, options);
    return rows.map(row => ({
      id: `${this.chainId}-${row.underlyingAsset}-${getAddress(args.lendingPoolAddressProvider)}`.toLowerCase(),
      underlyingAsset: row.underlyingAsset.toLowerCase(),
      aIncentiveData: humanizeIncentive(row.aIncentiveData),
      vIncentiveData: humanizeIncentive(row.vIncentiveData),
      sIncentiveData: humanizeIncentive(row.sIncentiveData),
    }));
  }

  public async getUserReservesIncentivesDataHumanized(
    args: UserReservesHelperInput,
    options?: Options,
  ): Promise<StableUserReservesIncentivesDataHumanized[]> {
    const rows = await this.getUserReservesIncentivesData(args, options);
    return rows.map(row => ({
      id: `${this.chainId}-${getAddress(args.user)}-${row.underlyingAsset}-${getAddress(args.lendingPoolAddressProvider)}`.toLowerCase(),
      underlyingAsset: row.underlyingAsset.toLowerCase(),
      aTokenIncentivesUserData: humanizeUserIncentive(row.aTokenIncentivesUserData),
      vTokenIncentivesUserData: humanizeUserIncentive(row.vTokenIncentivesUserData),
      sTokenIncentivesUserData: humanizeUserIncentive(row.sTokenIncentivesUserData),
    }));
  }
}
