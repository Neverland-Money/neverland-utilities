import { Contract, providers, BigNumber, utils } from 'ethers';
import { isAddress } from 'ethers/lib/utils';
import { dustRewardsControllerAbi } from '@neverland-money/contract-types';
import type { RewardData, UserRewardsResult } from './types';

/**
 * Helper class for interacting with the DustRewardsController contract
 * Provides typed methods for fetching reward data, user rewards, and claiming
 */
export interface DustIncentiveProviderContext {
  dustIncentiveProviderAddress: string;
  provider: providers.Provider;
  chainId?: number;
}

export interface DustIncentiveProviderInterface {
  getRewardsData: (asset: string, reward: string) => Promise<RewardData>;
  getRewardsDataHumanized: (
    asset: string,
    reward: string,
    options?: { tvlUSD?: number; rewardPriceUSD?: number; decimals?: number },
  ) => Promise<import('./types').IncentiveDataHumanized>;
  getAllUserRewards: (assets: string[], user: string) => Promise<UserRewardsResult>;
  getUserRewards: (assets: string[], user: string, reward: string) => Promise<BigNumber>;
  isEmissionsActive: (asset: string, reward: string, currentTimestamp?: number) => Promise<boolean>;
}

export class DustIncentiveProvider implements DustIncentiveProviderInterface {
  private contract: Contract;
  private provider: providers.Provider;
  public readonly address: string;

  constructor(context: DustIncentiveProviderContext) {
    if (!isAddress(context.dustIncentiveProviderAddress)) {
      throw new Error('contract address is not valid');
    }
    this.provider = context.provider;
    this.address = context.dustIncentiveProviderAddress;
    this.contract = new Contract(
      context.dustIncentiveProviderAddress,
      dustRewardsControllerAbi as any,
      context.provider,
    );
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
    const result = await this.contract.getRewardsData(asset, reward);
    return {
      index: result.index,
      emissionPerSecond: result.emissionPerSecond,
      lastUpdateTimestamp: result.lastUpdateTimestamp,
      distributionEnd: result.distributionEnd,
    };
  }

  public async getRewardsDataHumanized(
    asset: string,
    reward: string,
    options?: { tvlUSD?: number; rewardPriceUSD?: number; decimals?: number },
  ): Promise<import('./types').IncentiveDataHumanized> {
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
      lastUpdateTimestamp: data.lastUpdateTimestamp.toNumber(),
      distributionEnd: data.distributionEnd.toNumber(),
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
      rewardTokens: rewardTokens as string[],
      unclaimedAmounts: unclaimedAmounts as BigNumber[],
    };
  }

  /**
   * Get user rewards for specific assets and reward token
   * @param assets Array of asset addresses
   * @param user User address
   * @param reward Reward token address
   * @returns Total unclaimed rewards for the specified reward token
   */
  async getUserRewards(assets: string[], user: string, reward: string): Promise<BigNumber> {
    if (!isAddress(user)) throw new Error('User address is not a valid ethereum address');
    return await this.contract.getUserRewards(assets, user, reward);
  }

  /**
   * Get accrued rewards for a specific user and reward token
   * @param user User address
   * @param reward Reward token address
   * @returns Accrued rewards amount
   */
  async getUserAccruedRewards(user: string, reward: string): Promise<BigNumber> {
    return await this.contract.getUserAccruedRewards(user, reward);
  }

  /**
   * Get the list of all reward tokens configured in the controller
   * @returns Array of reward token addresses
   */
  async getRewardsList(): Promise<string[]> {
    return await this.contract.getRewardsList();
  }

  /**
   * Get rewards data for a user on a specific asset
   * @param user User address
   * @param asset Asset address
   * @param reward Reward token address
   * @returns User's reward index and accrued amount
   */
  async getUserAssetData(
    user: string,
    asset: string,
    reward: string,
  ): Promise<{ index: BigNumber; accrued: BigNumber }> {
    const [index, accrued] = await this.contract.getUserAssetData(user, asset, reward);
    return { index, accrued };
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
    const timestamp = currentTimestamp || (await this.provider.getBlock('latest')).timestamp;

    // Emissions are active if:
    // 1. Current time is before distributionEnd
    // 2. emissionPerSecond is greater than 0
    return rewardData.distributionEnd.toNumber() > timestamp && !rewardData.emissionPerSecond.eq(0);
  }

  /**
   * Calculate annual emissions in token units
   * @param emissionPerSecond Emissions per second
   * @param decimals Token decimals (default 18)
   * @returns Annual emissions as a formatted string
   */
  static calculateAnnualEmissions(emissionPerSecond: BigNumber, decimals = 18): string {
    const SECONDS_PER_YEAR = 31536000;
    const annualEmissions = emissionPerSecond.mul(SECONDS_PER_YEAR);
    return utils.formatUnits(annualEmissions, decimals);
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
    emissionPerSecond: BigNumber,
    rewardPriceUSD: number,
    tvlUSD: number,
    decimals = 18,
  ): string {
    if (tvlUSD <= 0) return '0';

    const annualEmissionsFormatted = parseFloat(
      DustIncentiveProvider.calculateAnnualEmissions(emissionPerSecond, decimals),
    );
    const annualEmissionsUSD = annualEmissionsFormatted * rewardPriceUSD;
    const aprDecimal = annualEmissionsUSD / tvlUSD;

    return (aprDecimal * 100).toFixed(4);
  }

  /**
   * Get the underlying ethers contract instance connected to a signer
   * @param signer Ethers signer for write operations
   * @returns Contract instance with signer
   */
  getContractWithSigner(signer: providers.JsonRpcSigner): Contract {
    return this.contract.connect(signer);
  }

  /**
   * Get the underlying ethers contract instance
   * For advanced usage or calling methods not wrapped by this helper
   */
  getContract(): Contract {
    return this.contract;
  }
}
