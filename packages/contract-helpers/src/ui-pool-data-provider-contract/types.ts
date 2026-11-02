import type { uiPoolDataProviderV3Abi } from '@neverland-money/contract-types';
import type { Provider } from 'ethers';
import type { AbiReadOutputs } from '../commons/base-service';
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface UiPoolDataProviderContext {
  uiPoolDataProviderAddress: string;
  provider: Provider;
  chainId: number;
}
export type ReservesData = AbiReadOutputs<typeof uiPoolDataProviderV3Abi, 'getReservesData'>;
export type UserReserveData = AbiReadOutputs<typeof uiPoolDataProviderV3Abi, 'getUserReservesData'>;
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface EModeCategoryHumanized {
  ltv: string;
  liquidationThreshold: string;
  liquidationBonus: string;
  collateralBitmap: string;
  label: string;
  borrowableBitmap: string;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface EModeCategory {
  ltv: number;
  liquidationThreshold: number;
  liquidationBonus: number;
  collateralBitmap: bigint;
  label: string;
  borrowableBitmap: bigint;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface EmodeDataHumanized {
  id: number;
  eMode: EModeCategoryHumanized;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface EModeData {
  id: number;
  eMode: EModeCategory;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface PoolBaseCurrencyHumanized {
  marketReferenceCurrencyDecimals: number;
  marketReferenceCurrencyPriceInUsd: string;
  networkBaseTokenPriceInUsd: string;
  networkBaseTokenPriceDecimals: number;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface ReserveDataHumanized {
  stableBorrowRateEnabled: boolean;
  stableBorrowRate: string;
  stableDebtTokenAddress: string;
  totalPrincipalStableDebt: string;
  averageStableRate: string;
  stableDebtLastUpdateTimestamp: number;
  stableRateSlope1: string;
  stableRateSlope2: string;
  baseStableBorrowRate: string;
  eModeCategoryId: number;
  eModeLtv: number;
  eModeLiquidationThreshold: number;
  eModeLiquidationBonus: number;
  eModePriceSource: string;
  eModeLabel: string;
  originalId: number;
  id: string;
  underlyingAsset: string;
  name: string;
  symbol: string;
  decimals: number;
  baseLTVasCollateral: string;
  reserveLiquidationThreshold: string;
  reserveLiquidationBonus: string;
  reserveFactor: string;
  usageAsCollateralEnabled: boolean;
  borrowingEnabled: boolean;
  isActive: boolean;
  isFrozen: boolean;
  liquidityIndex: string;
  variableBorrowIndex: string;
  liquidityRate: string;
  variableBorrowRate: string;
  lastUpdateTimestamp: number;
  aTokenAddress: string;
  variableDebtTokenAddress: string;
  interestRateStrategyAddress: string;
  availableLiquidity: string;
  totalScaledVariableDebt: string;
  priceInMarketReferenceCurrency: string;
  priceOracle: string;
  variableRateSlope1: string;
  variableRateSlope2: string;
  baseVariableBorrowRate: string;
  optimalUsageRatio: string;
  // v3 only
  isPaused: boolean;
  isSiloedBorrowing: boolean;
  accruedToTreasury: string;
  unbacked: string;
  isolationModeTotalDebt: string;
  flashLoanEnabled: boolean;
  debtCeiling: string;
  debtCeilingDecimals: number;
  borrowCap: string;
  supplyCap: string;
  borrowableInIsolation: boolean;
  virtualAccActive: boolean;
  virtualUnderlyingBalance: string;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface ReservesDataHumanized {
  reservesData: ReserveDataHumanized[];
  baseCurrencyData: PoolBaseCurrencyHumanized;
}
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface UserReserveDataHumanized {
  id: string;
  underlyingAsset: string;
  scaledATokenBalance: string;
  usageAsCollateralEnabledOnUser: boolean;
  scaledVariableDebt: string;
}
