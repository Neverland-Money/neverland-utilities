import { Contract, ethers } from 'ethers';
import { NeverlandUiService } from './index';
import type {
  EmissionData,
  LockInfo,
  PriceData,
  RewardSummary,
  UiFullBundle,
  UserDashboardData,
} from './types';
const UI_PROVIDER = '0x74132CE97c02E286d221715B3df6094790A1DEc1';
const USER = '0x00000000000000000000000000000000000000a1';
const DUST = '0x0000000000000000000000000000000000000d57';
const USDC = '0x00000000000000000000000000000000000000c0';
const provider = new ethers.JsonRpcProvider(
  'http://127.0.0.1:1',
  {
    chainId: 143,
    name: 'monad',
  },
  { staticNetwork: true },
);
const ether = (amount: string) => ethers.parseEther(amount);
/** A service whose contract reads are the given stubs. */
const serviceWith = (stubs: Record<string, jest.Mock>) => {
  const service = new NeverlandUiService(UI_PROVIDER, provider);
  service['contract'] = stubs as unknown as Contract;
  return service;
};
const lock = (id: number): LockInfo => ({
  tokenId: ethers.getBigInt(id),
  amount: ether(String(id)),
  end: 0n,
  effectiveStart: 0n,
  isPermanent: true,
  votingPower: ether(String(id * 2)),
  rewardReceiver: USER,
  owner: USER,
});
/** One getUserDashboard page. Its totals are zero because the service recomputes them. */
const page = (ids: number[], nextRawOffset: number, hasMore: boolean): UserDashboardData => ({
  user: USER,
  tokenIds: ids.map(id => ethers.getBigInt(id)),
  locks: ids.map(id => lock(id)),
  rewardSummaries: [],
  totalVotingPower: 0n,
  totalLockedAmount: 0n,
  rawTokenCount: 10n,
  nextRawOffset: ethers.getBigInt(nextRawOffset),
  hasMore,
});
/** A paged contract read that answers by raw offset and throws on any offset it does not know. */
const pagedBy = <T>(pages: Record<number, T | Error>) =>
  jest.fn(async (_user: string, offset: bigint): Promise<T> => {
    const result = pages[ethers.getNumber(offset)];
    if (result === undefined) throw new Error(`unexpected offset ${offset.toString()}`);
    if (result instanceof Error) throw result;
    return result;
  });
const ids = (values: bigint[]) => values.map(value => ethers.getNumber(value));
describe('NeverlandUiService', () => {
  it('rejects integer counts outside the safe JavaScript number range', async () => {
    const getUserTokenCount = jest.fn(async () => 9007199254740992n);
    await expect(serviceWith({ getUserTokenCount }).getUserTokenCount(USER)).rejects.toThrow();
  });
  describe('resolution masks', () => {
    it('reads single bits of a resolvedMask', () => {
      const mask = 5n;
      expect(NeverlandUiService.isRowResolved(mask, 0)).toBe(true);
      expect(NeverlandUiService.isRowResolved(mask, 1)).toBe(false);
      expect(NeverlandUiService.isRowResolved(mask, 2)).toBe(true);
    });
    it('treats rows outside the 256-bit mask as unresolved', () => {
      const full = 2n ** 256n - 1n;
      expect(NeverlandUiService.isRowResolved(full, 255)).toBe(true);
      expect(NeverlandUiService.isRowResolved(full, 256)).toBe(false);
      expect(NeverlandUiService.isRowResolved(full, -1)).toBe(false);
    });
    it('requires every leading row for areAllRowsResolved', () => {
      expect(NeverlandUiService.areAllRowsResolved(7n, 3)).toBe(true);
      expect(NeverlandUiService.areAllRowsResolved(5n, 3)).toBe(false);
      expect(NeverlandUiService.areAllRowsResolved(0n, 0)).toBe(true);
    });
  });
  describe('getUserDashboardWithPagination', () => {
    it('follows nextRawOffset across sparse pages and recomputes the totals', async () => {
      const getUserDashboard = pagedBy({ 0: page([1, 2], 7, true), 7: page([3], 9, false) });
      const dashboard = await serviceWith({ getUserDashboard }).getUserDashboardWithPagination(
        USER,
        5,
      );
      expect(getUserDashboard.mock.calls.map(([, offset]) => ethers.getNumber(offset))).toEqual([
        0, 7,
      ]);
      expect(ids(dashboard.tokenIds)).toEqual([1, 2, 3]);
      expect(dashboard.totalLockedAmount).toEqual(ether('6'));
      expect(dashboard.totalVotingPower).toEqual(ether('12'));
      expect(dashboard.hasMore).toBe(false);
      expect(ethers.getNumber(dashboard.nextRawOffset)).toBe(9);
    });
    it('returns what it has, with a cursor to retry, when a page reverts', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const getUserDashboard = pagedBy({
        0: page([1, 2], 5, true),
        5: new Error('execution reverted'),
      });
      const dashboard = await serviceWith({ getUserDashboard }).getUserDashboardWithPagination(
        USER,
        5,
      );
      expect(ids(dashboard.tokenIds)).toEqual([1, 2]);
      expect(dashboard.hasMore).toBe(true);
      expect(ethers.getNumber(dashboard.nextRawOffset)).toBe(5);
      expect(warn).toHaveBeenCalledTimes(1);
    });
    it('stops instead of looping when the cursor does not advance', async () => {
      const getUserDashboard = pagedBy({ 0: page([1], 0, true) });
      const dashboard = await serviceWith({ getUserDashboard }).getUserDashboardWithPagination(
        USER,
        5,
      );
      expect(getUserDashboard).toHaveBeenCalledTimes(1);
      expect(dashboard.hasMore).toBe(true);
    });
  });
  describe('getUiFullBundlePaginated', () => {
    /** A bundle page whose global sections are tagged, so the test can tell pages apart. */
    const bundle = (user: UserDashboardData, tag: string): UiFullBundle =>
      ({
        meta: { dustLock: tag },
        essential: { user, globalStats: { tag }, emissions: { tag }, marketData: { tag } },
        extended: {
          unlockSchedule: {
            unlockTimes: user.tokenIds.map(id => id * 1000n),
            amounts: user.locks.map(l => l.amount),
            tokenIds: user.tokenIds,
          },
          allPrices: { tag },
        },
        network: { tag },
      }) as unknown as UiFullBundle;
    it('merges every page and its unlock schedule, and keeps the first page globals', async () => {
      const getUiFullBundle = pagedBy({
        0: bundle(page([1, 2], 7, true), 'first'),
        7: bundle(page([3], 9, false), 'second'),
      });
      const result = await serviceWith({ getUiFullBundle }).getUiFullBundlePaginated(USER, 5);
      expect(ids(result.essential.user.tokenIds)).toEqual([1, 2, 3]);
      expect(result.essential.user.totalLockedAmount).toEqual(ether('6'));
      expect(ids(result.extended.unlockSchedule.tokenIds)).toEqual([1, 2, 3]);
      expect(ids(result.extended.unlockSchedule.unlockTimes)).toEqual([1000, 2000, 3000]);
      expect(result.meta.dustLock).toBe('first');
      expect(result.essential.globalStats).toEqual({ tag: 'first' });
    });
    it('returns the pages it has, with a cursor to retry, when a later page reverts', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const getUiFullBundle = pagedBy({
        0: bundle(page([1, 2], 7, true), 'first'),
        7: new Error('execution reverted'),
      });
      const result = await serviceWith({ getUiFullBundle }).getUiFullBundlePaginated(USER, 5);
      expect(ids(result.essential.user.tokenIds)).toEqual([1, 2]);
      expect(ids(result.extended.unlockSchedule.tokenIds)).toEqual([1, 2]);
      expect(result.essential.user.hasMore).toBe(true);
      expect(ethers.getNumber(result.essential.user.nextRawOffset)).toBe(7);
      expect(result.meta.dustLock).toBe('first');
      expect(warn).toHaveBeenCalledTimes(1);
    });
    it('throws when the first page reverts, so getUiFullBundle returns null', async () => {
      const getUiFullBundle = pagedBy<UiFullBundle>({ 0: new Error('execution reverted') });
      const service = serviceWith({ getUiFullBundle });
      await expect(service.getUiFullBundlePaginated(USER, 5)).rejects.toThrow('execution reverted');
      await expect(service.getUiFullBundle(USER)).resolves.toBeNull();
    });
  });
  describe('calculateTotalRewardsUSD', () => {
    const service = new NeverlandUiService(UI_PROVIDER, provider);
    const dustMixedCase = `0x${DUST.slice(2).toUpperCase()}`;
    const prices = (resolvedMask: number): PriceData => ({
      tokens: [DUST, USDC],
      prices: [200000000n, 100000000n],
      lastUpdated: [0n, 0n],
      resolvedMask: ethers.getBigInt(resolvedMask),
      dustPriceFromOracle: true,
      asOfBlock: 0n,
      asOfTimestamp: 0n,
    });
    const summaries: RewardSummary[] = [
      {
        tokenId: 1n,
        rewardTokens: [DUST, USDC],
        revenueRewards: [ether('1'), 5000000n],
      },
      { tokenId: 2n, rewardTokens: [dustMixedCase], revenueRewards: [ether('0.5')] },
    ];
    it('sums the DUST revenue rewards and prices them', () => {
      expect(service.calculateTotalRewardsUSD(summaries, prices(0b11), DUST)).toEqual({
        totalRewards: ether('1.5').toString(),
        totalRewardsUSD: '3.00',
      });
    });
    it('adds the per-user emissions only when they are passed', () => {
      const emissions: EmissionData = {
        rewardTokens: [DUST],
        totalRewards: [ether('0.5')],
        resolved: true,
        asOfBlock: 0n,
        asOfTimestamp: 0n,
      };
      expect(service.calculateTotalRewardsUSD(summaries, prices(0b11), DUST, emissions)).toEqual({
        totalRewards: ether('2').toString(),
        totalRewardsUSD: '4.00',
      });
    });
    it('reports no USD value while the DUST price row is unresolved', () => {
      expect(service.calculateTotalRewardsUSD(summaries, prices(0b10), DUST)).toEqual({
        totalRewards: ether('1.5').toString(),
        totalRewardsUSD: '0',
      });
    });
    it('shows values under a cent as < 0.01', () => {
      const tiny: RewardSummary[] = [
        { tokenId: 1n, rewardTokens: [DUST], revenueRewards: [ether('0.001')] },
      ];
      expect(service.calculateTotalRewardsUSD(tiny, prices(0b11), DUST).totalRewardsUSD).toBe(
        '< 0.01',
      );
    });
  });
});
