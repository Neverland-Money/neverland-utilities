import { dustRewardsControllerAbi } from '@neverland-money/contract-types';
import { ethers } from 'ethers';
import { DustIncentiveProvider } from '.';
const CONTROLLER = '0x57ea245cCbFAb074baBb9d01d1F0c60525E52cec';
const ASSET = '0x00000000000000000000000000000000000000a5';
const REWARD = '0x0000000000000000000000000000000000000d57';
const USER = '0x00000000000000000000000000000000000000a1';
const iface = new ethers.Interface(dustRewardsControllerAbi);
// A real provider with a fixed network, so ethers never probes the URL; tests mock `call`.
const provider = new ethers.JsonRpcProvider(
  'http://127.0.0.1:1',
  {
    chainId: 143,
    name: 'monad',
  },
  { staticNetwork: true },
);
const incentives = new DustIncentiveProvider({
  dustIncentiveProviderAddress: CONTROLLER,
  provider,
});
/** Answers one controller read with ABI-encoded `values` and rejects any other call. */
const answer = (functionName: string, values: unknown[]) =>
  jest.spyOn(provider, 'call').mockImplementation(async tx => {
    const data = ethers.hexlify(tx.data ?? '0x');
    if (data.slice(0, 10) !== iface.getFunction(functionName)!.selector) {
      throw new Error(`unexpected call ${data.slice(0, 10)}`);
    }

    return iface.encodeFunctionResult(functionName, values);
  });
describe('DustIncentiveProvider', () => {
  it('decodes the unnamed getRewardsData outputs by position', async () => {
    answer('getRewardsData', [11, 22, 33, 44]);
    await expect(incentives.getRewardsData(ASSET, REWARD)).resolves.toEqual({
      index: 11n,
      emissionPerSecond: 22n,
      lastUpdateTimestamp: 33n,
      distributionEnd: 44n,
    });
  });

  it('stops reporting APR when the reward distribution has ended', async () => {
    answer('getRewardsData', [0, 10n ** 12n, 1000, 2000]);
    const options = { tvlUSD: 1000, rewardPriceUSD: 1, currentTimestamp: 3000 };
    await expect(incentives.getRewardsDataHumanized(ASSET, REWARD, options)).resolves.toMatchObject(
      {
        incentiveAPR: '0',
        distributionEnd: 2000,
      },
    );
    await expect(
      incentives.getRewardsDataHumanized(ASSET, REWARD, { ...options, currentTimestamp: 1999 }),
    ).resolves.toMatchObject({ incentiveAPR: '3.1536' });
  });
  it('reports zero APR when currentTimestamp equals distributionEnd', async () => {
    answer('getRewardsData', [0, 10n ** 12n, 1000, 2000]);
    await expect(
      incentives.getRewardsDataHumanized(ASSET, REWARD, {
        tvlUSD: 1000,
        rewardPriceUSD: 1,
        currentTimestamp: 2000,
      }),
    ).resolves.toMatchObject({ incentiveAPR: '0' });
  });

  describe('block time fallback', () => {
    const options = { tvlUSD: 1000, rewardPriceUSD: 1 };
    // Only `timestamp` is read, so a partial block stands in for the full ethers Block.
    const asBlock = (timestamp: number | null): never =>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Test double: the code under test reads only `timestamp`.
      (timestamp === null ? null : { timestamp }) as never;
    const mockBlock = (timestamp: number | null) =>
      jest.spyOn(provider, 'getBlock').mockResolvedValue(asBlock(timestamp));

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('uses the latest block time when currentTimestamp is omitted', async () => {
      answer('getRewardsData', [0, 10n ** 12n, 1000, 2000]);
      const getBlock = mockBlock(1500);
      await expect(
        incentives.getRewardsDataHumanized(ASSET, REWARD, options),
      ).resolves.toMatchObject({ incentiveAPR: '3.1536' });
      expect(getBlock).toHaveBeenCalledWith('latest');
      getBlock.mockResolvedValue(asBlock(2000));
      await expect(
        incentives.getRewardsDataHumanized(ASSET, REWARD, options),
      ).resolves.toMatchObject({ incentiveAPR: '0' });
    });

    it('rejects when the latest block is unavailable and the APR could be positive', async () => {
      answer('getRewardsData', [0, 10n ** 12n, 1000, 2000]);
      mockBlock(null);
      await expect(incentives.getRewardsDataHumanized(ASSET, REWARD, options)).rejects.toThrow(
        'Latest block is unavailable',
      );
    });

    it.each([
      { when: 'tvlUSD is 0', input: { tvlUSD: 0, rewardPriceUSD: 1 }, emission: 10n ** 12n },
      {
        when: 'rewardPriceUSD is 0',
        input: { tvlUSD: 1000, rewardPriceUSD: 0 },
        emission: 10n ** 12n,
      },
      { when: 'emissionPerSecond is 0', input: options, emission: 0n },
      { when: 'no options are given', input: undefined, emission: 10n ** 12n },
    ])('does not read the latest block when $when', async ({ input, emission }) => {
      answer('getRewardsData', [0, emission, 1000, 2000]);
      const getBlock = mockBlock(null);
      await expect(incentives.getRewardsDataHumanized(ASSET, REWARD, input)).resolves.toMatchObject(
        { incentiveAPR: '0' },
      );
      expect(getBlock).not.toHaveBeenCalled();
    });
  });

  it.each([-1, 1.5, NaN, Infinity])(
    'rejects invalid currentTimestamp %p',
    async currentTimestamp => {
      answer('getRewardsData', [0, 10n ** 12n, 1000, 2000]);
      await expect(
        incentives.getRewardsDataHumanized(ASSET, REWARD, {
          tvlUSD: 1000,
          rewardPriceUSD: 1,
          currentTimestamp,
        }),
      ).rejects.toThrow('currentTimestamp must be a nonnegative safe integer');
    },
  );

  it.each([
    { expected: true, when: 'before distributionEnd', now: 1000, emissionPerSecond: 22 },
    { expected: false, when: 'after distributionEnd', now: 3000, emissionPerSecond: 22 },
    { expected: false, when: 'with nothing emitted', now: 1000, emissionPerSecond: 0 },
  ])('isEmissionsActive is $expected $when', async ({ expected, now, emissionPerSecond }) => {
    answer('getRewardsData', [0, emissionPerSecond, 0, 2000]);
    await expect(incentives.isEmissionsActive(ASSET, REWARD, now)).resolves.toBe(expected);
  });
  it('reads a user asset index', async () => {
    answer('getUserAssetIndex', [42]);
    await expect(incentives.getUserAssetIndex(USER, ASSET, REWARD)).resolves.toEqual(42n);
  });
});
