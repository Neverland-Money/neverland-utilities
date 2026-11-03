import { pow10 } from './bigint';

describe('pow10', () => {
  it.each([0, 6, 18, 27, 36, 256])('returns exact 10^%i as a bigint', exponent => {
    expect(pow10(exponent)).toBe(10n ** BigInt(exponent));
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid exponent %s',
    exponent => {
      expect(() => pow10(exponent)).toThrow(RangeError);
    },
  );
});
