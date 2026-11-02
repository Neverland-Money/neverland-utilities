import { type BigNumberValue, normalize } from '../../bignumber';
import { type FormatReserveUSDResponse } from '../reserve';
import { type UserReserveSummaryResponse } from './generate-user-reserve-summary';
import { type ComputedUserReserve } from '.';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface FormatUserReserveRequest<
  T extends FormatReserveUSDResponse = FormatReserveUSDResponse,
> {
  reserve: UserReserveSummaryResponse<T>;
  marketReferenceCurrencyDecimals: number;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface FormatUserReserveResponse<
  T extends FormatReserveUSDResponse = FormatReserveUSDResponse,
> {
  reserve: ComputedUserReserve<T>;
}

export function formatUserReserve<T extends FormatReserveUSDResponse = FormatReserveUSDResponse>({
  reserve: _reserve,
  marketReferenceCurrencyDecimals,
}: FormatUserReserveRequest<T>): ComputedUserReserve<T> {
  const { userReserve } = _reserve;
  const { reserve } = userReserve;
  const reserveDecimals = reserve.decimals;

  const normalizeWithReserve = (n: BigNumberValue) => normalize(n, reserve.decimals);

  if (!_reserve.normalizedIncome || !_reserve.normalizedVariableDebt) {
    throw new Error(
      'Raw user reserve summary requires normalizedIncome and normalizedVariableDebt for its balance snapshot',
    );
  }

  return {
    ...userReserve,
    normalizedIncome: _reserve.normalizedIncome.toFixed(0),
    normalizedVariableDebt: _reserve.normalizedVariableDebt.toFixed(0),
    underlyingBalance: normalize(_reserve.underlyingBalance, reserveDecimals),
    underlyingBalanceMarketReferenceCurrency: normalize(
      _reserve.underlyingBalanceMarketReferenceCurrency,
      marketReferenceCurrencyDecimals,
    ),
    underlyingBalanceUSD: _reserve.underlyingBalanceUSD.toString(),
    variableBorrows: normalizeWithReserve(_reserve.variableBorrows),
    variableBorrowsMarketReferenceCurrency: normalize(
      _reserve.variableBorrowsMarketReferenceCurrency,
      marketReferenceCurrencyDecimals,
    ),
    variableBorrowsUSD: _reserve.variableBorrowsUSD.toString(),
    totalBorrows: normalizeWithReserve(_reserve.totalBorrows),
    totalBorrowsMarketReferenceCurrency: normalize(
      _reserve.totalBorrowsMarketReferenceCurrency,
      marketReferenceCurrencyDecimals,
    ),
    totalBorrowsUSD: _reserve.totalBorrowsUSD.toString(),
  };
}
