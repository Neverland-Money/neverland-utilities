import { DustIncentiveProvider } from './dust-incentive-provider-contract';
import { DustLockHelper } from './dust-lock-contract';

const NOW = 1_700_000_000;
const YEAR = 31_536_000;

describe('DustLockHelper display calculations', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000 + 999);
  });

  it.each([
    { dustAmount: 12.34567, remaining: -1, isPermanent: true, expected: 12.34567 },
    { dustAmount: 100, remaining: -1, isPermanent: false, expected: 0 },
    { dustAmount: 100, remaining: 0, isPermanent: false, expected: 0 },
    { dustAmount: 123.45, remaining: YEAR / 2, isPermanent: false, expected: 61.73 },
    { dustAmount: 38_631_600, remaining: 1, isPermanent: false, expected: 1.22 },
    { dustAmount: 10, remaining: YEAR * 2, isPermanent: false, expected: 20 },
    { dustAmount: NaN, remaining: YEAR, isPermanent: false, expected: NaN },
  ])(
    'retains existing estimate for $dustAmount / $remaining seconds',
    ({ dustAmount, remaining, isPermanent, expected }) => {
      expect(
        DustLockHelper.calculateVeDustPower({
          dustAmount,
          endTimestamp: NOW + remaining,
          isPermanent,
        }),
      ).toBe(expected);
    },
  );

  it('keeps permanent calculations independent of the clock', () => {
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('clock read');
    });
    expect(
      DustLockHelper.calculateVeDustPower({
        dustAmount: 12.34567,
        endTimestamp: NaN,
        isPermanent: true,
      }),
    ).toBe(12.34567);
    expect(clock).not.toHaveBeenCalled();
  });

  it('projects merged amount onto the destination lock', () => {
    expect(DustLockHelper.calculateMergedVeDustPower(123.45, NOW + YEAR / 2, false)).toBe(61.73);
    expect(DustLockHelper.calculateMergedVeDustPower(123.4567, NOW - 1, true)).toBe(123.4567);
  });

  it('adds the rounded contribution without rounding the existing power or sum', () => {
    expect(DustLockHelper.calculateVeDustIncrease(1.005001, 0.1234567, NOW + YEAR, false)).toBe(
      1.1334567,
    );
    expect(DustLockHelper.calculateVeDustIncrease(1.234567, 0.1234567, NOW - 1, true)).toBe(
      1.3580237,
    );
  });
});

describe('DustIncentiveProvider display calculations', () => {
  it.each([
    {
      rate: 1234567890123456789n,
      decimals: 18,
      annual: '38933332.982933333297904',
      apr: '77.8667',
    },
    { rate: 1234567n, decimals: 6, annual: '38933304.912', apr: '77.8666' },
    {
      rate: 900719925474099312345678901234567890n,
      decimals: 18,
      annual: '28405103569751195914133329.82933333297904',
      apr: '56810207139502391296.0000',
    },
    { rate: 1n, decimals: 18, annual: '0.000000000031536', apr: '0.0000' },
    { rate: 0n, decimals: 18, annual: '0.0', apr: '0.0000' },
    { rate: -1n, decimals: 0, annual: '-31536000', apr: '-63.0720' },
  ])(
    'retains formatting and APR for $rate raw / $decimals decimals',
    ({ rate, decimals, annual, apr }) => {
      expect(DustIncentiveProvider.calculateAnnualEmissions(rate, decimals)).toBe(annual);
      expect(DustIncentiveProvider.calculateEmissionAPR(rate, 2, 100_000_000, decimals)).toBe(apr);
    },
  );

  it.each([0, -1, -Infinity])('returns zero before formatting invalid decimals for TVL %s', tvl => {
    expect(DustIncentiveProvider.calculateEmissionAPR(1n, NaN, tvl, 81)).toBe('0');
  });

  it('keeps the default 18 decimals and existing nonfinite semantics', () => {
    expect(DustIncentiveProvider.calculateAnnualEmissions(1n)).toBe('0.000000000031536');
    expect(DustIncentiveProvider.calculateEmissionAPR(1n, 0, 1)).toBe('0.0000');
    expect(DustIncentiveProvider.calculateEmissionAPR(1n, 1, NaN)).toBe('NaN');
    expect(DustIncentiveProvider.calculateEmissionAPR(1n, 1, Infinity)).toBe('0.0000');
    expect(DustIncentiveProvider.calculateEmissionAPR(1n, Infinity, 1)).toBe('Infinity');
    expect(DustIncentiveProvider.calculateEmissionAPR(1n, NaN, 1)).toBe('NaN');
    expect(() => DustIncentiveProvider.calculateEmissionAPR(1n, 1, 1, 81)).toThrow();
  });
});
