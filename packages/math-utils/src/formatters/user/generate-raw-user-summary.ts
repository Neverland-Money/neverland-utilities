import BigNumber from 'bignumber.js';
import { type BigNumberValue, normalizeBN } from '../../bignumber';
import { calculateAvailableBorrowsMarketReferenceCurrency } from '../../pool-math';
import { WAD } from '../../ray.math';
import { type FormatReserveUSDResponse } from '../reserve';
import { normalizedToUsd } from '../usd/normalized-to-usd';
import { calculateUserReserveTotals } from './calculate-user-reserve-totals';
import { type UserReserveSummaryResponse } from './generate-user-reserve-summary';
import type { LegacyEMode, PoolAccountData } from '.';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface RawUserSummaryRequest {
  userReserves: UserReserveSummaryResponse[];
  marketReferencePriceInUsd: BigNumberValue;
  marketReferenceCurrencyDecimals: number;
  userEmodeCategoryId: number;
  legacyEMode?: LegacyEMode;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface RawUserSummaryResponse {
  totalLiquidityUSD: BigNumber;
  totalCollateralUSD: BigNumber;
  totalBorrowsUSD: BigNumber;
  totalLiquidityMarketReferenceCurrency: BigNumber;
  totalCollateralMarketReferenceCurrency: BigNumber;
  totalBorrowsMarketReferenceCurrency: BigNumber;
  availableBorrowsMarketReferenceCurrency: BigNumber;
  availableBorrowsUSD: BigNumber;
  currentLoanToValue: BigNumber;
  currentLiquidationThreshold: BigNumber;
  healthFactor: BigNumber;
  isInIsolationMode: boolean;
  isolatedReserve?: FormatReserveUSDResponse;
  poolAccountData?: PoolAccountData;
}

export function generateRawUserSummary({
  userReserves,
  marketReferencePriceInUsd,
  marketReferenceCurrencyDecimals,
  userEmodeCategoryId,
  legacyEMode,
}: RawUserSummaryRequest): RawUserSummaryResponse {
  const {
    totalLiquidityMarketReferenceCurrency,
    totalBorrowsMarketReferenceCurrency,
    totalCollateralMarketReferenceCurrency,
    currentLtv,
    currentLiquidationThreshold,
    isInIsolationMode,
    isolatedReserve,
    weightedLiquidationThreshold,
  } = calculateUserReserveTotals({ userReserves, userEmodeCategoryId, legacyEMode });

  const _availableBorrowsMarketReferenceCurrency = calculateAvailableBorrowsMarketReferenceCurrency(
    {
      collateralBalanceMarketReferenceCurrency: totalCollateralMarketReferenceCurrency,
      borrowBalanceMarketReferenceCurrency: totalBorrowsMarketReferenceCurrency,
      currentLtv,
    },
  );

  const availableBorrowsMarketReferenceCurrency =
    isInIsolationMode && isolatedReserve
      ? BigNumber.min(
          BigNumber.max(
            0,
            normalizeBN(
              new BigNumber(isolatedReserve.debtCeiling).minus(
                isolatedReserve.isolationModeTotalDebt,
              ),
              isolatedReserve.debtCeilingDecimals - marketReferenceCurrencyDecimals,
            ),
          ),
          _availableBorrowsMarketReferenceCurrency,
        )
      : _availableBorrowsMarketReferenceCurrency;

  // Preserve the weighted numerator through wadDiv, before truncating the reported LT.
  const healthFactorRaw = totalBorrowsMarketReferenceCurrency.isZero()
    ? new BigNumber(2).pow(256).minus(1)
    : weightedLiquidationThreshold
        .multipliedBy(WAD)
        .plus(totalBorrowsMarketReferenceCurrency.dividedToIntegerBy(2))
        .dividedToIntegerBy(totalBorrowsMarketReferenceCurrency)
        .dividedToIntegerBy(10000);
  const poolAccountData: PoolAccountData = {
    totalCollateralBase: totalCollateralMarketReferenceCurrency.toFixed(0),
    totalDebtBase: totalBorrowsMarketReferenceCurrency.toFixed(0),
    availableBorrowsBase: _availableBorrowsMarketReferenceCurrency.toFixed(0),
    currentLiquidationThreshold: currentLiquidationThreshold.toFixed(0),
    ltv: currentLtv.toFixed(0),
    healthFactor: healthFactorRaw.toFixed(0),
  };

  return {
    poolAccountData,
    isInIsolationMode,
    isolatedReserve,
    totalLiquidityUSD: normalizedToUsd(
      totalLiquidityMarketReferenceCurrency,
      marketReferencePriceInUsd,
      marketReferenceCurrencyDecimals,
    ),
    totalCollateralUSD: normalizedToUsd(
      totalCollateralMarketReferenceCurrency,
      marketReferencePriceInUsd,
      marketReferenceCurrencyDecimals,
    ),
    totalBorrowsUSD: normalizedToUsd(
      totalBorrowsMarketReferenceCurrency,
      marketReferencePriceInUsd,
      marketReferenceCurrencyDecimals,
    ),
    totalLiquidityMarketReferenceCurrency,
    totalCollateralMarketReferenceCurrency,
    totalBorrowsMarketReferenceCurrency,
    availableBorrowsMarketReferenceCurrency,
    availableBorrowsUSD: normalizedToUsd(
      availableBorrowsMarketReferenceCurrency,
      marketReferencePriceInUsd,
      marketReferenceCurrencyDecimals,
    ),
    currentLoanToValue: currentLtv,
    currentLiquidationThreshold,
    healthFactor: totalBorrowsMarketReferenceCurrency.isZero()
      ? new BigNumber(-1)
      : healthFactorRaw.shiftedBy(-18),
  };
}
