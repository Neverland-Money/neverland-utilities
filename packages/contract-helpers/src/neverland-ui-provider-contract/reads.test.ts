import { Result } from 'ethers';
import type { UiPaginationOptions } from '../index';
import {
  allPrices,
  bootstrap,
  dashboardPage,
  DUST,
  emissions,
  fullBundle,
  globalStats,
  LARGE,
  marketData,
  meta,
  network,
  serviceWithReads,
  UI_PROVIDER,
  USER,
} from './__tests__/fixtures';
import type { UiFullBundle, UserDashboardData } from './types';

const assertPlain = (value: unknown): void => {
  if (value === null || typeof value !== 'object') return;
  expect(value).not.toBeInstanceOf(Result);
  expect(Object.isFrozen(value)).toBe(false);
  expect(Object.getPrototypeOf(value)).toBe(
    Array.isArray(value) ? Array.prototype : Object.prototype,
  );
  for (const item of Object.values(value)) assertPlain(item);
};

describe('NeverlandUiService real ethers reads', () => {
  it('materializes every direct structured read with exact bigint and boolean values', async () => {
    const schedule = { unlockTimes: [LARGE], amounts: [LARGE], tokenIds: [1n] };
    const rewards = {
      totalRevenue: [LARGE],
      totalEmissions: [LARGE],
      revenueResolvedMask: 0n,
      emissionsResolvedMask: 0n,
      asOfBlock: LARGE,
      asOfTimestamp: LARGE,
    };
    const breakdown = {
      breakdown: [{ asset: DUST, amount: LARGE, symbol: 'DUST', isDebt: false, resolved: false }],
      enumerationResolved: false,
    };
    const { service } = serviceWithReads({
      getProtocolMeta: () => meta,
      getUiBootstrap: () => bootstrap,
      getAllPrices: () => allPrices,
      getGlobalStats: () => globalStats,
      getMarketData: () => marketData,
      getNetworkData: () => network,
      getUserRewardsSummary: () => rewards,
      getUserEmissions: () => emissions,
      getUnlockSchedule: () => schedule,
      getUserEmissionBreakdown: () => breakdown,
    });
    const reads: Array<[Promise<unknown>, unknown]> = [
      [service.getProtocolMeta(), meta],
      [service.getUiBootstrap(), bootstrap],
      [service.getAllPrices(), allPrices],
      [service.getGlobalStats(), globalStats],
      [service.getMarketData(), marketData],
      [service.getNetworkData(), network],
      [service.getUserRewardsSummary(USER, [DUST]), rewards],
      [service.getUserEmissions(USER), emissions],
      [service.getUnlockSchedule(USER), schedule],
      [service.getUserEmissionBreakdown(USER, DUST), breakdown],
    ];
    for (const [read, expected] of reads) {
      // eslint-disable-next-line no-await-in-loop -- Each already-started read is checked against its matching fixture.
      const value = await read;
      expect(value).toStrictEqual(expected);
      assertPlain(value);
    }
  });

  it.each([0, 1, 3])('preserves %i market and emission tuple rows', async count => {
    const markets = Array.from({ length: count }, () => ({
      provider: UI_PROVIDER,
      marketId: 'Main',
    }));
    const breakdown = {
      breakdown: Array.from({ length: count }, () => ({
        asset: DUST,
        amount: LARGE,
        symbol: 'DUST',
        isDebt: true,
        resolved: false,
      })),
      enumerationResolved: false,
    };
    const { service } = serviceWithReads({
      getRegisteredPoolMarkets: () => markets,
      getUserEmissionBreakdown: () => breakdown,
    });
    const result = await service.getRegisteredPoolMarkets();
    expect(result).toStrictEqual(markets);
    assertPlain(result);
    const emissionResult = await service.getUserEmissionBreakdown(USER, DUST);
    expect(emissionResult).toStrictEqual(breakdown);
    assertPlain(emissionResult);
    result.push({ provider: USER, marketId: 'New' });
    expect(result).toHaveLength(count + 1);
  });

  it.each([0, 1, 3])('materializes %i nested bundle/dashboard position rows', async count => {
    const page = dashboardPage(
      Array.from({ length: count }, (_, index) => BigInt(index + 1)),
      BigInt(count),
      false,
    );
    const bundle = fullBundle(page);
    const { service } = serviceWithReads({
      getUserDashboard: () => page,
      getUiFullBundle: () => bundle,
    });
    const dashboard = await service.getUserDashboard(USER);
    expect(dashboard).toStrictEqual(page);
    assertPlain(dashboard);
    const result = await service.getUiFullBundle(USER);
    expect(result).toStrictEqual(bundle);
    assertPlain(result);
  });
});

/** More page reads than any pagination test needs. */
const MAX_PAGE_READS = 20;

describe.each(['dashboard', 'bundle'] as const)('strict %s raw-cursor pagination', kind => {
  const run = (
    pages: Record<string, UserDashboardData | Error>,
    options?: UiPaginationOptions,
    pageSize = 1,
    transformBundle: (bundle: UiFullBundle) => UiFullBundle = bundle => bundle,
  ) => {
    const offsets: bigint[] = [];
    const read = (args: readonly unknown[]): unknown => {
      const offset = args[1];
      if (typeof offset !== 'bigint') throw new Error('Missing raw offset');
      offsets.push(offset);
      // Microtask-only reads starve Jest's timeout, so bound a cursor loop that never terminates.
      if (offsets.length > MAX_PAGE_READS) throw new Error('Read budget exceeded');
      const page = pages[offset.toString()];
      if (!page) throw new Error(`Unexpected raw offset ${offset}`);
      if (page instanceof Error) throw page;
      return kind === 'dashboard' ? page : transformBundle(fullBundle(page));
    };

    const { service, calls } = serviceWithReads({
      [kind === 'dashboard' ? 'getUserDashboard' : 'getUiFullBundle']: read,
    });
    const result =
      kind === 'dashboard'
        ? service.getUserDashboardWithPagination(USER, pageSize, options)
        : service.getUiFullBundlePaginated(USER, pageSize, options);
    return { result, offsets, calls };
  };

  const userOf = (value: UserDashboardData | UiFullBundle) =>
    'essential' in value ? value.essential.user : value;

  it('follows advancing empty/small sparse pages even when cursor exceeds live count', async () => {
    const { result, offsets } = run(
      {
        0: dashboardPage([], 32n, true, 2n),
        32: dashboardPage([3n], 40n, true, 2n),
        40: dashboardPage([9n], 52n, false, 2n),
      },
      { requireComplete: true },
    );
    const value = await result;
    expect(offsets).toEqual([0n, 32n, 40n]);
    expect(userOf(value).tokenIds).toStrictEqual([3n, 9n]);
    expect(userOf(value).nextRawOffset).toBe(52n);
    expect(userOf(value).hasMore).toBe(false);
    assertPlain(value);
  });

  it('keeps raw cursors exact above the safe number range', async () => {
    const cursor = 2n ** 60n;
    const { result, offsets } = run(
      {
        0: dashboardPage([3n], cursor, true, 2n),
        [cursor.toString()]: dashboardPage([9n], cursor + 1n, false, 2n),
      },
      { requireComplete: true },
    );
    expect(userOf(await result).tokenIds).toStrictEqual([3n, 9n]);
    expect(offsets).toEqual([0n, cursor]);
  });

  it.each([false, true])('propagates the original RPC error (later page: %s)', async later => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = Object.assign(new Error('RPC failed'), { code: 'NETWORK_ERROR', data: '0xdead' });
    const { result } = run(
      later ? { 0: dashboardPage([1n], 5n, true, 2n), 5: error } : { 0: error },
      { requireComplete: true },
    );
    await expect(result).rejects.toBe(error);
  });

  it.each([
    ['stalled continuation', { 0: dashboardPage([1n], 0n, true, 2n) }],
    ['terminal cursor below count', { 0: dashboardPage([1n, 2n], 1n, false, 2n) }],
    ['missing owned token', { 0: dashboardPage([1n], 9n, false, 2n) }],
    ['excess owned token', { 0: dashboardPage([1n, 2n], 9n, false, 1n) }],
    ['duplicate token in one page', { 0: dashboardPage([1n, 1n], 9n, false, 2n) }],
    [
      'duplicate token across pages',
      { 0: dashboardPage([1n], 5n, true, 2n), 5: dashboardPage([1n], 9n, false, 2n) },
    ],
    ['zero token', { 0: dashboardPage([0n], 9n, false, 1n) }],
    [
      'changed live count',
      { 0: dashboardPage([1n], 5n, true, 1n), 5: dashboardPage([2n], 9n, false, 2n) },
    ],
    ['missing lock row', { 0: { ...dashboardPage([1n], 9n, false), locks: [] } }],
    ['missing reward row', { 0: { ...dashboardPage([1n], 9n, false), rewardSummaries: [] } }],
    [
      'misassociated lock row',
      { 0: { ...dashboardPage([1n], 9n, false), locks: dashboardPage([2n], 9n, false).locks } },
    ],
    [
      'misassociated reward row',
      {
        0: {
          ...dashboardPage([1n], 9n, false),
          rewardSummaries: dashboardPage([2n], 9n, false).rewardSummaries,
        },
      },
    ],
    [
      'misaligned reward amounts',
      {
        0: {
          ...dashboardPage([1n], 9n, false),
          rewardSummaries: [{ tokenId: 1n, revenueRewards: [], rewardTokens: [DUST] }],
        },
      },
    ],
  ] satisfies Array<[string, Record<string, UserDashboardData>]>)(
    'rejects %s',
    async (_label, pages) => {
      await expect(run(pages, { requireComplete: true }).result).rejects.toThrow();
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid strict page size %s before reading',
    async size => {
      const { result, calls } = run(
        { 0: dashboardPage([], 0n, false) },
        { requireComplete: true },
        size,
      );
      await expect(result).rejects.toThrow();
      expect(calls).not.toHaveBeenCalled();
    },
  );

  it('accepts the complete empty collection', async () => {
    const value = await run({ 0: dashboardPage([], 0n, false) }, { requireComplete: true }).result;
    expect(userOf(value).tokenIds).toStrictEqual([]);
  });

  it('retains default best-effort partial results and retry cursor on later RPC failure', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { result } = run({ 0: dashboardPage([1n], 9n, true, 2n), 9: new Error('RPC failed') });
    const user = userOf(await result);
    expect(user.tokenIds).toStrictEqual([1n]);
    expect(user.hasMore).toBe(true);
    expect(user.nextRawOffset).toBe(9n);
  });

  it('retains default stalled and terminal partial metadata', async () => {
    const stalledRun = run({ 0: dashboardPage([1n], 0n, true, 2n) });
    const stalled = userOf(await stalledRun.result);
    expect(stalledRun.offsets).toEqual([0n]);
    expect(stalled.tokenIds).toStrictEqual([1n]);
    expect(stalled.hasMore).toBe(true);
    const terminal = userOf(await run({ 0: dashboardPage([1n], 9n, false, 2n) }).result);
    expect(terminal.tokenIds).toStrictEqual([1n]);
    expect(terminal.hasMore).toBe(false);
  });

  if (kind === 'bundle') {
    it('rejects misaligned per-page unlock schedule arrays', async () => {
      const { result } = run(
        { 0: dashboardPage([1n], 9n, false) },
        { requireComplete: true },
        1,
        bundle => ({
          ...bundle,
          extended: {
            ...bundle.extended,
            unlockSchedule: { ...bundle.extended.unlockSchedule, amounts: [] },
          },
        }),
      );
      await expect(result).rejects.toThrow();
    });
  }
});
