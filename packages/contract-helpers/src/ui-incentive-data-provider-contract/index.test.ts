import { uiIncentiveDataProviderV3Abi } from '@neverland-money/contract-types';
import type { PerformActionRequest } from 'ethers';
import { AbstractProvider, Interface, Network, getAddress } from 'ethers';
import { UiIncentiveDataProvider } from './index';

const address = '0x00000000000000000000000000000000000000a1';
const market = '0x00000000000000000000000000000000000000b2';
const user = '0x00000000000000000000000000000000000000c3';
const large = 900719925474099312345678n;
const iface = new Interface(JSON.stringify(uiIncentiveDataProviderV3Abi));
const reward = (decimals: number) => ({
  rewardTokenSymbol: 'REWARD',
  rewardTokenAddress: address,
  rewardOracleAddress: market,
  emissionPerSecond: large,
  incentivesLastUpdateTimestamp: 123n,
  tokenIncentivesIndex: large + 1n,
  emissionEndTimestamp: 456n,
  rewardPriceFeed: -large,
  rewardTokenDecimals: decimals,
  precision: 27,
  priceFeedDecimals: 8,
});
const incentive = (decimals: number) => ({
  tokenAddress: address,
  incentiveControllerAddress: market,
  rewardsTokenInformation: [reward(decimals)],
});
const userIncentive = (decimals: number) => ({
  tokenAddress: address,
  incentiveControllerAddress: market,
  userRewardsInformation: [
    {
      rewardTokenSymbol: 'REWARD',
      rewardOracleAddress: market,
      rewardTokenAddress: address,
      userUnclaimedRewards: large,
      tokenIncentivesUserIndex: large + 1n,
      rewardPriceFeed: -large,
      priceFeedDecimals: 8,
      rewardTokenDecimals: decimals,
    },
  ],
});
const reserve = () => ({
  underlyingAsset: address,
  aIncentiveData: incentive(6),
  vIncentiveData: incentive(18),
  sIncentiveData: incentive(18),
});
const userReserve = () => ({
  underlyingAsset: address,
  aTokenIncentivesUserData: userIncentive(6),
  vTokenIncentivesUserData: userIncentive(18),
  sTokenIncentivesUserData: userIncentive(18),
});

class IncentiveProvider extends AbstractProvider {
  calls: PerformActionRequest[] = [];
  reserves = [reserve()];
  userReserves = [userReserve()];
  failure?: Error;

  constructor() {
    super(Network.from(143), { cacheTimeout: -1 });
  }

  async _detectNetwork(): Promise<Network> {
    return Network.from(143);
  }

  async _perform<T = unknown>(request: PerformActionRequest): Promise<T> {
    this.calls.push(request);
    if (this.failure) throw this.failure;
    if (request.method !== 'call') throw new Error('Unexpected operation');
    const call = iface.parseTransaction({ data: request.transaction.data ?? '0x' });
    if (!call) throw new Error('Missing call');
    expect(call.args[0]).toBe(getAddress(market));
    if (call.name !== 'getReservesIncentivesData') expect(call.args[1]).toBe(getAddress(user));
    const values =
      call.name === 'getFullReservesIncentiveData'
        ? [this.reserves, this.userReserves]
        : [call.name === 'getReservesIncentivesData' ? this.reserves : this.userReserves];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Only ABI-encoded call bytes are returned by this offline provider.
    return iface.encodeFunctionResult(call.fragment, values) as T;
  }
}

function setup() {
  const provider = new IncentiveProvider();
  const helper = new UiIncentiveDataProvider({
    uiIncentiveDataProviderAddress: address,
    provider,
    chainId: 143,
  });
  return { provider, helper };
}

describe('UiIncentiveDataProvider actual ethers 6 ABI reads', () => {
  it('decodes synthetic legacy ABI vectors for six/eighteen-decimal and all token families', async () => {
    const { helper, provider } = setup();
    expect(helper.provider).toBe(provider);
    const [row] = await helper.getReservesIncentivesDataHumanized({
      lendingPoolAddressProvider: market,
    });
    expect(row.id).toBe(`143-${address}-${market}`);
    expect(row.underlyingAsset).toBe(address);
    for (const [data, decimals] of [
      [row.aIncentiveData, 6],
      [row.vIncentiveData, 18],
      [row.sIncentiveData, 18],
    ] as const) {
      expect(data).toEqual({
        tokenAddress: getAddress(address),
        incentiveControllerAddress: getAddress(market),
        rewardsTokenInformation: [
          {
            ...reward(decimals),
            rewardTokenAddress: getAddress(address),
            rewardOracleAddress: getAddress(market),
            emissionPerSecond: large.toString(),
            tokenIncentivesIndex: (large + 1n).toString(),
            rewardPriceFeed: (-large).toString(),
            incentivesLastUpdateTimestamp: 123,
            emissionEndTimestamp: 456,
          },
        ],
      });
    }

    expect(JSON.parse(JSON.stringify(row))).toEqual(row);
  });

  it('preserves user rewards and indexes over 2^53 without decimal normalization', async () => {
    const { helper } = setup();
    const [row] = await helper.getUserReservesIncentivesDataHumanized({
      lendingPoolAddressProvider: market,
      user,
    });
    expect(row.id).toBe(`143-${user}-${address}-${market}`);
    for (const [data, decimals] of [
      [row.aTokenIncentivesUserData, 6],
      [row.vTokenIncentivesUserData, 18],
      [row.sTokenIncentivesUserData, 18],
    ] as const) {
      expect(data.userRewardsInformation[0]).toEqual({
        ...userIncentive(decimals).userRewardsInformation[0],
        rewardTokenAddress: getAddress(address),
        rewardOracleAddress: getAddress(market),
        userUnclaimedRewards: large.toString(),
        tokenIncentivesUserIndex: (large + 1n).toString(),
        rewardPriceFeed: (-large).toString(),
      });
    }
  });

  it.each([0, 123456, '0x1e240'] as const)(
    'forwards historical block %s on every raw and humanized read',
    async blockTag => {
      const { helper, provider } = setup();
      const args = { lendingPoolAddressProvider: market, user };
      const raw = await helper.getReservesIncentivesData(args, { blockTag });
      expect(raw[0].aIncentiveData.rewardsTokenInformation[0].emissionPerSecond).toBe(large);
      await helper.getUserReservesIncentivesData(args, { blockTag });
      const full = await helper.getFullReservesIncentiveData(args, { blockTag });
      expect(
        full[1][0].sTokenIncentivesUserData.userRewardsInformation[0].userUnclaimedRewards,
      ).toBe(large);
      await helper.getReservesIncentivesDataHumanized(args, { blockTag });
      await helper.getUserReservesIncentivesDataHumanized(args, { blockTag });
      expect(provider.calls).toHaveLength(5);
      for (const call of provider.calls) {
        if (call.method !== 'call') throw new Error('Unexpected operation');
        expect(call.transaction.to).toBe(getAddress(address));
        expect(call.blockTag).toBe(
          typeof blockTag === 'number' ? `0x${blockTag.toString(16)}` : blockTag,
        );
      }
    },
  );

  it('preserves empty stable incentive fields for Neverland with stable borrowing disabled', async () => {
    const { helper, provider } = setup();
    provider.reserves[0].sIncentiveData.rewardsTokenInformation = [];
    provider.userReserves[0].sTokenIncentivesUserData.userRewardsInformation = [];
    const [row] = await helper.getReservesIncentivesDataHumanized({
      lendingPoolAddressProvider: market,
    });
    const [userRow] = await helper.getUserReservesIncentivesDataHumanized({
      lendingPoolAddressProvider: market,
      user,
    });
    expect(row.sIncentiveData.rewardsTokenInformation).toEqual([]);
    expect(userRow.sTokenIncentivesUserData.userRewardsInformation).toEqual([]);
  });

  it('lets the provider select latest by default and preserves empty results', async () => {
    const { helper, provider } = setup();
    provider.reserves = [];
    provider.userReserves = [];
    expect(
      await helper.getReservesIncentivesDataHumanized({ lendingPoolAddressProvider: market }),
    ).toEqual([]);
    expect(
      await helper.getUserReservesIncentivesDataHumanized({
        lendingPoolAddressProvider: market,
        user,
      }),
    ).toEqual([]);
    expect(provider.calls[0]).toMatchObject({ blockTag: 'latest' });
  });

  it('propagates transport errors without substituting empty data', async () => {
    const { helper, provider } = setup();
    provider.failure = new Error('provider unavailable');
    await expect(
      helper.getReservesIncentivesDataHumanized({ lendingPoolAddressProvider: market }),
    ).rejects.toThrow('provider unavailable');
    await expect(
      helper.getUserReservesIncentivesDataHumanized({ lendingPoolAddressProvider: market, user }),
    ).rejects.toThrow('provider unavailable');
  });

  it.each(['incentivesLastUpdateTimestamp', 'emissionEndTimestamp'] as const)(
    'rejects unsafe timestamp %s',
    async field => {
      const { helper, provider } = setup();
      provider.reserves[0].aIncentiveData.rewardsTokenInformation[0][field] = 9007199254740992n;
      await expect(
        helper.getReservesIncentivesDataHumanized({ lendingPoolAddressProvider: market }),
      ).rejects.toThrow('overflow');
    },
  );

  it('rejects invalid addresses and unsafe chain IDs without using ENS', async () => {
    const { helper, provider } = setup();
    expect(
      () =>
        new UiIncentiveDataProvider({
          provider,
          chainId: 143,
          uiIncentiveDataProviderAddress: 'invalid.eth',
        }),
    ).toThrow();
    expect(
      () =>
        new UiIncentiveDataProvider({
          provider,
          chainId: Number.MAX_SAFE_INTEGER + 1,
          uiIncentiveDataProviderAddress: address,
        }),
    ).toThrow('chainId');
    await expect(
      helper.getReservesIncentivesData({ lendingPoolAddressProvider: 'invalid.eth' }),
    ).rejects.toThrow();
    await expect(
      helper.getUserReservesIncentivesData({
        lendingPoolAddressProvider: market,
        user: 'invalid.eth',
      }),
    ).rejects.toThrow();
    expect(provider.calls).toEqual([]);
  });
});
