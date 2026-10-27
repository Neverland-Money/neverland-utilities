import { dustRewardsControllerAbi, erc20Abi } from '@neverland-money/contract-types';
import * as math from '@neverland-money/math-utils';
import { Interface, JsonRpcProvider } from 'ethers';
import { AbiBaseService } from '../commons/base-service';
import { DustIncentiveProvider } from '../dust-incentive-provider-contract';
import type { RewardData } from '../dust-incentive-provider-contract/types';
import * as helpers from '../index';
import type { MarketConfig, PriceMap } from './types';
import { DustAPRCalculator } from '.';

const asset = '0x0000000000000000000000000000000000000011';
const reward = '0x0000000000000000000000000000000000000022';
const controller = '0x0000000000000000000000000000000000000033';
const rewardsIface = new Interface(dustRewardsControllerAbi);
const tokenIface = new Interface(erc20Abi);
const prices = { [asset]: 1, [reward]: 0.01 };
const data: RewardData = {
  index: 11n,
  emissionPerSecond: 1_000_000_000_000_000_000n,
  lastUpdateTimestamp: 33n,
  distributionEnd: 1_700_086_400n,
};
const options = { nowSeconds: 1_700_000_000n };
const market: MarketConfig = {
  id: 'healthy',
  symbol: 'nTOKEN',
  asset,
  dustToken: reward,
  transferStrategy: controller,
};

function fixture(
  overrides: { emission?: bigint; end?: bigint; supply?: bigint; decimals?: bigint } = {},
) {
  const provider = new JsonRpcProvider('http://127.0.0.1:1', 143, { staticNetwork: true });
  const calls: string[] = [];
  jest.spyOn(provider, 'call').mockImplementation(async tx => {
    const target = await tx.to;
    if (
      target === controller &&
      tx.data === rewardsIface.encodeFunctionData('getRewardsData', [asset, reward])
    ) {
      calls.push('getRewardsData');
      return rewardsIface.encodeFunctionResult('getRewardsData', [
        11n,
        overrides.emission ?? data.emissionPerSecond,
        33n,
        overrides.end ?? data.distributionEnd,
      ]);
    }

    if (target === asset && tx.data === tokenIface.encodeFunctionData('totalSupply')) {
      calls.push('totalSupply');
      return tokenIface.encodeFunctionResult('totalSupply', [
        overrides.supply ?? 1_000_000_000_000_000_000_000_000n,
      ]);
    }

    if (target === asset && tx.data === tokenIface.encodeFunctionData('decimals')) {
      calls.push('decimals');
      return tokenIface.encodeFunctionResult('decimals', [overrides.decimals ?? 18n]);
    }

    throw new Error('Unexpected contract read');
  });
  return { provider, calls, calculator: new DustAPRCalculator() };
}

describe('DustAPRCalculator strict DUST APR', () => {
  it('omits a live zero-denominator market from the batch', async () => {
    const { provider, calculator } = fixture({ supply: 0n });
    await expect(
      calculator.calculateBatchAPR([market], controller, provider, prices, options),
    ).resolves.toEqual({});
  });

  it.each(['totalSupply', 'decimals'])(
    'rejects malformed decoded ERC20 %s without reporting inactivity',
    async method => {
      const { provider, calculator } = fixture();
      for (const value of [undefined, null, '18', 18, -1n, 2n ** 256n]) {
        jest
          .spyOn(AbiBaseService.prototype, 'readContract')
          .mockImplementation(async (_address, name) => {
            const decoded = { value: [] };
            Reflect.set(
              decoded,
              'value',
              name === method
                ? value
                : name === 'totalSupply'
                  ? 1_000_000_000_000_000_000_000_000n
                  : 18n,
            );
            return decoded.value;
          });
        // eslint-disable-next-line no-await-in-loop -- Replace the same typed reader only after the malformed case settles.
        await expect(
          calculator.calculateMarketAPR(asset, reward, controller, provider, prices, options),
        ).rejects.toMatchObject({ name: 'UnresolvedDustAPRInputError' });
      }
    },
  );

  it('preserves explicit zero for every batch market', async () => {
    const { provider, calculator } = fixture({ end: 1n });
    const results = await calculator.calculateBatchAPR(
      [market, { ...market, id: 'second' }],
      controller,
      provider,
      prices,
      { nowSeconds: 0n },
    );
    expect(results.healthy.isActive).toBe(true);
    expect(results.second.isActive).toBe(true);
  });

  it('exports the same pure kernel and error class as math-utils', () => {
    expect(helpers.calculateMarketAPRFromInputs).toBe(math.calculateMarketAPRFromInputs);
    expect(helpers.UnresolvedDustAPRInputError).toBe(math.UnresolvedDustAPRInputError);
  });

  it.each([null, '0', {}])('rejects malformed runtime clock input %s', async now => {
    const { provider, calculator } = fixture();
    const malformed = { ...options };
    Reflect.set(malformed, 'nowSeconds', now);
    await expect(
      calculator.calculateMarketAPR(asset, reward, controller, provider, prices, malformed),
    ).rejects.toMatchObject({ name: 'UnresolvedDustAPRInputError' });
  });

  it('calculates live APR from the real unnamed native-bigint ABI Result and incentivized token supply', async () => {
    const { provider, calculator, calls } = fixture();
    expect(
      await calculator.calculateMarketAPR(asset, reward, controller, provider, prices, options),
    ).toEqual({
      apr: 31.53,
      isActive: true,
      emissionPerSecond: '1000000000000000000',
      distributionEnd: 1_700_086_400,
      totalSupply: '1000000000000000000000000',
      annualEmissions: '31536000000000000000000000',
      totalSupplyUSD: '1000000.0',
    });
    expect(calls).toEqual(['getRewardsData', 'totalSupply', 'decimals']);
  });

  it.each([
    [0n, 1_000_000n],
    [6n, 1_000_000_000_000n],
    [8n, 100_000_000_000_000n],
    [24n, 1_000_000_000_000_000_000_000_000_000_000n],
  ])('uses native ERC20 decimals %s', async (decimals, supply) => {
    const { provider, calculator } = fixture({ decimals, supply });
    expect(
      (await calculator.calculateMarketAPR(asset, reward, controller, provider, prices, options))
        .apr,
    ).toBe(31.53);
  });

  it.each([{ emission: 0n }, { end: options.nowSeconds }, { end: 1n }])(
    'omits unread supply and prices when dormant %s',
    async change => {
      const { provider, calculator, calls } = fixture(change);
      const unreadPrices = new Proxy(
        {},
        {
          get() {
            throw new Error('Price must remain unread');
          },
        },
      );
      const result = await calculator.calculateMarketAPR(
        asset,
        reward,
        controller,
        provider,
        unreadPrices,
        options,
      );
      expect(result).toEqual({
        apr: 0,
        isActive: false,
        emissionPerSecond: (change.emission ?? data.emissionPerSecond).toString(),
        distributionEnd: Number(change.end ?? data.distributionEnd),
      });
      expect(calls).toEqual(['getRewardsData']);
    },
  );

  it('uses explicit fork time including zero independently of the wall clock', async () => {
    const { provider, calculator } = fixture({ end: 1n });
    expect(
      (
        await calculator.calculateMarketAPR(asset, reward, controller, provider, prices, {
          nowSeconds: 0,
        })
      ).isActive,
    ).toBe(true);
    expect(
      (
        await calculator.calculateMarketAPR(asset, reward, controller, provider, prices, {
          nowSeconds: 1n,
        })
      ).isActive,
    ).toBe(false);
  });

  it.each([-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, -1n, 2n ** 256n])(
    'rejects invalid explicit time %s',
    async nowSeconds => {
      const { provider, calculator } = fixture();

      await expect(
        calculator.calculateMarketAPR(asset, reward, controller, provider, prices, { nowSeconds }),
      ).rejects.toMatchObject({ name: 'UnresolvedDustAPRInputError' });
    },
  );

  it.each(['reward', 'asset'])('rejects all invalid PriceMap values for the %s', async token => {
    const { provider, calculator } = fixture();
    for (const value of [
      undefined,
      0,
      -1,
      NaN,
      Infinity,
      0.000000001,
      Number.MAX_VALUE,
      Number.MAX_SAFE_INTEGER / 1e8 + 1,
    ]) {
      const inputPrices: PriceMap = { ...prices };
      Reflect.set(inputPrices, token === 'reward' ? reward : asset, value);
      // eslint-disable-next-line no-await-in-loop -- Each price case must settle before reusing the isolated reader fixture.
      await expect(
        calculator.calculateMarketAPR(asset, reward, controller, provider, inputPrices, options),
      ).rejects.toMatchObject({ name: 'UnresolvedDustAPRInputError' });
    }
  });

  it.each([{ supply: 0n }, { supply: 999_999n, decimals: 24n }])(
    'rejects an unresolved live denominator %s',
    async change => {
      const { provider, calculator } = fixture(change);

      await expect(
        calculator.calculateMarketAPR(asset, reward, controller, provider, prices, options),
      ).rejects.toMatchObject({ name: 'UnresolvedDustAPRInputError' });
    },
  );

  it.each(['emissionPerSecond', 'distributionEnd'])(
    'rejects a malformed raw-reader %s',
    async field => {
      const { provider, calculator } = fixture();
      for (const value of [undefined, null, 1, '1', -1n, 2n ** 256n]) {
        const malformed = { ...data };
        Reflect.set(malformed, field, value);
        jest.spyOn(DustIncentiveProvider.prototype, 'getRewardsData').mockResolvedValue(malformed);
        // eslint-disable-next-line no-await-in-loop -- Replace the same raw-reader spy only after its previous malformed case settles.
        await expect(
          calculator.calculateMarketAPR(asset, reward, controller, provider, prices, options),
        ).rejects.toMatchObject({ name: 'UnresolvedDustAPRInputError' });
      }
    },
  );

  it.each(['getRewardsData', 'totalSupply', 'decimals'])(
    'propagates the exact original %s transport rejection',
    async method => {
      const { provider, calculator } = fixture();
      const failure = new Error('transport unavailable');
      const previous = jest.mocked(provider.call).getMockImplementation();
      if (!previous) throw new Error('Missing fixture reader');
      jest.spyOn(provider, 'call').mockImplementation(async tx => {
        const selector =
          method === 'getRewardsData'
            ? rewardsIface.encodeFunctionData(method, [asset, reward])
            : tokenIface.encodeFunctionData(method);
        if (tx.data === selector) throw failure;
        return previous(tx);
      });

      await expect(
        calculator.calculateMarketAPR(asset, reward, controller, provider, prices, options),
      ).rejects.toBe(failure);
    },
  );

  it('omits failed batch markets while preserving healthy and dormant results', async () => {
    const { provider, calculator } = fixture();
    const dormantAsset = '0x0000000000000000000000000000000000000044';
    const brokenAsset = '0x0000000000000000000000000000000000000055';
    jest
      .spyOn(DustIncentiveProvider.prototype, 'getRewardsData')
      .mockImplementation(async token => {
        if (token === brokenAsset) throw new Error('unreadable market');
        return token === dormantAsset ? { ...data, emissionPerSecond: 0n } : data;
      });
    const results = await calculator.calculateBatchAPR(
      [
        market,
        { ...market, id: 'dormant', asset: dormantAsset },
        { ...market, id: 'broken', asset: brokenAsset },
      ],
      controller,
      provider,
      prices,
      options,
    );
    expect(Object.keys(results)).toEqual(['healthy', 'dormant']);
    expect(results.healthy.apr).toBe(31.53);
    expect(results.dormant).toEqual({
      apr: 0,
      isActive: false,
      emissionPerSecond: '0',
      distributionEnd: 1_700_086_400,
    });
  });

  it('samples an omitted wall clock once per batch', async () => {
    const { provider, calculator } = fixture({ end: 2n });
    const clock = jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValue(3000);
    const results = await calculator.calculateBatchAPR(
      [market, { ...market, id: 'second' }],
      controller,
      provider,
      prices,
    );
    expect(results.healthy.isActive).toBe(true);
    expect(results.second.isActive).toBe(true);
    expect(clock).toHaveBeenCalledTimes(1);
  });
});

describe('DustAPRCalculator float price conversion', () => {
  it.each([
    [0.29, '290000.0'],
    [0.0003, '300.0'],
    [0.0087, '8700.0'],
    [0.1234, '123400.0'],
    [1e-7, '0.1'],
    [0.123456789, '123456.78'],
    [123.45, '123450000.0'],
    [1.5e7, '15000000000000.0'],
  ])('scales the asset price %s to exact USD8 before the supply value', async (price, usd) => {
    const { provider, calculator } = fixture();
    const result = await calculator.calculateMarketAPR(
      asset,
      reward,
      controller,
      provider,
      { ...prices, [asset]: price },
      options,
    );
    expect(result.totalSupplyUSD).toBe(usd);
  });
});

describe('DustAPRCalculator.calculateWeightedAverageAPR', () => {
  const now = 1_700_000_000n;
  // Both markets emit 0.1 DUST per second at a DUST price of $0.01, so $31,536 a year each.
  const liveMarket = (assetDecimals: number, totalSupplyRaw: bigint, assetPriceUsd8: bigint) =>
    math.calculateMarketAPRFromInputs({
      emissionPerSecond: 100_000_000_000_000_000n,
      distributionEnd: now + 86_400n,
      nowSeconds: now,
      totalSupplyRaw,
      assetDecimals,
      rewardPriceUsd8: 1_000_000n,
      assetPriceUsd8,
    });

  it('weights a 6-decimal USDC market and an 18-decimal WMON market by USD supply', () => {
    // $1,000,000 of USDC (6 decimals) and $5,000 of WMON (2,500 at $2, 18 decimals).
    const usdc = liveMarket(6, 1_000_000_000_000n, 100_000_000n);
    const wmon = liveMarket(18, 2_500_000_000_000_000_000_000n, 200_000_000n);
    expect(usdc).toMatchObject({ apr: 3.15, totalSupplyUSD: '1000000.0' });
    expect(wmon).toMatchObject({ apr: 630.72, totalSupplyUSD: '5000.0' });
    const average = DustAPRCalculator.calculateWeightedAverageAPR([usdc, wmon]);
    // (3.15 * 1,000,000 + 630.72 * 5,000) / 1,005,000; raw-unit weights would give about 630.72.
    expect(average).toBeCloseTo(6_303_600 / 1_005_000, 10);
    expect(DustAPRCalculator.calculateWeightedAverageAPR([wmon, usdc])).toBeCloseTo(average, 10);
  });

  it('leaves dormant markets out and still weights an active market whose APR truncated to 0', () => {
    const live = { apr: 10, isActive: true, totalSupply: '1', totalSupplyUSD: '100.0' };
    const truncated = { apr: 0, isActive: true, totalSupply: '1', totalSupplyUSD: '300.0' };
    const dormant = { apr: 0, isActive: false, totalSupply: '9' };
    expect(DustAPRCalculator.calculateWeightedAverageAPR([live, dormant])).toBe(10);
    expect(DustAPRCalculator.calculateWeightedAverageAPR([live, truncated, dormant])).toBe(2.5);
  });

  it('returns 0 without active markets or without any positive USD supply', () => {
    expect(DustAPRCalculator.calculateWeightedAverageAPR([])).toBe(0);
    expect(
      DustAPRCalculator.calculateWeightedAverageAPR([
        { apr: 0, isActive: false, totalSupply: '1' },
      ]),
    ).toBe(0);
    expect(
      DustAPRCalculator.calculateWeightedAverageAPR([
        { apr: 5, isActive: true, totalSupply: '1', totalSupplyUSD: '0.0' },
      ]),
    ).toBe(0);
  });

  it.each([
    { apr: 5, isActive: true, totalSupply: '1000000' },
    { apr: 5, isActive: true, totalSupply: '1', totalSupplyUSD: '' },
    { apr: 5, isActive: true, totalSupply: '1', totalSupplyUSD: 'n/a' },
    { apr: 5, isActive: true, totalSupply: '1', totalSupplyUSD: '-1' },
    { apr: Number.NaN, isActive: true, totalSupply: '1', totalSupplyUSD: '1.0' },
  ])('rejects an active market it cannot weight in USD %o', market => {
    expect(() => DustAPRCalculator.calculateWeightedAverageAPR([market])).toThrow(
      math.UnresolvedDustAPRInputError,
    );
  });
});
