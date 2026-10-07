import { BigNumber, providers, utils } from 'ethers';
import { dustRewardsControllerAbi } from '@neverland-money/contract-types';
import { DustIncentiveProvider } from './index';

const CONTROLLER = '0x57ea245cCbFAb074baBb9d01d1F0c60525E52cec';
const ASSET = '0x00000000000000000000000000000000000000a5';
const REWARD = '0x0000000000000000000000000000000000000d57';
const USER = '0x00000000000000000000000000000000000000a1';

const iface = new utils.Interface(dustRewardsControllerAbi as any);

// A real provider with a fixed network, so ethers never probes the URL; tests mock `call`.
const provider = new providers.StaticJsonRpcProvider('http://127.0.0.1:1', {
  chainId: 143,
  name: 'monad',
});
const incentives = new DustIncentiveProvider({
  dustIncentiveProviderAddress: CONTROLLER,
  provider,
});

/** Answers one controller read with ABI-encoded `values` and rejects any other call. */
const answer = (functionName: string, values: unknown[]) =>
  jest.spyOn(provider, 'call').mockImplementation(async tx => {
    const data = utils.hexlify((await tx.data) ?? '0x');
    if (data.slice(0, 10) !== iface.getSighash(functionName)) {
      throw new Error(`unexpected call ${data.slice(0, 10)}`);
    }
    return iface.encodeFunctionResult(functionName, values);
  });

describe('DustIncentiveProvider', () => {
  it('decodes the unnamed getRewardsData outputs by position', async () => {
    answer('getRewardsData', [11, 22, 33, 44]);
    await expect(incentives.getRewardsData(ASSET, REWARD)).resolves.toEqual({
      index: BigNumber.from(11),
      emissionPerSecond: BigNumber.from(22),
      lastUpdateTimestamp: BigNumber.from(33),
      distributionEnd: BigNumber.from(44),
    });
  });

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
    await expect(incentives.getUserAssetIndex(USER, ASSET, REWARD)).resolves.toEqual(
      BigNumber.from(42),
    );
  });
});
