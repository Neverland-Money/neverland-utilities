export type PriceMap = Record<string, number>;

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface MarketConfig {
  id: string;
  symbol: string;
  asset: string;
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
