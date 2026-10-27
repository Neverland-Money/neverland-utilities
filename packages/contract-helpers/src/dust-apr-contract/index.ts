import { erc20Abi } from '@neverland-money/contract-types';
import {
  calculateMarketAPRFromInputs,
  UnresolvedDustAPRInputError,
} from '@neverland-money/math-utils';
import { ethers } from 'ethers';
import { AbiBaseService } from '../commons/base-service';
import { DustIncentiveProvider } from '../dust-incentive-provider-contract';
import type { DustAPRCalculationOptions, MarketAPR, MarketConfig, PriceMap } from './types';

export {
  calculateMarketAPRFromInputs,
  UnresolvedDustAPRInputError,
} from '@neverland-money/math-utils';

function resolveNowSeconds(options?: DustAPRCalculationOptions): bigint {
  const explicitNow = options?.nowSeconds;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Only undefined omits the clock; runtime null must reject.
  const now = explicitNow === undefined ? Math.floor(Date.now() / 1000) : explicitNow;
  if (typeof now === 'number') {
    if (!Number.isSafeInteger(now) || now < 0) {
      throw new UnresolvedDustAPRInputError('nowSeconds must be a nonnegative safe integer');
    }

    return BigInt(now);
  }

  if (typeof now !== 'bigint' || now < 0n || now > 2n ** 256n - 1n) {
    throw new UnresolvedDustAPRInputError('nowSeconds must be a nonnegative uint256 bigint');
  }

  return now;
}

/**
 * Convert a float USD price to USD8, truncating beyond 8 decimals. It scales the shortest decimal
 * form of the number rather than `price * 1e8`, whose binary rounding turns prices such as 0.29
 * into 28999999.999999996 and would floor them one unit low.
 */
function priceUsd8(price: number | undefined, token: string): bigint {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    throw new UnresolvedDustAPRInputError(`${token} price must be finite and positive`);
  }

  const [mantissa, exponent = '0'] = price.toString().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const shift = Number(exponent) - fraction.length + 8;
  const digits = BigInt(whole + fraction);
  const scaled = shift >= 0 ? digits * 10n ** BigInt(shift) : digits / 10n ** BigInt(-shift);
  if (scaled <= 0n || scaled > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new UnresolvedDustAPRInputError(
      `${token} price must resolve to a positive safe USD8 integer`,
    );
  }

  return scaled;
}

/** Parse a market's USD supply weight; an active market without one cannot be weighted. */
function usdSupplyWeight(market: { totalSupplyUSD?: string }): number {
  const { totalSupplyUSD } = market;
  const weight =
    typeof totalSupplyUSD === 'string' && totalSupplyUSD.trim().length > 0
      ? Number(totalSupplyUSD)
      : Number.NaN;
  if (!Number.isFinite(weight) || weight < 0) {
    throw new UnresolvedDustAPRInputError(
      'active market totalSupplyUSD must be a nonnegative decimal string',
    );
  }

  return weight;
}

export class DustAPRCalculator {
  static validateMarketConfig(market: MarketConfig): boolean {
    return (
      ethers.isAddress(market.asset) &&
      ethers.isAddress(market.dustToken) &&
      ethers.isAddress(market.transferStrategy) &&
      market.id.length > 0 &&
      market.symbol.length > 0
    );
  }

  /**
   * Average APR of the active markets, weighted by each market's USD supply (`totalSupplyUSD`,
   * which {@link calculateMarketAPR} returns on live results). Inactive (dormant) markets are left
   * out rather than counted as 0%, and so are entries omitted from the input, such as markets a
   * batch could not resolve. An active market whose truncated APR is 0 still adds its weight.
   * Returns 0 when no active market has a positive USD supply. Throws
   * {@link UnresolvedDustAPRInputError} when an active market lacks a valid `totalSupplyUSD`: the
   * raw `totalSupply` is in the asset's own decimals and cannot be compared across markets.
   */
  static calculateWeightedAverageAPR(
    markets: Array<{
      apr: number;
      totalSupply?: string;
      totalSupplyUSD?: string;
      isActive: boolean;
    }>,
  ): number {
    const activeMarkets = markets.filter(m => m.isActive);
    let totalWeight = 0;
    let weightedSum = 0;
    for (const market of activeMarkets) {
      if (!Number.isFinite(market.apr) || market.apr < 0) {
        throw new UnresolvedDustAPRInputError(
          'active market apr must be a finite nonnegative number',
        );
      }

      const weight = usdSupplyWeight(market);
      totalWeight += weight;
      weightedSum += market.apr * weight;
    }

    return totalWeight === 0 ? 0 : weightedSum / totalWeight;
  }

  /** Read the incentivized token's current supply; DUST reward units have 18 decimals. */
  // eslint-disable-next-line max-params -- Retain positional compatibility and add only an optional clock override.
  async calculateMarketAPR(
    asset: string,
    rewardToken: string,
    rewardsController: string,
    provider: ethers.Provider,
    tokenPrices: PriceMap,
    options?: DustAPRCalculationOptions,
  ): Promise<MarketAPR> {
    const nowSeconds = resolveNowSeconds(options);
    const rewards = new DustIncentiveProvider({
      provider,
      dustIncentiveProviderAddress: rewardsController,
    });
    const data = await rewards.getRewardsData(asset, rewardToken);
    const input = {
      emissionPerSecond: data?.emissionPerSecond,
      distributionEnd: data?.distributionEnd,
      nowSeconds,
    };
    // The kernel validates malformed raw data as well as resolving genuine dormant campaigns.
    if (
      typeof input.emissionPerSecond !== 'bigint' ||
      typeof input.distributionEnd !== 'bigint' ||
      input.emissionPerSecond <= 0n ||
      input.distributionEnd <= nowSeconds
    ) {
      return calculateMarketAPRFromInputs(input);
    }

    const token = new AbiBaseService(provider, erc20Abi);
    const [totalSupplyRaw, decimals] = await Promise.all([
      token.readContract(asset, 'totalSupply', []),
      token.readContract(asset, 'decimals', []),
    ]);
    if (typeof decimals !== 'bigint' || decimals < 0n || decimals > 255n) {
      throw new UnresolvedDustAPRInputError('asset decimals must decode as uint8 bigint');
    }

    return calculateMarketAPRFromInputs({
      ...input,
      totalSupplyRaw,
      assetDecimals: Number(decimals),
      rewardPriceUsd8: priceUsd8(tokenPrices[rewardToken.toLowerCase()], 'reward'),
      assetPriceUsd8: priceUsd8(tokenPrices[asset.toLowerCase()], 'asset'),
    });
  }

  // eslint-disable-next-line max-params -- Retain positional compatibility and add only an optional clock override.
  async calculateBatchAPR(
    markets: MarketConfig[],
    rewardsController: string,
    provider: ethers.Provider,
    tokenPrices: PriceMap,
    options?: DustAPRCalculationOptions,
  ): Promise<Record<string, MarketAPR>> {
    const nowSeconds = resolveNowSeconds(options);
    const results: Record<string, MarketAPR> = {};
    const aprResults = await Promise.allSettled(
      markets.map(async market => ({
        marketId: market.id,
        apr: await this.calculateMarketAPR(
          market.asset,
          market.dustToken,
          rewardsController,
          provider,
          tokenPrices,
          { nowSeconds },
        ),
      })),
    );
    for (const result of aprResults) {
      if (result.status === 'fulfilled') results[result.value.marketId] = result.value.apr;
    }

    return results;
  }
}
