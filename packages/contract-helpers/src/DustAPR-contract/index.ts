import { ethers } from 'ethers';
import { dustRewardsControllerAbi } from '@neverland-money/contract-types';
import { AbiBaseService } from '../commons/BaseService';
import type { MarketAPR, MarketConfig, PriceMap, DustRewardData } from './types';
const getNetworkNowSec = (): number => Math.floor(Date.now() / 1000);
export class DustAPRCalculator {
  private static readonly SECONDS_PER_YEAR = 31536000;
  private static readonly PRICE_PRECISION = 1e8;
  private static readonly APR_PRECISION = 10000;
  async calculateMarketAPR(
    asset: string,
    rewardToken: string,
    rewardsController: string,
    provider: ethers.Provider,
    tokenPrices: PriceMap,
  ): Promise<MarketAPR> {
    try {
      const svc = new AbiBaseService(provider, dustRewardsControllerAbi as any);
      const controller = svc.getContractInstance(rewardsController);
      const rewardData = await controller.getRewardsData(asset, rewardToken);
      const { emissionPerSecond, distributionEnd, totalSupply }: DustRewardData = {
        emissionPerSecond: rewardData.emissionPerSecond.toString(),
        distributionEnd: ethers.getNumber(rewardData.distributionEnd),
        totalSupply: rewardData.totalSupply.toString?.() ?? rewardData.totalSupply,
      };
      const now = getNetworkNowSec();
      const isActive = distributionEnd > now;
      if (!isActive || ethers.getBigInt(emissionPerSecond) === 0n) {
        return { apr: 0, isActive: false, emissionPerSecond, distributionEnd, totalSupply };
      }
      const annualEmissions =
        ethers.getBigInt(emissionPerSecond) * ethers.getBigInt(DustAPRCalculator.SECONDS_PER_YEAR);
      const dustPrice = tokenPrices[rewardToken.toLowerCase()] || 0;
      const assetPrice = tokenPrices[asset.toLowerCase()] || 1;
      const dustPriceBN = ethers.getBigInt(
        Math.floor(dustPrice * DustAPRCalculator.PRICE_PRECISION),
      );
      const assetPriceBN = ethers.getBigInt(
        Math.floor(assetPrice * DustAPRCalculator.PRICE_PRECISION),
      );
      const annualRewardValue =
        (annualEmissions * ethers.getBigInt(dustPriceBN)) /
        ethers.getBigInt(DustAPRCalculator.PRICE_PRECISION);
      const totalSupplyValue =
        (ethers.getBigInt(totalSupply) * ethers.getBigInt(assetPriceBN)) /
        ethers.getBigInt(DustAPRCalculator.PRICE_PRECISION);
      const apr =
        totalSupplyValue > 0n
          ? (annualRewardValue * ethers.getBigInt(DustAPRCalculator.APR_PRECISION)) /
            ethers.getBigInt(totalSupplyValue)
          : 0n;
      return {
        apr: ethers.getNumber(apr) / 100,
        isActive: true,
        emissionPerSecond,
        distributionEnd,
        totalSupply,
        annualEmissions: annualEmissions.toString(),
      };
    } catch {
      return {
        apr: 0,
        isActive: false,
        emissionPerSecond: '0',
        distributionEnd: 0,
        totalSupply: '0',
      };
    }
  }
  async calculateBatchAPR(
    markets: MarketConfig[],
    rewardsController: string,
    provider: ethers.Provider,
    tokenPrices: PriceMap,
  ): Promise<{
    [marketId: string]: MarketAPR;
  }> {
    const results: {
      [marketId: string]: MarketAPR;
    } = {};
    const aprPromises = markets.map(async market => {
      const apr = await this.calculateMarketAPR(
        market.asset,
        market.dustToken,
        rewardsController,
        provider,
        tokenPrices,
      );
      return { marketId: market.id, apr };
    });
    const aprResults = await Promise.allSettled(aprPromises);
    aprResults.forEach((result, index) => {
      if (result.status === 'fulfilled') results[result.value.marketId] = result.value.apr;
      else
        results[markets[index]?.id || ''] = {
          apr: 0,
          isActive: false,
          emissionPerSecond: '0',
          distributionEnd: 0,
          totalSupply: '0',
        };
    });
    return results;
  }
  static validateMarketConfig(market: MarketConfig): boolean {
    return (
      ethers.isAddress(market.asset) &&
      ethers.isAddress(market.dustToken) &&
      ethers.isAddress(market.transferStrategy) &&
      market.id.length > 0 &&
      market.symbol.length > 0
    );
  }
  static calculateWeightedAverageAPR(
    markets: Array<{
      apr: number;
      totalSupply: string;
      isActive: boolean;
    }>,
  ): number {
    const activeMarkets = markets.filter(m => m.isActive && m.apr > 0);
    if (activeMarkets.length === 0) return 0;
    const totalWeight = activeMarkets.reduce((sum, m) => sum + parseFloat(m.totalSupply), 0);
    if (totalWeight === 0) return 0;
    const weightedSum = activeMarkets.reduce(
      (sum, m) => sum + m.apr * parseFloat(m.totalSupply),
      0,
    );
    return weightedSum / totalWeight;
  }
}
