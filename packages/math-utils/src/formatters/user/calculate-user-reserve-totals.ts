import type BigNumber from 'bignumber.js';
import { valueToZDBigNumber } from '../../bignumber';
import { type FormatReserveUSDResponse } from '../reserve';
import { type UserReserveSummaryResponse } from './generate-user-reserve-summary';
import type { LegacyEMode } from '.';

type UserReserveTotalsRequest = {
  userReserves: UserReserveSummaryResponse[];
  userEmodeCategoryId: number;
  legacyEMode?: LegacyEMode;
};

type UserReserveTotalsResponse = {
  totalLiquidityMarketReferenceCurrency: BigNumber;
  totalBorrowsMarketReferenceCurrency: BigNumber;
  totalCollateralMarketReferenceCurrency: BigNumber;
  currentLtv: BigNumber;
  currentLiquidationThreshold: BigNumber;
  weightedLiquidationThreshold: BigNumber;
  isInIsolationMode: boolean;
  isolatedReserve?: FormatReserveUSDResponse;
};

// eslint-disable-next-line complexity -- Preserve the explicit source-derived financial branches, rounding, fallback values and evaluation order.
export function calculateUserReserveTotals({
  userReserves,
  userEmodeCategoryId,
  legacyEMode,
}: UserReserveTotalsRequest): UserReserveTotalsResponse {
  let totalLiquidityMarketReferenceCurrency = valueToZDBigNumber('0');
  let totalCollateralMarketReferenceCurrency = valueToZDBigNumber('0');
  let totalBorrowsMarketReferenceCurrency = valueToZDBigNumber('0');
  let weightedLtv = valueToZDBigNumber('0');
  let weightedLiquidationThreshold = valueToZDBigNumber('0');
  let isInIsolationMode = false;
  let isolatedReserve: FormatReserveUSDResponse | undefined;

  if (legacyEMode && legacyEMode.id !== userEmodeCategoryId) {
    throw new Error('legacyEMode.id must match userEmodeCategoryId');
  }

  for (const summary of userReserves) {
    const { userReserve } = summary;
    const { reserve } = userReserve;
    if (legacyEMode && reserve.eModeCategoryId === undefined) {
      throw new Error('legacyEMode requires eModeCategoryId on every reserve');
    }

    totalLiquidityMarketReferenceCurrency = totalLiquidityMarketReferenceCurrency.plus(
      summary.underlyingBalanceMarketReferenceCurrency,
    );
    if (userReserve.borrowingEnabledOnUser ?? summary.totalBorrows.gt(0)) {
      totalBorrowsMarketReferenceCurrency = totalBorrowsMarketReferenceCurrency.plus(
        summary.totalBorrowsMarketReferenceCurrency,
      );
    }

    // GenericLogic includes enabled collateral even with an ordinary LT of zero.
    if (!userReserve.usageAsCollateralEnabledOnUser) continue;
    if (reserve.debtCeiling !== '0') {
      isolatedReserve = reserve;
      isInIsolationMode = true;
    }

    const collateral = summary.underlyingBalanceMarketReferenceCurrency;
    totalCollateralMarketReferenceCurrency =
      totalCollateralMarketReferenceCurrency.plus(collateral);
    const bitmapCategory = reserve.eModes.find(category => category.id === userEmodeCategoryId);
    const category = legacyEMode
      ? userEmodeCategoryId !== 0 && reserve.eModeCategoryId === userEmodeCategoryId
        ? legacyEMode
        : undefined
      : userEmodeCategoryId !== 0 && bitmapCategory?.collateralEnabled
        ? bitmapCategory.eMode
        : undefined;
    weightedLtv = weightedLtv.plus(
      collateral.multipliedBy(category?.ltv ?? reserve.baseLTVasCollateral),
    );
    weightedLiquidationThreshold = weightedLiquidationThreshold.plus(
      collateral.multipliedBy(
        category?.liquidationThreshold ?? reserve.reserveLiquidationThreshold,
      ),
    );
  }

  const currentLtv = totalCollateralMarketReferenceCurrency.isZero()
    ? valueToZDBigNumber(0)
    : weightedLtv.dividedToIntegerBy(totalCollateralMarketReferenceCurrency);
  const currentLiquidationThreshold = totalCollateralMarketReferenceCurrency.isZero()
    ? valueToZDBigNumber(0)
    : weightedLiquidationThreshold.dividedToIntegerBy(totalCollateralMarketReferenceCurrency);

  return {
    totalLiquidityMarketReferenceCurrency,
    totalBorrowsMarketReferenceCurrency,
    totalCollateralMarketReferenceCurrency,
    currentLtv,
    currentLiquidationThreshold,
    weightedLiquidationThreshold,
    isInIsolationMode,
    isolatedReserve,
  };
}
