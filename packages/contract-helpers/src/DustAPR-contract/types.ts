export type PriceMap = Record<string, number>;

export interface MarketConfig {
  id: string;
  symbol: string;
  asset: string;
  dustToken: string;
  transferStrategy: string;
}

export interface MarketAPR {
  apr: number;
  isActive: boolean;
  emissionPerSecond: string;
  distributionEnd: number;
  totalSupply: string;
  annualEmissions?: string;
}

export interface DustRewardData {
  emissionPerSecond: string;
  distributionEnd: number;
  totalSupply: string;
}


