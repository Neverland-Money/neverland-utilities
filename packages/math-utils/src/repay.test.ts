import * as math from './index';

const bufferedRepay = math.calculateBufferedRepayAmount;

const R = 10n ** 27n;
const Y = 31_536_000n;
const UINT128_MAX = 2n ** 128n - 1n;
const UINT256_MAX = 2n ** 256n - 1n;
const halfUp = (a: bigint, b: bigint) => (a * b + R / 2n) / R;
const ceil = (a: bigint, b: bigint) => a / b + (a % b === 0n ? 0n : 1n);

// Independent transcription of lending-core 1.1.0 MathUtils.sol:50-84 and
// ReserveLogic.sol:96-106,293-305, revision a26582fcc24df718a57efd505d51d8cdeeed388d.
// Expectations below never use the SDK's exponentiation or envelope formula.
function sourceInterest(rate: bigint, seconds: bigint): bigint {
  const power2 = halfUp(rate, rate) / (Y * Y);
  const power3 = halfUp(power2, rate) / Y;
  return (
    R +
    (rate * seconds) / Y +
    (seconds * (seconds > 0n ? seconds - 1n : 0n) * power2) / 2n +
    (seconds * (seconds > 0n ? seconds - 1n : 0n) * (seconds > 1n ? seconds - 2n : 0n) * power3) /
      6n
  );
}

function sourceFutureIndex(stored: bigint, age: bigint, parts: number[], rate: bigint): bigint {
  if (parts.length === 0) return halfUp(stored, sourceInterest(rate, age));
  let index = halfUp(stored, sourceInterest(rate, age + BigInt(parts[0])));
  for (const seconds of parts.slice(1)) {
    index = halfUp(index, sourceInterest(rate, BigInt(seconds)));
  }

  return index;
}

function updatePartitions(seconds: number, seed: number): number[][] {
  if (seconds === 0) return [[]];
  const choices = [[seconds], Array<number>(seconds).fill(1)];
  if (seconds > 1) {
    choices.push([Math.floor(seconds / 2), seconds - Math.floor(seconds / 2)]);
    let remaining = seconds;
    const irregular: number[] = [];
    while (remaining > 0) {
      const interval = Math.min(remaining, 1 + ((remaining * 17 + seed) % 97));
      irregular.push(interval);
      remaining -= interval;
    }

    choices.push(irregular);
  }

  return choices;
}

function checkSnapshot(stored: bigint, age: bigint, scaledDebt: bigint, rate: bigint): number {
  const currentIndex = sourceFutureIndex(stored, age, [], rate);
  if (currentIndex > UINT128_MAX) return 0;
  const debt = ceil(scaledDebt * currentIndex, R);
  let witnesses = 0;
  for (const seconds of [0, 1, 2, 600, 3600]) {
    const amount = BigInt(
      bufferedRepay({
        debtRaw: debt.toString(),
        variableBorrowRateRay: rate.toString(),
        windowSeconds: seconds,
      }),
    );
    for (const parts of updatePartitions(seconds, witnesses)) {
      const actual = ceil(scaledDebt * sourceFutureIndex(stored, age, parts, rate), R);
      expect(amount).toBeGreaterThan(actual);
      witnesses += 1;
    }
  }

  return witnesses;
}

describe('calculateBufferedRepayAmount', () => {
  it.each([
    ['0', '0', 600, '1'],
    ['1000000', '50000000000000000000000000', 600, '1000002'],
    ['1000000000000000000', '50000000000000000000000000', 600, '1000000951294211240'],
    ['1000000000000000000000000', '50000000000000000000000000', 600, '1000000951294211238855626'],
    ['1000000000000000000', '0', 600, '1000000000000000001'],
    ['1000000000000000000', '50000000000000000000000000', 0, '1000000000000000001'],
    [
      '1000000000000000000000000',
      '1000000000000000000000000000000',
      3600,
      '1120924107696836175420207',
    ],
    [
      '1000000000000000000000000',
      '1000000000000000000123456789',
      3600,
      '1000114161765290049160090',
    ],
  ] as const)(
    'matches an independent literal vector %s / %s / %s',
    (debt, rate, seconds, expected) => {
      expect(
        bufferedRepay({ debtRaw: debt, variableBorrowRateRay: rate, windowSeconds: seconds }),
      ).toBe(expected);
    },
  );

  it('defaults to 600 seconds and normalizes integer strings without losing precision', () => {
    expect(
      bufferedRepay({
        debtRaw: '0001000000000000000000000000',
        variableBorrowRateRay: '00050000000000000000000000000',
      }),
    ).toBe('1000000951294211238855626');
  });

  it('covers the literal 300 + 300 update counterexample to one contract accrual', () => {
    const debt = 10n ** 24n;
    const rate = R / 20n;
    const oldAmount = ceil(debt * sourceInterest(rate, 600n), R) + 1n;
    const splitDebt = ceil(debt * sourceFutureIndex(R, 0n, [300, 300], rate), R);
    expect(oldAmount.toString()).toBe('1000000951294211238820297');
    expect(splitDebt.toString()).toBe('1000000951294211238846829');
    expect(splitDebt - oldAmount).toBe(26_532n);
    expect(
      bufferedRepay({ debtRaw: debt.toString(), variableBorrowRateRay: rate.toString() }),
    ).toBe('1000000951294211238855626');
    expect(
      BigInt(bufferedRepay({ debtRaw: debt.toString(), variableBorrowRateRay: rate.toString() })),
    ).toBeGreaterThan(splitDebt);
  });

  it('bounds arbitrary update partitions with an unknown stored-index age and half-up indexes', () => {
    let witnesses = 0;
    for (const rate of [0n, 1n, Y - 1n, Y, Y + 1n, R / 20n, R, 10n * R, 1000n * R]) {
      for (const age of [0n, 1n, 2n, 600n, 86_400n, Y]) {
        for (const scaledDebt of [1n, 3n, 10n ** 6n, 10n ** 18n, 10n ** 24n, 10n ** 30n]) {
          // The one-atom and half-ray offsets expose rounding hidden by an exact RAY index.
          const stored = R + (scaledDebt % R) + R / 2n + 1n;
          witnesses += checkSnapshot(stored, age, scaledDebt, rate);
        }
      }
    }

    expect(witnesses).toBe(4860);
  });

  it('covers a maximal uint128 rate for one second without a number conversion', () => {
    const amount = bufferedRepay({
      debtRaw: '9007199254740993',
      variableBorrowRateRay: UINT128_MAX.toString(),
      windowSeconds: 1,
    });
    const actual = ceil(9_007_199_254_740_993n * sourceInterest(UINT128_MAX, 1n), R);
    expect(amount).toBe('97199236833063025400');
    expect(BigInt(amount)).toBeGreaterThan(actual);
    expect(BigInt(amount)).toBeLessThan(UINT256_MAX);
  });

  it('allows the last finite output and rejects the unlimited sentinel output', () => {
    expect(
      bufferedRepay({ debtRaw: (UINT256_MAX - 2n).toString(), variableBorrowRateRay: '0' }),
    ).toBe((UINT256_MAX - 1n).toString());
    expect(() =>
      bufferedRepay({ debtRaw: (UINT256_MAX - 1n).toString(), variableBorrowRateRay: '0' }),
    ).toThrow();
  });

  it('rejects growth overflow quickly while zero debt still returns one atom', () => {
    expect(() =>
      bufferedRepay({
        debtRaw: '1',
        variableBorrowRateRay: UINT128_MAX.toString(),
        windowSeconds: 3600,
      }),
    ).toThrow();
    expect(
      bufferedRepay({
        debtRaw: '0',
        variableBorrowRateRay: UINT128_MAX.toString(),
        windowSeconds: 3600,
      }),
    ).toBe('1');
  });

  it.each([
    '',
    '-1',
    '+1',
    '1.1',
    'NaN',
    'Infinity',
    '1e20',
    ' 1',
    '0x10',
    UINT256_MAX.toString(),
    (UINT256_MAX + 1n).toString(),
    '1'.repeat(1000),
  ])('rejects malformed or nonfinite debt %s', debtRaw => {
    expect(() => bufferedRepay({ debtRaw, variableBorrowRateRay: '0' })).toThrow();
  });

  it.each([
    '',
    '-1',
    '+1',
    '1.1',
    'NaN',
    'Infinity',
    '1e20',
    ' 1',
    '0x10',
    (UINT128_MAX + 1n).toString(),
  ])('rejects malformed or out-of-range rate %s', variableBorrowRateRay => {
    expect(() => bufferedRepay({ debtRaw: '0', variableBorrowRateRay })).toThrow();
  });

  it.each([-1, 3601, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER])(
    'rejects invalid horizon %s',
    windowSeconds => {
      expect(() =>
        bufferedRepay({ debtRaw: '0', variableBorrowRateRay: '0', windowSeconds }),
      ).toThrow();
    },
  );

  it('rejects runtime number coercion for raw amounts and string coercion for horizons', () => {
    for (const [field, value] of [
      ['debtRaw', 1],
      ['variableBorrowRateRay', 0],
      ['windowSeconds', '600'],
    ] as const) {
      const params = { debtRaw: '1', variableBorrowRateRay: '0', windowSeconds: 600 };
      Reflect.set(params, field, value);
      expect(() => bufferedRepay(params)).toThrow();
    }
  });
});
