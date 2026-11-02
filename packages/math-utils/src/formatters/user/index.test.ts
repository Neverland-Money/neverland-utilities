import BigNumber from 'bignumber.js';
import { formatReserves } from '../..';
import { ReserveIncentiveMock, ReserveMock, UserIncentiveMock, UserReserveMock } from '../../mocks';
import { type FormatReserveUSDResponse } from '../reserve';
import {
  formatUserSummary,
  formatUserSummaryAndIncentives,
  type FormatUserSummaryAndIncentivesRequest,
  type FormatUserSummaryRequest,
  type UserReserveData,
} from './index';

describe('formatUserSummaryETHMarket', () => {
  const usdcUserMock = new UserReserveMock({ decimals: 6 }).supply(200).variableBorrow(100);
  const marketReferencePriceInUsd = 10 ** 9; // 10
  const marketReferenceCurrencyDecimals = 18;
  const request: FormatUserSummaryRequest = {
    userReserves: [usdcUserMock.userReserve],
    formattedReserves: [usdcUserMock.reserve],
    marketReferencePriceInUsd,
    marketReferenceCurrencyDecimals,
    currentTimestamp: 1,
    userEmodeCategoryId: 0,
  };

  it('should return the correct response', () => {
    const result = formatUserSummary(request);
    expect(result.totalLiquidityMarketReferenceCurrency).toEqual('2000');
    expect(result.totalLiquidityUSD).toEqual('20000');
    expect(result.totalCollateralMarketReferenceCurrency).toEqual('2000');
    expect(result.totalCollateralUSD).toEqual('20000');
    expect(result.totalBorrowsMarketReferenceCurrency).toEqual('1000');
    expect(result.totalBorrowsUSD).toEqual('10000');
    expect(result.availableBorrowsMarketReferenceCurrency).toEqual('0');
    expect(result.availableBorrowsUSD).toEqual('0');
    expect(result.currentLoanToValue).toEqual('0.5');
    expect(result.currentLiquidationThreshold).toEqual('0.6');
    expect(result.healthFactor).toEqual('1.2');
  });

  it('rejects incomplete reserve data instead of omitting user debt from risk totals', () => {
    expect(() => formatUserSummary({ ...request, formattedReserves: [] })).toThrow(
      `Missing formatted reserve for user asset ${usdcUserMock.userReserve.underlyingAsset}`,
    );
  });

  it('should increase debt over time', () => {
    const first = formatUserSummary({
      ...request,
      currentTimestamp: 1,
    });

    const second = formatUserSummary({
      ...request,
      currentTimestamp: 2,
    });

    expect(
      new BigNumber(second.totalBorrowsMarketReferenceCurrency).gt(
        first.totalBorrowsMarketReferenceCurrency,
      ),
    ).toEqual(true);
  });

  it('should increase collateral over time', () => {
    const first = formatUserSummary({
      ...request,
      currentTimestamp: 1,
    });

    const second = formatUserSummary({
      ...request,
      currentTimestamp: 2000,
    });

    expect(
      new BigNumber(second.totalCollateralMarketReferenceCurrency).gt(
        first.totalCollateralMarketReferenceCurrency,
      ),
    ).toEqual(true);
  });

  it('should increase debt over time', () => {
    const first = formatUserSummary({
      ...request,
      currentTimestamp: 1,
    });

    const second = formatUserSummary({
      ...request,
      currentTimestamp: 2,
    });

    expect(
      new BigNumber(second.totalBorrowsMarketReferenceCurrency).gt(
        first.totalBorrowsMarketReferenceCurrency,
      ),
    ).toEqual(true);
  });

  it('should increase collateral over time', () => {
    const first = formatUserSummary({
      ...request,
      currentTimestamp: 1,
    });

    const second = formatUserSummary({
      ...request,
      currentTimestamp: 2,
    });

    expect(
      new BigNumber(second.totalCollateralMarketReferenceCurrency).gt(
        first.totalCollateralMarketReferenceCurrency,
      ),
    ).toEqual(true);
  });
});

describe('formatUserSummaryAndIncentives', () => {
  const ethUserMock = new UserReserveMock({ decimals: 18 }).variableBorrow(50);
  const reserveIncentiveMock = new ReserveIncentiveMock();
  const userIncentiveMock = new UserIncentiveMock();
  const marketReferencePriceInUsd = '10';
  const marketReferenceCurrencyDecimals = 18;
  const reserveMock = new ReserveMock();
  const formattedReserves = formatReserves({
    reserves: [
      {
        ...reserveMock.reserve,
        underlyingAsset: ethUserMock.userReserve.underlyingAsset,
        priceInMarketReferenceCurrency: '0',
      },
    ],
    currentTimestamp: 0,
    marketReferenceCurrencyDecimals: 0,
    marketReferencePriceInUsd: '1',
  });
  const request: FormatUserSummaryAndIncentivesRequest = {
    userReserves: [ethUserMock.userReserve],
    formattedReserves,
    marketReferencePriceInUsd,
    marketReferenceCurrencyDecimals,
    currentTimestamp: 1,
    userEmodeCategoryId: 0,
    reserveIncentives: [reserveIncentiveMock.reserveIncentive],
    userIncentives: [userIncentiveMock.userIncentive],
  };

  it('should calculate correct user incentives', () => {
    const summary = formatUserSummaryAndIncentives(request);
    expect(
      summary.calculatedUserIncentives[
        '0x0000000000000000000000000000000000000000'
      ].claimableRewards.toString(),
    ).toEqual('1');
  });
});

describe('formatUserSummary reserve matching', () => {
  const assetA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const assetACased = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const assetB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const unlisted = '0x1111111111111111111111111111111111111111';
  const mock = new UserReserveMock({ decimals: 6 }).supply(200).variableBorrow(100);
  const position: UserReserveData = { ...mock.userReserve, underlyingAsset: assetA };
  const reserveA: FormatReserveUSDResponse = { ...mock.reserve, underlyingAsset: assetA };
  const reserveB: FormatReserveUSDResponse = { ...mock.reserve, underlyingAsset: assetB };
  // UiPoolDataProvider's row for a reserve the user never touched, such as one listed after the
  // reserve snapshot was cached.
  const zeroRow: UserReserveData = {
    underlyingAsset: unlisted,
    scaledATokenBalance: '0',
    usageAsCollateralEnabledOnUser: false,
    scaledVariableDebt: '0',
  };
  const request: FormatUserSummaryRequest = {
    userReserves: [position],
    formattedReserves: [reserveA, reserveB],
    marketReferencePriceInUsd: 10 ** 9,
    marketReferenceCurrencyDecimals: 18,
    currentTimestamp: 1,
    userEmodeCategoryId: 0,
  };
  const serialized = (overrides: Partial<FormatUserSummaryRequest>) =>
    JSON.stringify(formatUserSummary({ ...request, ...overrides }));
  const rowWith = (field: keyof UserReserveData, value: unknown): UserReserveData => {
    const row = { ...zeroRow };
    Reflect.set(row, field, value);
    return row;
  };

  const amountFields = ['scaledATokenBalance', 'scaledVariableDebt', 'currentStableDebt'] as const;
  const malformedAmounts: unknown[] = [
    '',
    ' 0',
    '-0',
    '-1',
    '0.0',
    '1e3',
    '0x0',
    'NaN',
    0,
    0n,
    null,
  ];

  it.each<[string, UserReserveData]>([
    ['with only the required fields', zeroRow],
    [
      'with explicit zero stable debt and borrowing off',
      { ...zeroRow, currentStableDebt: '0', borrowingEnabledOnUser: false },
    ],
    [
      'with zero-padded amounts',
      { ...zeroRow, scaledATokenBalance: '00', scaledVariableDebt: '000' },
    ],
  ])('skips an unmatched all-zero, flag-free row %s exactly as if it were absent', (_, row) => {
    const withoutRow = serialized({});
    expect(serialized({ userReserves: [position, row] })).toBe(withoutRow);
    expect(serialized({ userReserves: [row, position] })).toBe(withoutRow);
  });

  it.each<[string, Partial<UserReserveData>]>([
    ['supply', { scaledATokenBalance: '1' }],
    ['variable debt', { scaledVariableDebt: '1' }],
    ['stable debt', { currentStableDebt: '1' }],
    ['the collateral flag', { usageAsCollateralEnabledOnUser: true }],
    ['the borrowing flag', { borrowingEnabledOnUser: true }],
  ])('throws for an unmatched row with %s', (_, fields) => {
    expect(() =>
      formatUserSummary({ ...request, userReserves: [position, { ...zeroRow, ...fields }] }),
    ).toThrow(`Missing formatted reserve for user asset ${unlisted}`);
  });

  it('fails closed for unmatched or repeated rows whose amounts are not unsigned decimal integers', () => {
    for (const field of amountFields) {
      for (const value of malformedAmounts) {
        const row = rowWith(field, value);
        expect(() => formatUserSummary({ ...request, userReserves: [position, row] })).toThrow(
          `Missing formatted reserve for user asset ${unlisted}`,
        );
        const listedZero = { ...zeroRow, underlyingAsset: assetB };
        const repeat = { ...row, underlyingAsset: assetB };
        for (const userReserves of [
          [position, listedZero, repeat],
          [position, repeat, listedZero],
        ]) {
          expect(() => formatUserSummary({ ...request, userReserves })).toThrow(
            `Duplicate user reserve for asset ${assetB}`,
          );
        }
      }
    }
  });

  it('treats any truthy flag as enabled, as the account totals do', () => {
    for (const field of ['usageAsCollateralEnabledOnUser', 'borrowingEnabledOnUser'] as const) {
      for (const value of ['false', 1]) {
        expect(() =>
          formatUserSummary({ ...request, userReserves: [position, rowWith(field, value)] }),
        ).toThrow(`Missing formatted reserve for user asset ${unlisted}`);
      }
    }
  });

  it('counts a zero-balance collateral flag because it can put the account in isolation mode', () => {
    const isolated = { ...reserveB, debtCeiling: '1000', isolationModeTotalDebt: '0' };
    const flagged = { ...zeroRow, underlyingAsset: assetB, usageAsCollateralEnabledOnUser: true };
    const complete = formatUserSummary({
      ...request,
      userReserves: [position, flagged],
      formattedReserves: [reserveA, isolated],
    });
    expect(complete.isInIsolationMode).toBe(true);
    expect(formatUserSummary(request).isInIsolationMode).toBe(false);
    expect(() =>
      formatUserSummary({
        ...request,
        userReserves: [position, flagged],
        formattedReserves: [reserveA],
      }),
    ).toThrow(`Missing formatted reserve for user asset ${assetB}`);
  });

  it.each<[string, UserReserveData[], string]>([
    ['an identical copy of a position', [position, position], assetA],
    [
      'a debt-free copy of a position',
      [position, { ...position, scaledVariableDebt: '0' }],
      assetA,
    ],
    [
      'an all-zero row after a position',
      [position, { ...zeroRow, underlyingAsset: assetA }],
      assetA,
    ],
    [
      'an all-zero row before a position',
      [{ ...zeroRow, underlyingAsset: assetA }, position],
      assetA,
    ],
    [
      'a copy that differs only in address case',
      [position, { ...position, underlyingAsset: assetACased }],
      assetACased,
    ],
    [
      'a lowercase copy after a mixed-case position',
      [{ ...position, underlyingAsset: assetACased }, position],
      assetA,
    ],
  ])('throws for %s instead of double-counting or guessing', (_, userReserves, named) => {
    expect(() => formatUserSummary({ ...request, userReserves })).toThrow(
      `Duplicate user reserve for asset ${named}`,
    );
  });

  it('keeps a repeated all-zero row once, exactly as if the repeat were absent', () => {
    const listedZero = { ...zeroRow, underlyingAsset: assetB };
    const once = serialized({ userReserves: [position, listedZero] });
    expect(serialized({ userReserves: [position, listedZero, listedZero] })).toBe(once);
    expect(
      serialized({
        userReserves: [
          position,
          listedZero,
          { ...listedZero, underlyingAsset: assetB.toUpperCase() },
        ],
      }),
    ).toBe(once);
    const upperZero = { ...listedZero, underlyingAsset: assetB.toUpperCase() };
    expect(serialized({ userReserves: [position, upperZero, listedZero] })).toBe(
      serialized({ userReserves: [position, upperZero] }),
    );
    expect(
      formatUserSummary({ ...request, userReserves: [position, listedZero, listedZero] })
        .userReservesData,
    ).toHaveLength(2);
    expect(serialized({ userReserves: [position, zeroRow, zeroRow] })).toBe(serialized({}));
  });

  it('throws when a row with balance matches more than one formatted reserve', () => {
    for (const duplicate of [reserveA, { ...reserveA, underlyingAsset: assetACased }]) {
      expect(() =>
        formatUserSummary({ ...request, formattedReserves: [reserveA, reserveB, duplicate] }),
      ).toThrow(`Multiple formatted reserves for user asset ${assetA}`);
    }
  });

  it('skips an all-zero row that matches more than one formatted reserve', () => {
    const ambiguous = { ...zeroRow, underlyingAsset: assetB };
    const formattedReserves = [
      reserveA,
      reserveB,
      { ...reserveB, underlyingAsset: assetB.toUpperCase() },
    ];
    expect(serialized({ userReserves: [position, ambiguous], formattedReserves })).toBe(
      serialized({ formattedReserves }),
    );
  });

  it('matches user and formatted reserve assets regardless of address case', () => {
    const { userReservesData: cased, ...casedTotals } = formatUserSummary({
      ...request,
      userReserves: [{ ...position, underlyingAsset: assetACased }],
    });
    const { userReservesData: lower, ...lowerTotals } = formatUserSummary(request);
    expect(casedTotals).toEqual(lowerTotals);
    expect(cased).toEqual([{ ...lower[0], underlyingAsset: assetACased }]);
  });

  it('returns an empty account before reserves are formatted when every row is zero', () => {
    const userReserves = [zeroRow, { ...zeroRow, underlyingAsset: assetA }];
    const result = formatUserSummary({ ...request, userReserves, formattedReserves: [] });
    expect(JSON.stringify(result)).toBe(serialized({ userReserves: [], formattedReserves: [] }));
    expect(result).toEqual({
      userReservesData: [],
      totalLiquidityMarketReferenceCurrency: '0',
      totalLiquidityUSD: '0',
      totalCollateralMarketReferenceCurrency: '0',
      totalCollateralUSD: '0',
      totalBorrowsMarketReferenceCurrency: '0',
      totalBorrowsUSD: '0',
      netWorthUSD: '0',
      availableBorrowsMarketReferenceCurrency: '0',
      availableBorrowsUSD: '0',
      currentLoanToValue: '0',
      currentLiquidationThreshold: '0',
      healthFactor: '-1',
      userEmodeCategoryId: 0,
      isInIsolationMode: false,
      poolAccountData: {
        totalCollateralBase: '0',
        totalDebtBase: '0',
        availableBorrowsBase: '0',
        currentLiquidationThreshold: '0',
        ltv: '0',
        healthFactor: (2n ** 256n - 1n).toString(),
      },
    });
  });

  it('applies the same rule through formatUserSummaryAndIncentives', () => {
    const incentivesRequest: FormatUserSummaryAndIncentivesRequest = {
      ...request,
      reserveIncentives: [new ReserveIncentiveMock().reserveIncentive],
      userIncentives: [new UserIncentiveMock().userIncentive],
    };
    expect(
      JSON.stringify(
        formatUserSummaryAndIncentives({ ...incentivesRequest, userReserves: [position, zeroRow] }),
      ),
    ).toBe(JSON.stringify(formatUserSummaryAndIncentives(incentivesRequest)));
    expect(() =>
      formatUserSummaryAndIncentives({
        ...incentivesRequest,
        userReserves: [position, { ...zeroRow, scaledVariableDebt: '1' }],
      }),
    ).toThrow(`Missing formatted reserve for user asset ${unlisted}`);
  });
});
