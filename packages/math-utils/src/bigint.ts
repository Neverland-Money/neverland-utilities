/** Exact powers of ten without BigInt exponentiation, which some client bundlers lower to Math.pow. */
export function pow10(exponent: number): bigint {
  if (!Number.isSafeInteger(exponent) || exponent < 0) {
    throw new RangeError('exponent must be a nonnegative safe integer');
  }

  return BigInt(`1${'0'.repeat(exponent)}`);
}
