import { neverlandUiProviderAbi } from '@neverland-money/contract-types';
import { ethers } from 'ethers';
import { NeverlandUiService } from '..';
import type {
  EmissionData,
  GlobalStats,
  MarketData,
  NetworkData,
  PriceData,
  ProtocolMeta,
  UiBootstrap,
  UiFullBundle,
  UserDashboardData,
} from '../types';

export const UI_PROVIDER = '0x74132CE97c02E286d221715B3df6094790A1DEc1';
export const USER = ethers.getAddress('0x00000000000000000000000000000000000000a1');
export const DUST = ethers.getAddress('0x0000000000000000000000000000000000000d57');
export const LARGE = 2n ** 200n + 17n;
export const iface = new ethers.Interface(neverlandUiProviderAbi);
export const meta: ProtocolMeta = {
  dustLock: UI_PROVIDER,
  revenueReward: UI_PROVIDER,
  dustRewardsController: UI_PROVIDER,
  dustOracle: UI_PROVIDER,
  earlyWithdrawPenalty: LARGE,
  minLockAmount: LARGE,
  rewardDistributor: UI_PROVIDER,
  revenueRewardTokens: [DUST],
  emissionRewardTokens: [DUST],
  emissionStrategies: [UI_PROVIDER],
};
export const globalStats: GlobalStats = {
  totalSupply: LARGE,
  totalVotingPower: LARGE,
  permanentLockBalance: LARGE,
  rewardTokens: [DUST],
  totalRewardsPerToken: [LARGE],
  epoch: LARGE,
  activeTokenCount: LARGE,
};
export const marketData: MarketData = {
  rewardTokens: [DUST],
  rewardTokenBalances: [LARGE],
  distributionRates: [LARGE],
  nextEpochTimestamp: LARGE,
  currentEpoch: LARGE,
  epochRewards: [LARGE],
  nextEpochRewards: [LARGE],
  totalValueLockedUSD: LARGE,
  followingEpochRewards: [LARGE],
  totalValueLockedUSDResolved: false,
  asOfBlock: LARGE,
  asOfTimestamp: LARGE,
};
export const allPrices: PriceData = {
  tokens: [DUST],
  prices: [LARGE],
  lastUpdated: [LARGE],
  resolvedMask: 0n,
  dustPriceFromOracle: false,
  asOfBlock: LARGE,
  asOfTimestamp: LARGE,
};
export const network: NetworkData = {
  currentBlock: LARGE,
  currentTimestamp: LARGE,
  gasPrice: LARGE,
};
export const emissions: EmissionData = {
  rewardTokens: [DUST],
  totalRewards: [LARGE],
  resolved: false,
  asOfBlock: LARGE,
  asOfTimestamp: LARGE,
};
export const bootstrap: UiBootstrap = { meta, globalStats, marketData, allPrices, network };

export const dashboardPage = (
  tokenIds: bigint[],
  nextRawOffset: bigint,
  hasMore: boolean,
  rawTokenCount = BigInt(tokenIds.length),
): UserDashboardData => ({
  user: USER,
  tokenIds,
  locks: tokenIds.map(tokenId => ({
    tokenId,
    amount: LARGE,
    end: LARGE,
    effectiveStart: LARGE,
    isPermanent: false,
    votingPower: LARGE,
    rewardReceiver: USER,
    owner: USER,
  })),
  rewardSummaries: tokenIds.map(tokenId => ({
    tokenId,
    revenueRewards: [LARGE],
    rewardTokens: [DUST],
  })),
  totalVotingPower: LARGE * BigInt(tokenIds.length),
  totalLockedAmount: LARGE * BigInt(tokenIds.length),
  rawTokenCount,
  nextRawOffset,
  hasMore,
});

export const fullBundle = (user: UserDashboardData): UiFullBundle => ({
  meta,
  essential: { user, globalStats, emissions, marketData },
  extended: {
    unlockSchedule: {
      unlockTimes: user.tokenIds.map(() => LARGE),
      amounts: user.tokenIds.map(() => LARGE),
      tokenIds: [...user.tokenIds],
    },
    allPrices,
  },
  network,
});

type ReadHandler = (args: readonly unknown[]) => unknown;

/** Only the transport is replaced; calls retain real ethers dispatch and decoded Results. */
export const serviceWithReads = (handlers: Record<string, ReadHandler>) => {
  const provider = new ethers.JsonRpcProvider(
    'http://127.0.0.1:1',
    { chainId: 143, name: 'monad' },
    { staticNetwork: true, cacheTimeout: -1 },
  );
  const calls = jest.spyOn(provider, 'call').mockImplementation(async tx => {
    const call = iface.parseTransaction({ data: ethers.hexlify(tx.data ?? '0x') });
    if (!call || !handlers[call.name]) throw new Error(`Unexpected offline UI call ${call?.name}`);
    const result: unknown = await handlers[call.name](Array.from(call.args));
    const { outputs } = call.fragment;
    let values: unknown[];
    if (outputs.length === 1) values = [result];
    else if (Array.isArray(result)) values = result;
    else if (result && typeof result === 'object')
      values = outputs.map((output): unknown => Reflect.get(result, output.name));
    else throw new Error('Expected named ABI outputs');
    return iface.encodeFunctionResult(call.fragment, values);
  });
  return { service: new NeverlandUiService(UI_PROVIDER, provider), calls };
};
