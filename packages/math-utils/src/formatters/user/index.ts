import { type BigNumberValue, normalize } from '../../bignumber';
import { LTV_PRECISION, USD_DECIMALS } from '../../constants';
import {
  calculateAllUserIncentives,
  type UserIncentiveDict,
} from '../incentive/calculate-all-user-incentives';
import {
  type ReservesIncentiveDataHumanized,
  type UserReservesIncentivesDataHumanized,
} from '../incentive/types';
import { type FormatReserveUSDResponse } from '../reserve';
import { formatUserReserve } from './format-user-reserve';
import { generateRawUserSummary } from './generate-raw-user-summary';
import {
  generateUserReserveSummary,
  type UserReserveSummaryResponse,
} from './generate-user-reserve-summary';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface UserReserveData {
  underlyingAsset: string;
  scaledATokenBalance: string;
  usageAsCollateralEnabledOnUser: boolean;
  scaledVariableDebt: string;
  /** Current raw stable debt at currentTimestamp; omission asserts zero. */
  currentStableDebt?: string;
  /** Omission infers borrowing from a nonzero stable or variable debt balance. */
  borrowingEnabledOnUser?: boolean;
}

/** Resolved legacy lending-core 1.1.0 category configuration. */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface LegacyEMode {
  id: number;
  /** Accepts the UiPoolDataProvider decoder's numeric eModeLtv directly. */
  ltv: string | number;
  /** Accepts the UiPoolDataProvider decoder's numeric eModeLiquidationThreshold directly. */
  liquidationThreshold: string | number;
  /** Raw base-currency price; omitted or zero uses each ordinary asset price. */
  priceInMarketReferenceCurrency?: string;
}

/** Raw Pool.getUserAccountData values, before display or isolation caps. */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface PoolAccountData {
  totalCollateralBase: string;
  totalDebtBase: string;
  availableBorrowsBase: string;
  currentLiquidationThreshold: string;
  ltv: string;
  healthFactor: string;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface CombinedReserveData<
  T extends FormatReserveUSDResponse = FormatReserveUSDResponse,
> extends UserReserveData {
  reserve: T;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface ComputedUserReserve<
  T extends FormatReserveUSDResponse = FormatReserveUSDResponse,
> extends CombinedReserveData<T> {
  /** Exact integer RAY indexes at the same currentTimestamp as the balances. */
  normalizedIncome: string;
  normalizedVariableDebt: string;
  underlyingBalance: string;
  underlyingBalanceMarketReferenceCurrency: string;
  underlyingBalanceUSD: string;
  variableBorrows: string;
  variableBorrowsMarketReferenceCurrency: string;
  variableBorrowsUSD: string;
  totalBorrows: string;
  totalBorrowsMarketReferenceCurrency: string;
  totalBorrowsUSD: string;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface FormatUserSummaryRequest<
  T extends FormatReserveUSDResponse = FormatReserveUSDResponse,
> {
  userReserves: UserReserveData[];
  formattedReserves: T[];
  marketReferencePriceInUsd: BigNumberValue;
  marketReferenceCurrencyDecimals: number;
  currentTimestamp: number;
  userEmodeCategoryId: number;
  legacyEMode?: LegacyEMode;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface FormatUserSummaryResponse<
  T extends FormatReserveUSDResponse = FormatReserveUSDResponse,
> {
  userReservesData: Array<ComputedUserReserve<T>>;
  totalLiquidityMarketReferenceCurrency: string;
  totalLiquidityUSD: string;
  totalCollateralMarketReferenceCurrency: string;
  totalCollateralUSD: string;
  totalBorrowsMarketReferenceCurrency: string;
  totalBorrowsUSD: string;
  netWorthUSD: string;
  availableBorrowsMarketReferenceCurrency: string;
  availableBorrowsUSD: string;
  currentLoanToValue: string;
  currentLiquidationThreshold: string;
  healthFactor: string;
  userEmodeCategoryId: number;
  isInIsolationMode: boolean;
  isolatedReserve?: FormatReserveUSDResponse;
  poolAccountData?: PoolAccountData;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface FormatUserSummaryAndIncentivesRequest<
  T extends FormatReserveUSDResponse = FormatReserveUSDResponse,
> extends FormatUserSummaryRequest<T> {
  reserveIncentives: ReservesIncentiveDataHumanized[];
  userIncentives: UserReservesIncentivesDataHumanized[];
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface FormatUserSummaryAndIncentivesResponse<
  T extends FormatReserveUSDResponse = FormatReserveUSDResponse,
> extends FormatUserSummaryResponse<T> {
  calculatedUserIncentives: UserIncentiveDict;
}

/** Only an unsigned decimal zero, the form the on-chain readers emit, is an inert raw amount. */
function isZeroRawAmount(value: unknown): boolean {
  return typeof value === 'string' && /^0+$/.test(value);
}

/**
 * Whether a raw user reserve can change any summary output: a balance or debt that is not an
 * unsigned decimal zero, malformed values included, or an enabled collateral or borrowing flag.
 * A zero-balance collateral flag still matters, because it can put the account in isolation mode.
 */
function canChangeSummary(userReserve: UserReserveData): boolean {
  if (userReserve.usageAsCollateralEnabledOnUser || userReserve.borrowingEnabledOnUser) return true;
  return (
    !isZeroRawAmount(userReserve.scaledATokenBalance) ||
    !isZeroRawAmount(userReserve.scaledVariableDebt) ||
    (userReserve.currentStableDebt !== undefined && !isZeroRawAmount(userReserve.currentStableDebt))
  );
}

export function formatUserSummary<T extends FormatReserveUSDResponse = FormatReserveUSDResponse>({
  currentTimestamp,
  marketReferencePriceInUsd,
  marketReferenceCurrencyDecimals,
  userReserves,
  formattedReserves,
  userEmodeCategoryId,
  legacyEMode,
}: FormatUserSummaryRequest<T>): FormatUserSummaryResponse<T> {
  const normalizedMarketRefPriceInUsd = normalize(marketReferencePriceInUsd, USD_DECIMALS);

  if (legacyEMode) {
    if (legacyEMode.id !== userEmodeCategoryId) {
      throw new Error('legacyEMode.id must match userEmodeCategoryId');
    }

    for (const reserve of formattedReserves) {
      if (reserve.eModeCategoryId === undefined) {
        throw new Error('legacyEMode requires eModeCategoryId on every reserve');
      }
    }
  } else if (
    userEmodeCategoryId !== 0 &&
    formattedReserves.every(reserve => reserve.eModes.length === 0)
  ) {
    // Without category data every collateral would silently use its ordinary LTV and threshold.
    throw new Error(
      `userEmodeCategoryId ${userEmodeCategoryId} has no E-mode category data: pass eModes to formatReserves or legacyEMode to formatUserSummary`,
    );
  }

  // Combine raw user and formatted reserve data by case-insensitive underlying asset. A row that can
  // change the summary must match exactly one formatted reserve and be its asset's only row;
  // otherwise the summary could omit or double-count a position. An all-zero, flag-free row cannot
  // change any output, so it is skipped when it has no unique match or repeats an earlier row.
  const combinedReserves: Array<CombinedReserveData<T>> = [];
  const seenAssets = new Map<string, boolean>();

  for (const userReserve of userReserves) {
    const asset = userReserve.underlyingAsset.toLowerCase();
    const changesSummary = canChangeSummary(userReserve);
    const earlierChangesSummary = seenAssets.get(asset);
    if (earlierChangesSummary !== undefined) {
      if (changesSummary || earlierChangesSummary) {
        throw new Error(`Duplicate user reserve for asset ${userReserve.underlyingAsset}`);
      }

      continue;
    }

    seenAssets.set(asset, changesSummary);
    const matches = formattedReserves.filter(r => r.underlyingAsset.toLowerCase() === asset);
    if (matches.length === 1) {
      combinedReserves.push({
        ...userReserve,
        reserve: matches[0],
      });
    } else if (changesSummary) {
      throw new Error(
        matches.length === 0
          ? `Missing formatted reserve for user asset ${userReserve.underlyingAsset}`
          : `Multiple formatted reserves for user asset ${userReserve.underlyingAsset}`,
      );
    }
  }

  const computedUserReserves: Array<UserReserveSummaryResponse<T>> = combinedReserves.map(
    userReserve =>
      generateUserReserveSummary<T>({
        userReserve,
        marketReferencePriceInUsdNormalized: normalizedMarketRefPriceInUsd,
        marketReferenceCurrencyDecimals,
        currentTimestamp,
        legacyEMode,
      }),
  );

  const formattedUserReserves = computedUserReserves.map(computedUserReserve =>
    formatUserReserve<T>({
      reserve: computedUserReserve,
      marketReferenceCurrencyDecimals,
    }),
  );

  const userData = generateRawUserSummary({
    userReserves: computedUserReserves,
    marketReferencePriceInUsd: normalizedMarketRefPriceInUsd,
    marketReferenceCurrencyDecimals,
    userEmodeCategoryId,
    legacyEMode,
  });

  return {
    userReservesData: formattedUserReserves,
    totalLiquidityMarketReferenceCurrency: normalize(
      userData.totalLiquidityMarketReferenceCurrency,
      marketReferenceCurrencyDecimals,
    ),
    totalLiquidityUSD: userData.totalLiquidityUSD.toString(),
    totalCollateralMarketReferenceCurrency: normalize(
      userData.totalCollateralMarketReferenceCurrency,
      marketReferenceCurrencyDecimals,
    ),
    totalCollateralUSD: userData.totalCollateralUSD.toString(),
    totalBorrowsMarketReferenceCurrency: normalize(
      userData.totalBorrowsMarketReferenceCurrency,
      marketReferenceCurrencyDecimals,
    ),
    totalBorrowsUSD: userData.totalBorrowsUSD.toString(),
    netWorthUSD: userData.totalLiquidityUSD.minus(userData.totalBorrowsUSD).toString(),
    availableBorrowsMarketReferenceCurrency: normalize(
      userData.availableBorrowsMarketReferenceCurrency,
      marketReferenceCurrencyDecimals,
    ),
    availableBorrowsUSD: userData.availableBorrowsUSD.toString(),
    currentLoanToValue: normalize(userData.currentLoanToValue, LTV_PRECISION),
    currentLiquidationThreshold: normalize(userData.currentLiquidationThreshold, LTV_PRECISION),
    healthFactor: userData.healthFactor.toFixed(),
    userEmodeCategoryId,
    isInIsolationMode: userData.isInIsolationMode,
    isolatedReserve: userData.isolatedReserve,
    poolAccountData: userData.poolAccountData,
  };
}

export function formatUserSummaryAndIncentives<
  T extends FormatReserveUSDResponse = FormatReserveUSDResponse,
>({
  currentTimestamp,
  marketReferencePriceInUsd,
  marketReferenceCurrencyDecimals,
  userReserves,
  formattedReserves,
  userEmodeCategoryId,
  reserveIncentives,
  userIncentives,
  legacyEMode,
}: FormatUserSummaryAndIncentivesRequest<T>): FormatUserSummaryAndIncentivesResponse<T> {
  const formattedUserSummary = formatUserSummary({
    currentTimestamp,
    marketReferencePriceInUsd,
    marketReferenceCurrencyDecimals,
    userReserves,
    formattedReserves,
    userEmodeCategoryId,
    legacyEMode,
  });

  const calculatedUserIncentives = calculateAllUserIncentives({
    reserveIncentives,
    userIncentives,
    userReserves: formattedUserSummary.userReservesData,
    currentTimestamp,
  });

  return {
    ...formattedUserSummary,
    calculatedUserIncentives,
  };
}
