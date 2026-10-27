// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface CalculateBufferedRepayAmountParams {
  debtRaw: string;
  variableBorrowRateRay: string;
  windowSeconds?: number;
}

const RAY = 10n ** 27n;
const YEAR = 31_536_000n;
const UINT128_MAX = 2n ** 128n - 1n;
const UINT256_MAX = 2n ** 256n - 1n;

function unsignedInteger(value: string, name: string, maximum: bigint): bigint {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new TypeError(`${name} must be an unsigned decimal integer string`);
  }

  const normalized = value.replace(/^0+(?=\d)/, '');
  if (normalized.length > maximum.toString().length) {
    throw new RangeError(`${name} is out of range`);
  }

  const parsed = BigInt(normalized);
  if (parsed > maximum) throw new RangeError(`${name} is out of range`);
  return parsed;
}

const ceilDiv = (value: bigint, denominator: bigint): bigint =>
  (value + denominator - 1n) / denominator;

/**
 * Prepare a finite variable-debt repayment in raw token units.
 *
 * Uses O(log(windowSeconds)) upward-rounded ray exponentiation. The bound covers
 * arbitrary reserve-update partitions and an unknown stored-index age when the
 * current debt is ceiled, indexes are at least RAY, and the supplied rate does not
 * increase before execution within the horizon. See README.md for the proof and
 * snapshot assumptions. Freeze this returned string across permit and calldata.
 * Zero debt returns one atom; callers should skip repayment when debt is zero.
 */
export function calculateBufferedRepayAmount({
  debtRaw,
  variableBorrowRateRay,
  windowSeconds = 600,
}: CalculateBufferedRepayAmountParams): string {
  const debt = unsignedInteger(debtRaw, 'debtRaw', UINT256_MAX - 1n);
  const rate = unsignedInteger(variableBorrowRateRay, 'variableBorrowRateRay', UINT128_MAX);
  if (!Number.isInteger(windowSeconds) || windowSeconds < 0 || windowSeconds > 3600) {
    throw new RangeError('windowSeconds must be an integer from 0 through 3600');
  }

  if (debt > UINT256_MAX - 2n) {
    throw new RangeError('Buffered repayment must be below uint256.max');
  }

  if (debt === 0n || rate === 0n || windowSeconds === 0) return (debt + 1n).toString();

  const a = rate / YEAR;
  const c2 = (rate * rate + RAY / 2n) / RAY / (YEAR * YEAR);
  const c3 = (c2 * rate + RAY / 2n) / RAY / YEAR;
  const candidates = [
    ceilDiv(rate, YEAR),
    a > 0n ? ceilDiv(c2 * RAY, a) : 0n,
    c2 > 0n ? ceilDiv(c3 * RAY, c2) : 0n,
  ];
  const h = candidates.reduce((largest, value) => (value > largest ? value : largest));
  let base = ceilDiv((RAY + h) * (RAY + 1n), RAY);

  // ceil(debt * factor / RAY) + 1 must stay strictly below uint256.max.
  // Bound every power intermediate before squaring, so even overflowing inputs
  // use small bounded bigints rather than constructing an enormous exponent.
  const factorLimit = ((UINT256_MAX - 2n) * RAY) / debt;
  const productLimit = factorLimit * RAY;
  const multiplyCeil = (left: bigint, right: bigint): bigint => {
    if (left > factorLimit || right > factorLimit) {
      throw new RangeError('Buffered repayment must be below uint256.max');
    }

    const product = left * right;
    if (product > productLimit) {
      throw new RangeError('Buffered repayment must be below uint256.max');
    }

    return ceilDiv(product, RAY);
  };

  let factor = RAY;
  let exponent = windowSeconds;
  while (exponent > 0) {
    if (exponent % 2 === 1) factor = multiplyCeil(factor, base);
    exponent = Math.floor(exponent / 2);
    if (exponent > 0) base = multiplyCeil(base, base);
  }

  return (ceilDiv(debt * factor, RAY) + 1n).toString();
}
