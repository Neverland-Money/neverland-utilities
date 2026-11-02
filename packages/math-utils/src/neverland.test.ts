import { annualizeEmissionRaw, emissionAprPercent, estimateVeDustPower } from './index';

const NOW = 1_700_000_000;
const YEAR = 31_536_000;

describe('estimateVeDustPower display arithmetic', () => {
  it.each([
    {
      label: 'permanent fractional amount',
      dustAmount: 12.34567,
      remaining: -10,
      isPermanent: true,
      expected: 12.34567,
    },
    { label: 'expired', dustAmount: 100, remaining: -1, isPermanent: false, expected: 0 },
    { label: 'at expiry', dustAmount: 100, remaining: 0, isPermanent: false, expected: 0 },
    {
      label: 'half year',
      dustAmount: 123.45,
      remaining: YEAR / 2,
      isPermanent: false,
      expected: 61.73,
    },
    {
      label: 'one-second residual',
      dustAmount: YEAR,
      remaining: 1,
      isPermanent: false,
      expected: 1,
    },
    {
      label: 'below two-decimal boundary',
      dustAmount: 1.004999,
      remaining: YEAR,
      isPermanent: false,
      expected: 1,
    },
    {
      label: 'above two-decimal boundary',
      dustAmount: 1.005001,
      remaining: YEAR,
      isPermanent: false,
      expected: 1.01,
    },
    {
      label: 'beyond one year is uncapped',
      dustAmount: 10,
      remaining: YEAR * 2,
      isPermanent: false,
      expected: 20,
    },
    {
      label: 'multiply after remaining/year division',
      dustAmount: 38_631_600,
      remaining: 1,
      isPermanent: false,
      expected: 1.22,
    },
    {
      label: 'negative amount remains negative',
      dustAmount: -10,
      remaining: YEAR,
      isPermanent: false,
      expected: -10,
    },
    {
      label: 'NaN remains NaN',
      dustAmount: NaN,
      remaining: YEAR,
      isPermanent: false,
      expected: NaN,
    },
    {
      label: 'infinite amount remains infinite',
      dustAmount: Infinity,
      remaining: YEAR,
      isPermanent: false,
      expected: Infinity,
    },
    {
      label: 'expired infinite amount yields NaN',
      dustAmount: Infinity,
      remaining: 0,
      isPermanent: false,
      expected: NaN,
    },
  ])('$label', ({ dustAmount, remaining, isPermanent, expected }) => {
    expect(
      estimateVeDustPower({
        dustAmount,
        endTimestamp: NOW + remaining,
        currentTimestamp: NOW,
        isPermanent,
      }),
    ).toBe(expected);
  });

  it('uses explicit time without reading the wall clock', () => {
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('clock read');
    });
    try {
      expect(
        estimateVeDustPower({
          dustAmount: 10,
          endTimestamp: NOW + YEAR,
          currentTimestamp: NOW + YEAR / 2,
          isPermanent: false,
        }),
      ).toBe(5);
    } finally {
      clock.mockRestore();
    }
  });

  it.each([NaN, Infinity])('preserves nonfinite timestamp %s', endTimestamp => {
    expect(
      estimateVeDustPower({
        dustAmount: 10,
        endTimestamp,
        currentTimestamp: NOW,
        isPermanent: false,
      }),
    ).toBe(endTimestamp);
  });
});

describe('emissionAprPercent display arithmetic', () => {
  it.each([
    { annual: 100, price: 2, tvl: 1000, expected: '20.0000' },
    { annual: 100, price: 2, tvl: 0, expected: '0' },
    { annual: Infinity, price: NaN, tvl: -1, expected: '0' },
    { annual: 100, price: 0, tvl: 1000, expected: '0.0000' },
    { annual: 0.0000005, price: 1, tvl: 1, expected: '0.0000' },
    { annual: 0.0000005000001, price: 1, tvl: 1, expected: '0.0001' },
    { annual: 100, price: 2, tvl: NaN, expected: 'NaN' },
    { annual: 100, price: 2, tvl: Infinity, expected: '0.0000' },
    { annual: 100, price: Infinity, tvl: 1000, expected: 'Infinity' },
    { annual: 100, price: -Infinity, tvl: 1000, expected: '-Infinity' },
    { annual: NaN, price: 2, tvl: 1000, expected: 'NaN' },
    { annual: 100, price: -2, tvl: 1000, expected: '-20.0000' },
    { annual: 1e308, price: 10, tvl: 1e308, expected: 'Infinity' },
  ])('$annual tokens at $price USD over $tvl TVL', ({ annual, price, tvl, expected }) => {
    expect(emissionAprPercent(annual, price, tvl)).toBe(expected);
  });
});

describe('annualizeEmissionRaw', () => {
  it.each([
    [0n, 0n],
    [1n, 31_536_000n],
    [-1n, -31_536_000n],
    [900719925474099312345678901234567890n, 28405103569751195914133329829333332979040000n],
  ])('annualizes %s entirely in integer units', (rate, expected) => {
    expect(annualizeEmissionRaw(rate)).toBe(expected);
  });
});
