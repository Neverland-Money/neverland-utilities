import BigNumber from 'bignumber.js';
import { type BigNumberValue, valueToBigNumber } from '../../bignumber';
import { calculateCompoundedInterest, getReserveNormalizedIncome } from '../../pool-math';
import { rayMul, rayMulFloor, rayMulCeil } from '../../ray.math';
import { type FormatReserveUSDResponse } from '../reserve';
import type { CombinedReserveData, LegacyEMode } from '.';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface UserReserveSummaryRequest<
  T extends FormatReserveUSDResponse = FormatReserveUSDResponse,
> {
  userReserve: CombinedReserveData<T>;
  marketReferencePriceInUsdNormalized: BigNumberValue;
  marketReferenceCurrencyDecimals: number;
  currentTimestamp: number;
  legacyEMode?: LegacyEMode;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface UserReserveSummaryResponse<
  T extends FormatReserveUSDResponse = FormatReserveUSDResponse,
> {
  userReserve: CombinedReserveData<T>;
  normalizedIncome?: BigNumber;
  normalizedVariableDebt?: BigNumber;
  underlyingBalance: BigNumber;
  underlyingBalanceMarketReferenceCurrency: BigNumber;
  underlyingBalanceUSD: BigNumber;
  variableBorrows: BigNumber;
  variableBorrowsMarketReferenceCurrency: BigNumber;
  variableBorrowsUSD: BigNumber;
  totalBorrows: BigNumber;
  totalBorrowsMarketReferenceCurrency: BigNumber;
  totalBorrowsUSD: BigNumber;
}

export function generateUserReserveSummary<
  T extends FormatReserveUSDResponse = FormatReserveUSDResponse,
>({
  userReserve,
  marketReferencePriceInUsdNormalized,
  marketReferenceCurrencyDecimals,
  currentTimestamp,
  legacyEMode,
}: UserReserveSummaryRequest<T>): UserReserveSummaryResponse<T> {
  const poolReserve: FormatReserveUSDResponse = userReserve.reserve;
  if (legacyEMode && poolReserve.eModeCategoryId === undefined) {
    throw new Error('legacyEMode requires eModeCategoryId on every reserve');
  }

  const categoryPrice = valueToBigNumber(legacyEMode?.priceInMarketReferenceCurrency ?? '0');
  const priceInMarketReferenceCurrency =
    legacyEMode?.id && legacyEMode.id === poolReserve.eModeCategoryId && categoryPrice.gt(0)
      ? categoryPrice
      : poolReserve.priceInMarketReferenceCurrency;
  const normalizedIncome = getReserveNormalizedIncome({
    index: poolReserve.liquidityIndex,
    rate: poolReserve.liquidityRate,
    lastUpdateTimestamp: poolReserve.lastUpdateTimestamp,
    currentTimestamp,
  });
  const normalizedVariableDebt = rayMul(
    calculateCompoundedInterest({
      rate: poolReserve.variableBorrowRate,
      lastUpdateTimestamp: poolReserve.lastUpdateTimestamp,
      currentTimestamp,
    }),
    poolReserve.variableBorrowIndex,
  );
  const underlyingBalance = rayMulFloor(userReserve.scaledATokenBalance, normalizedIncome);
  const variableBorrows = rayMulCeil(userReserve.scaledVariableDebt, normalizedVariableDebt);
  const totalBorrows = variableBorrows.plus(userReserve.currentStableDebt ?? '0');
  const baseValue = (balance: BigNumber, rounding: BigNumber.RoundingMode) =>
    balance
      .multipliedBy(priceInMarketReferenceCurrency)
      .shiftedBy(-poolReserve.decimals)
      .integerValue(rounding);
  const usdValue = (base: BigNumber) =>
    base
      .multipliedBy(marketReferencePriceInUsdNormalized)
      .shiftedBy(-marketReferenceCurrencyDecimals);
  const underlyingBalanceMarketReferenceCurrency = baseValue(
    underlyingBalance,
    BigNumber.ROUND_FLOOR,
  );
  const variableBorrowsMarketReferenceCurrency = baseValue(variableBorrows, BigNumber.ROUND_CEIL);
  // GenericLogic values the combined stable + variable raw balance with ONE ceiling.
  const totalBorrowsMarketReferenceCurrency = baseValue(totalBorrows, BigNumber.ROUND_CEIL);

  return {
    userReserve,
    normalizedIncome,
    normalizedVariableDebt,
    underlyingBalance,
    underlyingBalanceMarketReferenceCurrency,
    underlyingBalanceUSD: usdValue(underlyingBalanceMarketReferenceCurrency),
    variableBorrows,
    variableBorrowsMarketReferenceCurrency,
    variableBorrowsUSD: usdValue(variableBorrowsMarketReferenceCurrency),
    totalBorrows,
    totalBorrowsMarketReferenceCurrency,
    totalBorrowsUSD: usdValue(totalBorrowsMarketReferenceCurrency),
  };
}
