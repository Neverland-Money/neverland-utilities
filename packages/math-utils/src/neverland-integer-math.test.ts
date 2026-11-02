import BigNumber from 'bignumber.js';
import type { FormatUserSummaryRequest } from './formatters/user';
import { formatUserReserve } from './formatters/user/format-user-reserve';
import { generateUserReserveSummary } from './formatters/user/generate-user-reserve-summary';
import { UserReserveMock } from './mocks';
import * as math from './index';

// Independent native integer transcription of lending-core 1.1.0 MathUtils/GenericLogic.
// No production math helper is used to construct expected values.
const R = 10n ** 27n;
const W = 10n ** 18n;
const Y = 31536000n;
const MAX = (2n ** 256n - 1n).toString();
const mulHalfUp = (a: bigint, b: bigint) => (a * b + R / 2n) / R;
const ceil = (a: bigint, b: bigint) => a / b + (a % b === 0n ? 0n : 1n);
function interest(rate: bigint, elapsed: bigint) {
  if (elapsed === 0n) return R;
  const p2 = mulHalfUp(rate, rate) / (Y * Y);
  const p3 = mulHalfUp(p2, rate) / Y;
  return (
    R +
    (rate * elapsed) / Y +
    (elapsed * (elapsed - 1n) * p2) / 2n +
    (elapsed * (elapsed - 1n) * (elapsed > 2n ? elapsed - 2n : 0n) * p3) / 6n
  );
}

const fixed18 = (raw: bigint) => new BigNumber(raw.toString()).shiftedBy(-18).toFixed();

type LegacyEMode = {
  id: number;
  ltv: string;
  liquidationThreshold: string;
  priceInMarketReferenceCurrency?: string;
};
type ExactRequest = FormatUserSummaryRequest & { legacyEMode?: LegacyEMode };
function position(
  index: number,
  overrides: {
    decimals?: number;
    supply?: string;
    variableDebt?: string;
    stableDebt?: string;
    price?: string;
    ltv?: string;
    lt?: string;
    collateral?: boolean;
    borrow?: boolean;
    category?: number;
    debtCeiling?: string;
    isolationDebt?: string;
  } = {},
) {
  const mock = new UserReserveMock({ decimals: overrides.decimals ?? 6 });
  const asset = `0x${String(index).padStart(40, '0')}`;
  return {
    user: {
      ...mock.userReserve,
      underlyingAsset: asset,
      scaledATokenBalance: overrides.supply ?? '0',
      scaledVariableDebt: overrides.variableDebt ?? '0',
      currentStableDebt: overrides.stableDebt,
      borrowingEnabledOnUser: overrides.borrow,
      usageAsCollateralEnabledOnUser: overrides.collateral ?? true,
    },
    reserve: {
      ...mock.reserve,
      underlyingAsset: asset,
      liquidityRate: '0',
      variableBorrowRate: '0',
      priceInMarketReferenceCurrency: overrides.price ?? '1000000',
      baseLTVasCollateral: overrides.ltv ?? '7000',
      reserveLiquidationThreshold: overrides.lt ?? '8000',
      debtCeiling: overrides.debtCeiling ?? '0',
      isolationModeTotalDebt: overrides.isolationDebt ?? '0',
      eModeCategoryId: overrides.category,
    },
  };
}

function request(
  rows: Array<ReturnType<typeof position>>,
  legacyEMode?: LegacyEMode,
): ExactRequest {
  return {
    userReserves: rows.map(row => row.user),
    formattedReserves: rows.map(row => row.reserve),
    currentTimestamp: 1,
    marketReferenceCurrencyDecimals: 6,
    marketReferencePriceInUsd: '100000000',
    userEmodeCategoryId: legacyEMode?.id ?? 0,
    legacyEMode,
  };
}

function rawSummary(input: ExactRequest) {
  const data = math.formatUserSummary(input).poolAccountData;
  expect(data).toBeDefined();
  if (!data) throw new Error('Formatter did not include poolAccountData');
  return data;
}

function isRayOperation(value: unknown): value is (a: string, b: string) => BigNumber {
  return typeof value === 'function';
}

function rayOperation(name: string) {
  const operation: unknown = Reflect.get(math, name);
  expect(typeof operation).toBe('function');
  if (!isRayOperation(operation)) throw new Error(`Missing root export ${name}`);
  return operation;
}

describe('Neverland 1.1.0 directional RAY math', () => {
  const pairs = [
    [0n, R],
    [1n, R],
    [1n, R / 2n - 1n],
    [1n, R / 2n + 1n],
    [9007199254740993000000007n, R + 1n],
    [2n ** 128n - 1n, 2n ** 128n - 1n],
  ];
  for (const [name, numerator, denominator, roundUp] of [
    ['rayMulFloor', 1n, R, false],
    ['rayMulCeil', 1n, R, true],
    ['rayDivFloor', R, 1n, false],
    ['rayDivCeil', R, 1n, true],
  ] as const) {
    it(`${name} uses exact integer direction including >2^53`, () => {
      const operation = rayOperation(name);
      for (const [a, b] of pairs) {
        const num = numerator === R ? a * R : a * b;
        const den = denominator === R ? R : b;
        expect(operation(a.toString(), b.toString()).toFixed(0)).toBe(
          (roundUp ? ceil(num, den) : num / den).toString(),
        );
      }
    });
    it(`${name} rejects fractional, negative and nonfinite operands`, () => {
      const operation = rayOperation(name);
      for (const bad of ['-1', '0.5', 'NaN', 'Infinity']) {
        expect(() => operation(bad, R.toString())).toThrow();
        expect(() => operation('1', bad)).toThrow();
      }
    });
  }

  it('rejects zero divisors', () => {
    for (const name of ['rayDivFloor', 'rayDivCeil']) {
      const operation = rayOperation(name);
      expect(() => operation('1', '0')).toThrow();
    }
  });
  it('preserves half-up index multiplication', () => {
    expect(math.rayMul('1', (R / 2n).toString()).toFixed(0)).toBe('1');
  });
});

describe('Neverland interest and raw token balances', () => {
  for (const elapsed of [0, 1, 2, 3, 13, 600, 3600, 86400]) {
    it(`matches contract term order after ${elapsed} seconds`, () => {
      const rate = 50000000000000000000000000n;
      const input = {
        rate: rate.toString(),
        currentTimestamp: 123 + elapsed,
        lastUpdateTimestamp: 123,
      };
      expect(math.calculateLinearInterest(input).toFixed(0)).toBe(
        (R + (rate * BigInt(elapsed)) / Y).toString(),
      );
      expect(math.calculateCompoundedInterest(input).toFixed(0)).toBe(
        interest(rate, BigInt(elapsed)).toString(),
      );
    });
  }

  it('retains the independently derived one-ray linear witness', () => {
    expect(
      math
        .calculateLinearInterest({
          rate: '10000000000000000000000000',
          currentTimestamp: 13,
          lastUpdateTimestamp: 0,
        })
        .toFixed(0),
    ).toBe('1000000004122272957889396245');
  });
  for (const decimals of [6, 8, 18]) {
    it(`floors supply and ceils variable debt directly for ${decimals}-decimal raw balances`, () => {
      for (const balance of [0n, 1n, 9007199254740993n, 10n ** BigInt(decimals)]) {
        const index = R + R / 3n;
        const common = { currentTimestamp: 600, lastUpdateTimestamp: 0 };
        expect(
          math
            .getLinearBalance({
              balance: balance.toString(),
              index: index.toString(),
              rate: '0',
              ...common,
            })
            .toFixed(0),
        ).toBe(((balance * index) / R).toString());
        expect(
          math
            .getCompoundedBalance({
              principalBalance: balance.toString(),
              reserveIndex: index.toString(),
              reserveRate: '0',
              ...common,
            })
            .toFixed(0),
        ).toBe(ceil(balance * index, R).toString());
      }
    });
  }

  it('independently reconciles the old long-elapsed interest/balance expectations', () => {
    const rate = 500000000000000000n;
    const elapsed = 100000100n;
    expect(interest(rate, elapsed).toString()).toBe('1000000001585491184677828513');
    const input = {
      reserveRate: rate.toString(),
      currentTimestamp: 1729942300,
      lastUpdateTimestamp: 1629942200,
      principalBalance: '10000',
      reserveIndex: '1048540642417873765200833079',
    };
    expect(math.getCompoundedBalance(input).toFixed(0)).toBe('10486');
  });
  it('exposes required fixed integer RAY indexes at the balance valuation timestamp', () => {
    const row = position(1, { supply: '9007199254740993', variableDebt: '1' });
    row.reserve.liquidityRate = '10000000000000000000000000';
    row.reserve.variableBorrowRate = '50000000000000000000000000';
    const input = { ...request([row]), currentTimestamp: 601 };
    const result = math.formatUserSummary(input).userReservesData[0];
    expect(Reflect.get(result, 'normalizedIncome')).toBe(
      (R + (10000000000000000000000000n * 600n) / Y).toString(),
    );
    expect(Reflect.get(result, 'normalizedVariableDebt')).toBe(
      interest(50000000000000000000000000n, 600n).toString(),
    );
  });
});

describe('Neverland per-reserve and weighted account data', () => {
  it('retains the weighted LT numerator before truncating the reported average', () => {
    const input = request([
      position(1, { supply: '1', lt: '8000' }),
      position(2, { supply: '2', lt: '8001', variableDebt: '2' }),
    ]);
    expect(rawSummary(input)).toEqual({
      totalCollateralBase: '3',
      totalDebtBase: '2',
      availableBorrowsBase: '0',
      currentLiquidationThreshold: '8000',
      ltv: '7000',
      healthFactor: '1200100000000000000',
    });
    expect(math.formatUserSummary(input).healthFactor).toBe('1.2001');
  });
  it('floors each collateral and ceils each reserve debt before aggregation with mixed decimals', () => {
    const input = request(
      [6, 8, 18].map((decimals, i) =>
        position(i + 1, {
          decimals,
          supply: '3',
          variableDebt: '1',
          price: (10n ** BigInt(decimals) / 2n).toString(),
        }),
      ),
    );
    expect(rawSummary(input)).toEqual({
      totalCollateralBase: '3',
      totalDebtBase: '3',
      availableBorrowsBase: '0',
      currentLiquidationThreshold: '8000',
      ltv: '7000',
      healthFactor: '800000000000000000',
    });
  });
  it('adds stable and variable raw debt before one reserve valuation ceiling', () => {
    const input = request([
      position(1, { supply: '10', variableDebt: '1', stableDebt: '1', price: '500000' }),
    ]);
    expect(rawSummary(input)).toEqual({
      totalCollateralBase: '5',
      totalDebtBase: '1',
      availableBorrowsBase: '2',
      currentLiquidationThreshold: '8000',
      ltv: '7000',
      healthFactor: '4000000000000000000',
    });
    expect(math.formatUserSummary(input).userReservesData[0].totalBorrows).toBe('0.000002');
  });
  it('infers omitted borrow flags from stable or variable debt but respects explicit false', () => {
    const rows = [
      position(1, { stableDebt: '1' }),
      position(2, { variableDebt: '1', borrow: false }),
      position(3, { variableDebt: '1', borrow: true }),
    ];
    expect(rawSummary(request(rows)).totalDebtBase).toBe('2');
  });
  it('includes zero-LTV and zero ordinary-LT enabled collateral in the total', () => {
    const input = request([
      position(1, { supply: '10', ltv: '0', lt: '0' }),
      position(2, { supply: '10', variableDebt: '1' }),
    ]);
    expect(rawSummary(input)).toEqual({
      totalCollateralBase: '20',
      totalDebtBase: '1',
      availableBorrowsBase: '6',
      currentLiquidationThreshold: '4000',
      ltv: '3500',
      healthFactor: '8000000000000000000',
    });
  });
  it('excludes disabled collateral from weighted risk and total collateral', () => {
    expect(
      rawSummary(request([position(1, { supply: '10', collateral: false })])).totalCollateralBase,
    ).toBe('0');
  });
  it('floors average LTV before floored headroom percentage multiplication', () => {
    const input = request([
      position(1, { supply: '5000', ltv: '1' }),
      position(2, { supply: '5001', ltv: '2' }),
    ]);
    expect(rawSummary(input).ltv).toBe('1');
    expect(rawSummary(input).availableBorrowsBase).toBe('1');
    expect(
      math
        .calculateAvailableBorrowsMarketReferenceCurrency({
          collateralBalanceMarketReferenceCurrency: '3',
          borrowBalanceMarketReferenceCurrency: '0',
          currentLtv: '5000',
        })
        .toFixed(),
    ).toBe('1');
  });
  it('returns uint256.max raw HF and the existing -1 UI sentinel with no debt', () => {
    const input = request([position(1, { supply: '10' })]);
    expect(rawSummary(input).healthFactor).toBe(MAX);
    expect(math.formatUserSummary(input).healthFactor).toBe('-1');
    expect(rawSummary(request([]))).toEqual({
      totalCollateralBase: '0',
      totalDebtBase: '0',
      availableBorrowsBase: '0',
      currentLiquidationThreshold: '0',
      ltv: '0',
      healthFactor: MAX,
    });
  });
  it('retains isolation-capped UI borrow fields and uncapped Pool headroom', () => {
    const input = request([
      position(1, { supply: '1000000000', debtCeiling: '100', isolationDebt: '75' }),
    ]);
    const result = math.formatUserSummary(input);
    expect(result.availableBorrowsMarketReferenceCurrency).toBe('0.25');
    expect(result.availableBorrowsUSD).toBe('0.25');
    expect(rawSummary(input).availableBorrowsBase).toBe('700000000');
  });
  it('preserves wadDiv half-up before /10000 at a one-wei HF boundary', () => {
    const input = request([
      position(1, { supply: '1', lt: '10000', variableDebt: '1000000000000000001' }),
    ]);
    // floor(weightedLT*W/debt/B) would incorrectly produce zero.
    expect(rawSummary(input).healthFactor).toBe('1');
    expect(math.formatUserSummary(input).healthFactor).toBe('0.000000000000000001');
  });
  it('floors HF to its 18-decimal public precision and accepts fractional synthetic preview inputs', () => {
    const input = {
      collateralBalanceMarketReferenceCurrency: '100000000000000000',
      borrowBalanceMarketReferenceCurrency: '30000000000000000',
      currentLiquidationThreshold: '5000',
    };
    const hfRaw =
      (100000000000000000n * 5000n * W + 15000000000000000n) / 30000000000000000n / 10000n;
    expect(fixed18(hfRaw)).toBe('1.666666666666666666');
    expect(math.calculateHealthFactorFromBalances(input).toFixed()).toBe(fixed18(hfRaw));
    const bigHfRaw =
      (100000000000000000n * 50000000n * W + 15000000000000000n) / 30000000000000000n / 10000n;
    expect(fixed18(bigHfRaw)).toBe('16666.666666666666666666');
    expect(math.calculateHealthFactorFromBalancesBigUnits(input).toFixed()).toBe(fixed18(bigHfRaw));
    expect(
      math
        .calculateHealthFactorFromBalancesBigUnits({
          collateralBalanceMarketReferenceCurrency: '200.000001',
          borrowBalanceMarketReferenceCurrency: '10.000003',
          currentLiquidationThreshold: '0.6',
        })
        .toFixed(),
    ).toBe(fixed18((200000001n * 6000n * W) / 10000003n / 10000n));
  });
});

describe('legacy eMode exact category membership and shared price', () => {
  const context = {
    id: 2,
    ltv: '9000',
    liquidationThreshold: '9500',
    priceInMarketReferenceCurrency: '2000000',
  };
  it('uses category risk and shared price for matching collateral and debt only', () => {
    const input = request(
      [
        position(1, { supply: '10', variableDebt: '1', category: 2, lt: '0' }),
        position(2, { supply: '10', variableDebt: '1', category: 1 }),
      ],
      context,
    );
    expect(rawSummary(input)).toEqual({
      totalCollateralBase: '30',
      totalDebtBase: '3',
      availableBorrowsBase: '21',
      currentLiquidationThreshold: '9000',
      ltv: '8333',
      healthFactor: '9000000000000000000',
    });
  });
  it('requires membership on every supplied reserve and rejects mismatched context IDs', () => {
    expect(() => math.formatUserSummary(request([position(1)], context))).toThrow(
      /eModeCategoryId/,
    );
    const input = { ...request([position(1, { category: 2 })], context), userEmodeCategoryId: 1 };
    expect(() => math.formatUserSummary(input)).toThrow(/legacyEMode/);
  });
  for (const price of [undefined, '0']) {
    it(`falls back to ordinary asset price when shared price is ${String(price)}`, () => {
      const input = request([position(1, { supply: '10', variableDebt: '1', category: 2 })], {
        ...context,
        priceInMarketReferenceCurrency: price,
      });
      expect(rawSummary(input).totalCollateralBase).toBe('10');
      expect(rawSummary(input).totalDebtBase).toBe('1');
    });
  }

  it('never activates category zero', () => {
    expect(
      rawSummary(request([position(1, { supply: '10', category: 0 })], { ...context, id: 0 })).ltv,
    ).toBe('7000');
  });
  it('preserves existing bitmap category semantics without legacy context', () => {
    const input = { ...request([position(1, { supply: '10' })]), userEmodeCategoryId: 1 };
    expect(rawSummary(input).ltv).toBe('6000');
    expect(rawSummary(input).currentLiquidationThreshold).toBe('7000');
  });
  it('threads the same context through the incentive entrypoint', () => {
    const input = {
      ...request([position(1, { supply: '10', variableDebt: '1', category: 2 })], context),
      reserveIncentives: [],
      userIncentives: [],
    };
    expect(Reflect.get(math.formatUserSummaryAndIncentives(input), 'poolAccountData')).toEqual(
      rawSummary(input),
    );
    expect(rawSummary(input).totalCollateralBase).toBe('20');
  });
});

describe('manual deep formatter migration boundary', () => {
  for (const missing of ['normalizedIncome', 'normalizedVariableDebt']) {
    it(`rejects a manually constructed raw summary missing ${missing}`, () => {
      const row = position(1);
      const generated = generateUserReserveSummary({
        userReserve: { ...row.user, reserve: row.reserve },
        marketReferencePriceInUsdNormalized: '1',
        marketReferenceCurrencyDecimals: 6,
        currentTimestamp: 1,
      });
      Reflect.deleteProperty(generated, missing);
      expect(() =>
        formatUserReserve({ reserve: generated, marketReferenceCurrencyDecimals: 6 }),
      ).toThrow(/normalized/);
    });
  }
});
