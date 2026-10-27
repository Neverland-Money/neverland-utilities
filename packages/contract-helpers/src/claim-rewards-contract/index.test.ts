import { dustRewardsControllerAbi } from '@neverland-money/contract-types';
import { Interface, JsonRpcProvider, MaxUint256 } from 'ethers';
import type { BigNumberish } from 'ethers';
import { buildClaimAllRewardsToSelfTxData, buildClaimRewardsToSelfTxData } from '../index';
import { ClaimRewardsHelper } from '.';

const CONTROLLER = '0x0000000000000000000000000000000000000011';
const TOKEN = '0x0000000000000000000000000000000000000022';
const ASSET = '0x0000000000000000000000000000000000000033';
const iface = new Interface(dustRewardsControllerAbi);
const provider = new JsonRpcProvider('http://127.0.0.1:1', 143, { staticNetwork: true });
const helper = new ClaimRewardsHelper({ provider, chainId: 143 });
const base = { assetAddresses: [ASSET], rewardsControllerAddress: CONTROLLER, chainId: 143 };
const params = { ...base, lockTime: 0 };
const THIRTY_FIVE_DAYS = 35 * 24 * 60 * 60;

describe('ClaimRewardsHelper exact encodings', () => {
  it('encodes the existing human 18-decimal claim amount', () => {
    const tx = helper.getClaimRewardsToSelfTxData({
      ...params,
      dustTokenAddress: TOKEN,
      amount: '1.000000000000000001',
    });
    expect(tx.to).toBe(CONTROLLER);
    expect(iface.decodeFunctionData('claimRewardsToSelf', tx.data).toArray()).toEqual([
      [ASSET],
      1000000000000000001n,
      TOKEN,
      0n,
      0n,
    ]);
  });

  it('rejects an invalid destination before returning calldata', () => {
    expect(() =>
      helper.getClaimAllRewardsToSelfTxData({ ...params, rewardsControllerAddress: 'not-address' }),
    ).toThrow();
  });

  it.each(['-1', ((MaxUint256 + 1n) / 10n ** 18n + 1n).toString()])(
    'rejects out-of-range parsed human claim amount %s',
    amount => {
      expect(() =>
        helper.getClaimRewardsToSelfTxData({ ...params, dustTokenAddress: TOKEN, amount }),
      ).toThrow();
    },
  );
});

const validUints: BigNumberish[] = [
  0,
  0n,
  '0',
  1,
  ' 1 ',
  '+1',
  '0x1',
  Number.MAX_SAFE_INTEGER,
  '9007199254740993',
  9007199254740993n,
  MaxUint256,
  MaxUint256.toString(),
];
const invalidUints: BigNumberish[] = [
  '',
  ' ',
  '-',
  '- -1',
  '-1',
  -1n,
  1.1,
  Number.MAX_SAFE_INTEGER + 1,
  NaN,
  Infinity,
  '1.1',
  '1e3',
  MaxUint256 + 1n,
];

describe('provider-free claim builders', () => {
  it.each(validUints)('encodes exact uint256 lock and token values %s', value => {
    const assetAddresses = Object.freeze([ASSET]);
    const input = { ...params, assetAddresses, lockTime: value, tokenId: value };
    const all = buildClaimAllRewardsToSelfTxData(input);
    const single = buildClaimRewardsToSelfTxData({
      ...input,
      dustTokenAddress: TOKEN,
      amount: '0',
    });
    expect(iface.decodeFunctionData('claimAllRewardsToSelf', all.data).toArray()).toEqual([
      [ASSET],
      BigInt(value),
      BigInt(value),
    ]);
    expect(iface.decodeFunctionData('claimRewardsToSelf', single.data).toArray()).toEqual([
      [ASSET],
      0n,
      TOKEN,
      BigInt(value),
      BigInt(value),
    ]);
    expect(helper.getClaimAllRewardsToSelfTxData(input)).toEqual(all);
    expect(
      helper.getClaimRewardsToSelfTxData({ ...input, dustTokenAddress: TOKEN, amount: '0' }),
    ).toEqual(single);
    expect(assetAddresses).toEqual([ASSET]);
  });

  it.each(invalidUints)('rejects invalid uint256 lock or token input %s', value => {
    for (const field of ['lockTime', 'tokenId'] as const) {
      const input = { ...params, [field]: value };
      expect(() => buildClaimAllRewardsToSelfTxData(input)).toThrow();
      expect(() =>
        buildClaimRewardsToSelfTxData({ ...input, dustTokenAddress: TOKEN, amount: '1' }),
      ).toThrow();
    }
  });

  it('encodes a permanent lock and maximum raw amount without a provider', () => {
    const call = jest.spyOn(JsonRpcProvider.prototype, 'call');
    const getNetwork = jest.spyOn(JsonRpcProvider.prototype, 'getNetwork');
    const tx = buildClaimRewardsToSelfTxData({
      ...params,
      lockTime: MaxUint256,
      tokenId: '9007199254740993',
      dustTokenAddress: TOKEN,
      amount: '115792089237316195423570985008687907853269984665640564039457.584007913129639935',
    });
    expect(iface.decodeFunctionData('claimRewardsToSelf', tx.data).toArray()).toEqual([
      [ASSET],
      MaxUint256,
      TOKEN,
      MaxUint256,
      9007199254740993n,
    ]);
    expect(call).not.toHaveBeenCalled();
    expect(getNetwork).not.toHaveBeenCalled();
  });

  it('validates controller, reward, and asset addresses without RPC', () => {
    expect(() =>
      buildClaimAllRewardsToSelfTxData({ ...params, rewardsControllerAddress: 'bad' }),
    ).toThrow();
    expect(() =>
      buildClaimAllRewardsToSelfTxData({ ...params, assetAddresses: ['bad'] }),
    ).toThrow();
    expect(() =>
      buildClaimRewardsToSelfTxData({ ...params, dustTokenAddress: 'bad', amount: '1' }),
    ).toThrow();
    expect(() =>
      buildClaimRewardsToSelfTxData({
        ...params,
        dustTokenAddress: TOKEN,
        amount: '-0.000000000000000001',
      }),
    ).toThrow();
  });
});

describe('required claim lockTime', () => {
  const missing = (lockTime: undefined | null) => {
    const input: typeof params = { ...params };
    Reflect.set(input, 'lockTime', lockTime);
    return input;
  };

  it.each([undefined, null])('rejects a missing lockTime (%s) in every claim builder', value => {
    const builders = [
      () => buildClaimAllRewardsToSelfTxData(missing(value)),
      () =>
        buildClaimRewardsToSelfTxData({ ...missing(value), dustTokenAddress: TOKEN, amount: '1' }),
      () => helper.getClaimAllRewardsToSelfTxData(missing(value)),
      () =>
        helper.getClaimRewardsToSelfTxData({
          ...missing(value),
          dustTokenAddress: TOKEN,
          amount: '1',
        }),
      () => buildClaimAllRewardsToSelfTxData({ ...missing(value), tokenId: 7 }),
    ];
    for (const build of builders) {
      expect(build).toThrow('lockTime is required');
      expect(build).toThrow('50% instant-claim toll');
      expect(build).toThrow('at least 28 days');
      expect(build).toThrow('permanent lock with no toll');
    }
  });

  it.each([
    ['instant claim', 0, 0n],
    ['35-day lock', THIRTY_FIVE_DAYS, BigInt(THIRTY_FIVE_DAYS)],
    ['permanent lock', MaxUint256, MaxUint256],
  ] as const)('encodes an explicit %s route with the default tokenId', (_route, lockTime, raw) => {
    const all = buildClaimAllRewardsToSelfTxData({ ...base, lockTime });
    const single = buildClaimRewardsToSelfTxData({
      ...base,
      lockTime,
      dustTokenAddress: TOKEN,
      amount: '2.5',
    });
    expect(all.to).toBe(CONTROLLER);
    expect(iface.decodeFunctionData('claimAllRewardsToSelf', all.data).toArray()).toEqual([
      [ASSET],
      raw,
      0n,
    ]);
    expect(iface.decodeFunctionData('claimRewardsToSelf', single.data).toArray()).toEqual([
      [ASSET],
      2500000000000000000n,
      TOKEN,
      raw,
      0n,
    ]);
  });

  it('encodes a deposit into an existing lock with the explicit lockTime passed through', () => {
    const tx = buildClaimRewardsToSelfTxData({
      ...params,
      tokenId: 7n,
      dustTokenAddress: TOKEN,
      amount: '1',
    });
    expect(iface.decodeFunctionData('claimRewardsToSelf', tx.data).toArray()).toEqual([
      [ASSET],
      1000000000000000000n,
      TOKEN,
      0n,
      7n,
    ]);
  });

  it('does not require the unused chainId', () => {
    const { assetAddresses, rewardsControllerAddress } = base;
    const withoutChain = { assetAddresses, rewardsControllerAddress, lockTime: MaxUint256 };
    expect(buildClaimAllRewardsToSelfTxData(withoutChain)).toEqual(
      buildClaimAllRewardsToSelfTxData({ ...withoutChain, chainId: 143 }),
    );
  });
});
