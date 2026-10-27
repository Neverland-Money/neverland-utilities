import { calculateMarketAPRFromInputs, UnresolvedDustAPRInputError } from './index';
import type { DustMarketAPRInputs } from './index';

const UINT256_MAX = 2n ** 256n - 1n;
const live: DustMarketAPRInputs = {
  emissionPerSecond: 1_000_000_000_000_000_000n,
  distributionEnd: 1_700_086_400n,
  nowSeconds: 1_700_000_000n,
  totalSupplyRaw: 1_000_000_000_000_000_000_000_000n,
  assetDecimals: 18,
  rewardPriceUsd8: 1_000_000n,
  assetPriceUsd8: 100_000_000n,
};

describe('calculateMarketAPRFromInputs', () => {
  it.each([undefined, null, 1, 'inputs'])(
    'rejects a missing or malformed runtime input %s',
    value => {
      const container = { input: live };
      Reflect.set(container, 'input', value);
      expect(() => calculateMarketAPRFromInputs(container.input)).toThrow(
        UnresolvedDustAPRInputError,
      );
    },
  );

  it.each([
    [0, 1_000_000n],
    [6, 1_000_000_000_000n],
    [8, 100_000_000_000_000n],
    [18, 1_000_000_000_000_000_000_000_000n],
    [24, 1_000_000_000_000_000_000_000_000_000_000n],
  ])(
    'returns the independent 31.53 percent vector at %s asset decimals',
    (assetDecimals, totalSupplyRaw) => {
      expect(calculateMarketAPRFromInputs({ ...live, assetDecimals, totalSupplyRaw })).toEqual({
        apr: 31.53,
        isActive: true,
        emissionPerSecond: '1000000000000000000',
        distributionEnd: 1_700_086_400,
        totalSupply: totalSupplyRaw.toString(),
        annualEmissions: '31536000000000000000000000',
        totalSupplyUSD: '1000000.0',
      });
    },
  );

  it.each([
    [18, 500_000_000_000_000_000_000_000n, 200_000_000n],
    [6, 1_000_000_000_000n, 100_000_000n],
    [8, 25_000_000_000n, 400_000_000_000n],
  ])(
    'matches the independent investigation 1.57 percent vector at %s decimals',
    (assetDecimals, totalSupplyRaw, assetPriceUsd8) => {
      expect(
        calculateMarketAPRFromInputs({
          ...live,
          emissionPerSecond: 1_000_000_000_000_000n,
          rewardPriceUsd8: 50_000_000n,
          assetDecimals,
          totalSupplyRaw,
          assetPriceUsd8,
        }),
      ).toMatchObject({ apr: 1.57, annualEmissions: '31536000000000000000000' });
    },
  );

  it.each([
    { emissionPerSecond: 0n },
    { distributionEnd: live.nowSeconds },
    { distributionEnd: 0n },
  ])('omits unread quantities for dormant configuration %s', change => {
    const inputs = { ...live, ...change };
    for (const field of ['totalSupplyRaw', 'assetDecimals', 'rewardPriceUsd8', 'assetPriceUsd8']) {
      Reflect.set(inputs, field, 'unread');
    }

    expect(calculateMarketAPRFromInputs(inputs)).toEqual({
      apr: 0,
      isActive: false,
      emissionPerSecond: inputs.emissionPerSecond.toString(),
      distributionEnd: Number(inputs.distributionEnd),
    });
  });

  it.each([
    [6, 1_000_000_000_000n, 100_000_000n, '1000000.0'],
    [18, 2_500_000_000_000_000_000_000n, 200_000_000n, '5000.0'],
    [8, 123_456_789n, 2_900_000_000n, '35.80246881'],
    [24, 1_999_999n, 100_000_001n, '0.000000000000000001'],
  ])(
    'reports the USD supply denominator at %s decimals',
    (assetDecimals, totalSupplyRaw, assetPriceUsd8, totalSupplyUSD) => {
      expect(
        calculateMarketAPRFromInputs({
          ...live,
          emissionPerSecond: 1n,
          assetDecimals,
          totalSupplyRaw,
          assetPriceUsd8,
        }).totalSupplyUSD,
      ).toBe(totalSupplyUSD);
    },
  );

  it('floors annual reward USD before the final ratio, allowing live APR to truncate to zero', () => {
    expect(
      calculateMarketAPRFromInputs({
        ...live,
        emissionPerSecond: 1n,
        rewardPriceUsd8: 1n,
        totalSupplyRaw: 1n,
      }),
    ).toMatchObject({ apr: 0, isActive: true, annualEmissions: '31536000' });
  });

  it.each([
    { assetDecimals: 24, totalSupplyRaw: 1_999_999n, assetPriceUsd8: 100_000_001n },
    { assetDecimals: 18, totalSupplyRaw: 100_000_001n, assetPriceUsd8: 1n },
  ])('preserves the supply normalization and USD floor order for %s', change => {
    expect(
      calculateMarketAPRFromInputs({
        ...live,
        emissionPerSecond: 1n,
        rewardPriceUsd8: 100_000_000n,
        ...change,
      }),
    ).toMatchObject({ apr: 3_153_600_000, isActive: true });
  });

  it('keeps maximum uint256 raw quantities exact and permits larger offchain intermediates', () => {
    expect(
      calculateMarketAPRFromInputs({
        ...live,
        emissionPerSecond: UINT256_MAX,
        totalSupplyRaw: UINT256_MAX,
        rewardPriceUsd8: 100_000_000n,
      }),
    ).toMatchObject({
      apr: 3_153_600_000,
      totalSupply: '115792089237316195423570985008687907853269984665640564039457584007913129639935',
      annualEmissions:
        '3651619326188003538877734583233981862060722236415640827548334369273548456324990160000',
    });
  });

  it.each(['emissionPerSecond', 'distributionEnd', 'nowSeconds', 'totalSupplyRaw'])(
    'rejects invalid uint256 raw %s',
    field => {
      for (const value of [undefined, null, '1', 1, -1n, UINT256_MAX + 1n]) {
        const inputs = { ...live };
        Reflect.set(inputs, field, value);
        expect(() => calculateMarketAPRFromInputs(inputs)).toThrow(UnresolvedDustAPRInputError);
      }
    },
  );

  it.each([undefined, null, -1, 256, 1.5, NaN, Infinity, 18n, '18'])(
    'rejects invalid asset decimals %s',
    assetDecimals => {
      const inputs = { ...live };
      Reflect.set(inputs, 'assetDecimals', assetDecimals);
      expect(() => calculateMarketAPRFromInputs(inputs)).toThrow(UnresolvedDustAPRInputError);
    },
  );

  it.each(['rewardPriceUsd8', 'assetPriceUsd8'])(
    'rejects missing or invalid exact price %s',
    field => {
      for (const value of [undefined, null, 0n, -1n, 1, '1']) {
        const inputs = { ...live };
        Reflect.set(inputs, field, value);
        expect(() => calculateMarketAPRFromInputs(inputs)).toThrow(UnresolvedDustAPRInputError);
      }
    },
  );

  it.each([
    { totalSupplyRaw: 0n },
    { assetDecimals: 24, totalSupplyRaw: 999_999n },
    { assetDecimals: 18, totalSupplyRaw: 1n, assetPriceUsd8: 1n },
  ])('rejects a live zero USD denominator %s', change => {
    expect(() => calculateMarketAPRFromInputs({ ...live, ...change })).toThrow(
      UnresolvedDustAPRInputError,
    );
  });

  it('validates decimals 255 but rejects its unavoidable zero normalized uint256 supply', () => {
    expect(() =>
      calculateMarketAPRFromInputs({
        ...live,
        assetDecimals: 255,
        totalSupplyRaw: UINT256_MAX,
      }),
    ).toThrow(/zero denominator/);
  });

  it('requires a safe distribution-end display even for a dormant campaign', () => {
    expect(
      calculateMarketAPRFromInputs({
        ...live,
        emissionPerSecond: 0n,
        distributionEnd: 9_007_199_254_740_991n,
      }),
    ).toMatchObject({ distributionEnd: Number.MAX_SAFE_INTEGER });
    expect(() =>
      calculateMarketAPRFromInputs({
        ...live,
        emissionPerSecond: 0n,
        distributionEnd: 9_007_199_254_740_992n,
      }),
    ).toThrow(UnresolvedDustAPRInputError);
  });

  it('accepts the last safe scaled APR and rejects the next integer without clamping', () => {
    const inputs = {
      ...live,
      emissionPerSecond: 100_000_000n,
      totalSupplyRaw: 315_360_000_000n,
      rewardPriceUsd8: 9_007_199_254_740_991n,
    };
    expect(calculateMarketAPRFromInputs(inputs).apr).toBe(90_071_992_547_409.9);
    expect(() =>
      calculateMarketAPRFromInputs({ ...inputs, rewardPriceUsd8: 9_007_199_254_740_992n }),
    ).toThrow(UnresolvedDustAPRInputError);
  });

  it('retains the unresolved reason and original optional cause', () => {
    const cause = new Error('decode failed');
    const error = new UnresolvedDustAPRInputError('rewards data', cause);
    expect(error).toMatchObject({
      name: 'UnresolvedDustAPRInputError',
      reason: 'rewards data',
      cause,
    });
    expect(error).toBeInstanceOf(Error);
  });
});
