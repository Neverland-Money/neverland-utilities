import { dustRewardsControllerAbi } from '@neverland-money/contract-types';
import { annualizeEmissionRaw, emissionAprPercent } from '@neverland-money/math-utils';
import type { Abi } from 'abitype';
import { type Contract, ethers, isAddress } from 'ethers';
import { asAbiContract, decodeAbiResult, type AbiContract } from '../commons/abi-types';
import { AbiBaseService } from '../commons/base-service';
import type { IncentiveDataHumanized, RewardData, UserRewardsResult } from './types';
const rewardsControllerIface = new ethers.Interface(dustRewardsControllerAbi);
/**
 * Helper class for interacting with the DustRewardsController contract
 * Provides typed methods for fetching reward data, user rewards, and claiming
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface DustIncentiveProviderContext {
  dustIncentiveProviderAddress: string;
  provider: ethers.Provider;
  chainId?: number;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface DustIncentiveProviderInterface {
  getRewardsData: (asset: string, reward: string) => Promise<RewardData>;
  getRewardsDataHumanized: (
    asset: string,
    reward: string,
    options?: {
      tvlUSD?: number;
      rewardPriceUSD?: number;
      decimals?: number;
    },
  ) => Promise<IncentiveDataHumanized>;
  getAllUserRewards: (assets: string[], user: string) => Promise<UserRewardsResult>;
  getUserRewards: (assets: string[], user: string, reward: string) => Promise<bigint>;
  isEmissionsActive: (asset: string, reward: string, currentTimestamp?: number) => Promise<boolean>;
}
export class DustIncentiveProvider
  extends AbiBaseService<Abi>
  implements DustIncentiveProviderInterface
{
  /**
   * Calculate annual emissions in token units
   * @param emissionPerSecond Emissions per second
   * @param decimals Token decimals (default 18)
   * @returns Annual emissions as a formatted string
   */
  static calculateAnnualEmissions(emissionPerSecond: bigint, decimals = 18): string {
    const annualEmissions = annualizeEmissionRaw(emissionPerSecond);
    return ethers.formatUnits(annualEmissions, decimals);
  }

  /**
   * Calculate emission APR given TVL and reward price
   * @param emissionPerSecond Emissions per second
   * @param rewardPriceUSD Price of reward token in USD
   * @param tvlUSD Total value locked in USD
   * @param decimals Token decimals (default 18)
   * @returns APR as a percentage string
   */
  static calculateEmissionAPR(
    emissionPerSecond: bigint,
    rewardPriceUSD: number,
    tvlUSD: number,
    decimals = 18,
  ): string {
    if (tvlUSD <= 0) return '0';
    const annualEmissionsFormatted = parseFloat(
      DustIncentiveProvider.calculateAnnualEmissions(emissionPerSecond, decimals),
    );
    return emissionAprPercent(annualEmissionsFormatted, rewardPriceUSD, tvlUSD);
  }

  public readonly address: string;
  private readonly contract: AbiContract<
    typeof dustRewardsControllerAbi,
    | 'getAllUserRewards'
    | 'getRewardsData'
    | 'getRewardsList'
    | 'getUserAccruedRewards'
    | 'getUserAssetIndex'
    | 'getUserRewards'
  >;

  constructor(context: DustIncentiveProviderContext) {
    if (!isAddress(context.dustIncentiveProviderAddress)) {
      throw new Error('contract address is not valid');
    }

    super(context.provider, dustRewardsControllerAbi, context.dustIncentiveProviderAddress);
    this.address = context.dustIncentiveProviderAddress;
    this.contract = asAbiContract<
      typeof dustRewardsControllerAbi,
      | 'getAllUserRewards'
      | 'getRewardsData'
      | 'getRewardsList'
      | 'getUserAccruedRewards'
      | 'getUserAssetIndex'
      | 'getUserRewards'
    >(this.getContractInstance(context.dustIncentiveProviderAddress), dustRewardsControllerAbi);
  }

  /**
   * Get rewards configuration for a specific asset and reward token
   * @param asset The asset address (aToken or variableDebtToken)
   * @param reward The reward token address (DUST)
   * @returns RewardData with index, emissions, and distribution info
   */
  async getRewardsData(asset: string, reward: string): Promise<RewardData> {
    if (!isAddress(asset)) throw new Error('asset address is not valid');
    if (!isAddress(reward)) throw new Error('reward address is not valid');
    // The ABI leaves these four outputs unnamed, so decode them by position.
    const [index, emissionPerSecond, lastUpdateTimestamp, distributionEnd] =
      await this.contract.getRewardsData(asset, reward);
    return { index, emissionPerSecond, lastUpdateTimestamp, distributionEnd };
  }

  public async getRewardsDataHumanized(
    asset: string,
    reward: string,
    options?: {
      tvlUSD?: number;
      rewardPriceUSD?: number;
      decimals?: number;
    },
  ): Promise<IncentiveDataHumanized> {
    const data = await this.getRewardsData(asset, reward);
    const decimals = options?.decimals ?? 18;
    const rewardPriceUSD = options?.rewardPriceUSD ?? 0;
    const tvlUSD = options?.tvlUSD ?? 0;
    const incentiveAPR =
      tvlUSD > 0 && rewardPriceUSD > 0
        ? DustIncentiveProvider.calculateEmissionAPR(
            data.emissionPerSecond,
            rewardPriceUSD,
            tvlUSD,
            decimals,
          )
        : '0';
    return {
      assetAddress: asset,
      rewardTokenAddress: reward,
      rewardTokenSymbol: 'DUST',
      rewardTokenDecimals: decimals,
      emissionPerSecond: data.emissionPerSecond.toString(),
      lastUpdateTimestamp: ethers.getNumber(data.lastUpdateTimestamp),
      distributionEnd: ethers.getNumber(data.distributionEnd),
      incentiveAPR,
    };
  }

  /**
   * Get all rewards for a user across multiple assets
   * @param assets Array of asset addresses (aTokens and variableDebtTokens)
   * @param user User address
   * @returns Array of reward tokens and their unclaimed amounts
   */
  async getAllUserRewards(assets: string[], user: string): Promise<UserRewardsResult> {
    if (!isAddress(user)) throw new Error('User address is not a valid ethereum address');
    const [rewardTokens, unclaimedAmounts] = await this.contract.getAllUserRewards(assets, user);
    return {
      rewardTokens,
      unclaimedAmounts,
    };
  }

  /**
   * Get user rewards for specific assets and reward token
   * @param assets Array of asset addresses
   * @param user User address
   * @param reward Reward token address
   * @returns Total unclaimed rewards for the specified reward token
   */
  async getUserRewards(assets: string[], user: string, reward: string): Promise<bigint> {
    if (!isAddress(user)) throw new Error('User address is not a valid ethereum address');
    const awaitedResult = await this.contract.getUserRewards(assets, user, reward);
    return awaitedResult;
  }

  /**
   * Get accrued rewards for a specific user and reward token
   * @param user User address
   * @param reward Reward token address
   * @returns Accrued rewards amount
   */
  async getUserAccruedRewards(user: string, reward: string): Promise<bigint> {
    const awaitedResult = await this.contract.getUserAccruedRewards(user, reward);
    return awaitedResult;
  }

  /**
   * Get the list of all reward tokens configured in the controller
   * @returns Array of reward token addresses
   */
  async getRewardsList(): Promise<string[]> {
    const awaitedResult = await this.contract.getRewardsList();
    return awaitedResult;
  }

  /**
   * Get a user's reward index for a specific asset
   * @param user User address
   * @param asset Asset address
   * @param reward Reward token address
   * @returns The user's last-synced reward index for the asset
   */
  async getUserAssetIndex(user: string, asset: string, reward: string): Promise<bigint> {
    const awaitedResult = await this.contract.getUserAssetIndex(user, asset, reward);
    return awaitedResult;
  }

  /**
   * Check if emissions are currently active for an asset
   * @param asset Asset address
   * @param reward Reward token address
   * @param currentTimestamp Current block timestamp (optional, will fetch if not provided)
   * @returns True if emissions are active
   */
  async isEmissionsActive(
    asset: string,
    reward: string,
    currentTimestamp?: number,
  ): Promise<boolean> {
    const rewardData = await this.getRewardsData(asset, reward);
    // Get current timestamp if not provided
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Zero and NaN deliberately retain the historical provider/clock timestamp fallback.
    const timestamp = currentTimestamp || (await this.provider.getBlock('latest'))?.timestamp;
    if (timestamp === undefined) throw new Error('Latest block is unavailable');
    // Emissions are active if:
    // 1. Current time is before distributionEnd
    // 2. emissionPerSecond is greater than 0
    return (
      ethers.getNumber(rewardData.distributionEnd) > timestamp &&
      !(rewardData.emissionPerSecond === 0n)
    );
  }

  /**
   * Get the underlying ethers contract instance connected to a signer
   * @param signer Ethers signer for write operations
   * @returns Contract instance with signer
   */
  getContractWithSigner(signer: ethers.JsonRpcSigner): Contract {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Connecting this ABI-backed ethers Contract preserves its Contract runtime subclass and the existing public return type.
    return this.contract.connect(signer) as Contract;
  }

  /**
   * Get the underlying ethers contract instance
   * For advanced usage or calling methods not wrapped by this helper
   */
  getContract(): Contract {
    return this.contract;
  }
}
// ---------- Multicall helpers (static) ----------
// eslint-disable-next-line @typescript-eslint/no-namespace -- This public namespace adds runtime encoder/decoder functions to the exported class; keep that object and declaration merging.
export namespace DustIncentiveProvider {
  /**
   * Encode getRewardsData(asset, reward) for multicall
   */
  export function encodeGetRewardsData(
    controller: string,
    asset: string,
    reward: string,
  ): {
    to: string;
    data: string;
  } {
    return {
      to: controller,
      data: rewardsControllerIface.encodeFunctionData('getRewardsData', [asset, reward]),
    };
  }

  /**
   * Decode getRewardsData result into RewardData
   */
  export function decodeGetRewardsData(returnData: string): RewardData {
    const [index, emissionPerSecond, lastUpdateTimestamp, distributionEnd] = decodeAbiResult(
      rewardsControllerIface,
      dustRewardsControllerAbi,
      'getRewardsData',
      returnData,
    );
    return { index, emissionPerSecond, lastUpdateTimestamp, distributionEnd };
  }

  /**
   * Encode getUserRewards(assets[], user, reward) for multicall
   */
  export function encodeGetUserRewards(
    controller: string,
    assets: string[],
    user: string,
    reward: string,
  ): {
    to: string;
    data: string;
  } {
    return {
      to: controller,
      data: rewardsControllerIface.encodeFunctionData('getUserRewards', [assets, user, reward]),
    };
  }

  /**
   * Decode getUserRewards result into bigint
   */
  export function decodeGetUserRewards(returnData: string): bigint {
    const [amount] = decodeAbiResult(
      rewardsControllerIface,
      dustRewardsControllerAbi,
      'getUserRewards',
      returnData,
    );
    return amount;
  }
}
