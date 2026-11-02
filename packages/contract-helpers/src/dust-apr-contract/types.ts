export type PriceMap = Record<string, number>;

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface MarketConfig {
  id: string;
  symbol: string;
  /**
   * The incentivized token registered with the rewards controller (an nToken or debt token), not
   * its underlying. Its USD price is read from the `PriceMap` under this address, lowercased, so
   * key the underlying's price by this address too: a price keyed only by the underlying is not
   * found, and `calculateBatchAPR` then omits the market without an error.
   */
  asset: string;
  /** The DUST reward token; its USD price is read from the `PriceMap` under this address, lowercased. */
  dustToken: string;
  transferStrategy: string;
}

export type { DustMarketAPRInputs, MarketAPR } from '@neverland-money/math-utils';

export type DustAPRCalculationOptions = { nowSeconds?: number | bigint };

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface DustRewardData {
  emissionPerSecond: string;
  distributionEnd: number;
  totalSupply: string;
}
