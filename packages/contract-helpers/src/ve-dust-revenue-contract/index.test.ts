import { dustLockAbi, erc20Abi, revenueRewardAbi } from '@neverland-money/contract-types';
import { getAddress, Interface, JsonRpcProvider, parseEther, ZeroAddress } from 'ethers';
import type { BigNumberish, Result } from 'ethers';
import { decodeAbiResult } from '../commons/abi-types';
import { VeDustRevenueHelper } from '.';

const LOCK = '0x0000000000000000000000000000000000000011';
const REVENUE = '0x0000000000000000000000000000000000000022';
const USER = '0x0000000000000000000000000000000000000033';
const REWARD = '0x0000000000000000000000000000000000000044';
const provider = new JsonRpcProvider('http://127.0.0.1:1', 143, { staticNetwork: true });
const helper = new VeDustRevenueHelper({
  provider,
  chainId: 143,
  revenueAddress: REVENUE,
  dustLockAddress: LOCK,
});
const lockIface = new Interface(dustLockAbi);
const revenueIface = new Interface(revenueRewardAbi);
const erc20Iface = new Interface(erc20Abi);
/** Route a mocked read by target: reward tokens answer the helper's ERC20 `decimals()` reads. */
function ifaceFor(to: unknown): Interface {
  if (to === LOCK) return lockIface;
  return to === REVENUE ? revenueIface : erc20Iface;
}

describe('VeDustRevenueHelper ethers v6 reads', () => {
  it('aligns named and positional manual token outputs while retaining frozen Results and filtering', async () => {
    const raw = revenueIface.encodeFunctionResult('getRewardTokens', [[REWARD, ZeroAddress]]);
    const call = jest.spyOn(provider, 'call').mockResolvedValue(raw);
    let observed: { iface: Interface; decoded: Result } | undefined;
    const originalDecode = Interface.prototype.decodeFunctionResult;
    const decode = jest
      .spyOn(Interface.prototype, 'decodeFunctionResult')
      .mockImplementation(function (this: Interface, fragment, data) {
        const decoded = originalDecode.call(this, fragment, data);
        observed = { iface: this, decoded };
        return decoded;
      });

    const tokens: string[] = await helper.getRewardTokens();
    expect(call).toHaveBeenCalledWith({
      to: REVENUE,
      data: revenueIface.encodeFunctionData('getRewardTokens', []),
    });
    expect(tokens).toEqual([REWARD]);
    expect(Object.isFrozen(tokens)).toBe(true);
    expect(() => tokens.push(USER)).toThrow(TypeError);

    if (!observed) throw new Error('The helper must decode its actual manual interface');
    decode.mockReturnValue(observed.decoded);
    const projected = decodeAbiResult(observed.iface, revenueRewardAbi, 'getRewardTokens', raw);
    const named: string[] = projected.tokens;
    const positional: string[] = projected[0];
    expect(projected).toBe(observed.decoded);
    expect(Object.isFrozen(projected)).toBe(true);
    expect(named).toBe(positional);
    expect(named).toEqual([REWARD, ZeroAddress]);
  });

  it('aggregates decoded bigint balances and rewards into the existing display strings', async () => {
    jest
      .spyOn(provider, 'getBlock')
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- This focused provider stub supplies the timestamp used by the real helper; constructing unrelated block fields would change no tested behavior.
      .mockResolvedValue({ timestamp: 1700000000 } as Awaited<
        ReturnType<typeof provider.getBlock>
      >);
    jest.spyOn(provider, 'call').mockImplementation(async tx => {
      const iface = ifaceFor(tx.to);
      const { name } = iface.parseTransaction({ data: tx.data! })!;
      const values: Record<string, unknown[]> = {
        balanceOf: [1],
        ownerToNFTokenIdList: [7],
        balanceOfNFT: [parseEther('2')],
        locked: [[parseEther('3'), 1000, 2000, false]],
        totalSupply: [parseEther('20')],
        getRewardTokens: [[REWARD]],
        earnedRewardsAll: [[[2500000]], [2500000]],
        tokenRewardsPerEpoch: [5000000],
        decimals: [6],
      };
      if (!values[name]) throw new Error(`Unexpected read: ${name}`);
      return iface.encodeFunctionResult(name, values[name]);
    });
    const result = await helper.getUserVeDustRevenueData(USER);
    expect(result).toMatchObject({
      veNftIds: [7],
      votingPower: '2.0',
      lockedAmount: '3.0',
      totalRevenueUSD: '2.5',
      rewardAmounts: ['2500000'],
      individualNftRewards: { 7: ['2.5'] },
      individualNftEndTimes: { 7: 2000 },
      pendingRewardsUSD: '5.0',
      totalVeDustSupply: '20.0',
    });
  });

  it('keeps the configured transaction destination when encoding reward claims', () => {
    const tx = helper.getBatchClaimRewardsTxData([7], [REWARD]);
    expect(tx.to).toBe(REVENUE);
    expect(revenueIface.decodeFunctionData('getRewardBatch', tx.data).toArray()).toEqual([
      [7n],
      [REWARD],
    ]);
  });
});

const exactBatchIds = Object.freeze([
  0,
  0n,
  '0',
  Number.MAX_SAFE_INTEGER,
  '9007199254740993',
  9007199254740993n,
  2n ** 256n - 1n,
] satisfies BigNumberish[]);
const invalidBatchIds: BigNumberish[] = [
  '',
  ' ',
  '-',
  '- -1',
  '-1',
  -1n,
  0.1,
  Number.MAX_SAFE_INTEGER + 1,
  NaN,
  Infinity,
  '1e3',
  2n ** 256n,
];
describe('VeDustRevenueHelper exact immutable batch inputs', () => {
  it('canonically encodes all batch methods without mutating readonly arrays', () => {
    const rewards = Object.freeze([REWARD]);
    const expected = [
      0n,
      0n,
      0n,
      9007199254740991n,
      9007199254740993n,
      9007199254740993n,
      2n ** 256n - 1n,
    ];
    const batches = [
      [
        'enableSelfRepayLoanBatch',
        helper.getEnableSelfRepayLoanBatchTxData(exactBatchIds),
        [expected],
      ],
      [
        'disableSelfRepayLoanBatch',
        helper.getDisableSelfRepayLoanBatchTxData(exactBatchIds),
        [expected],
      ],
      [
        'getRewardBatch',
        helper.getBatchClaimRewardsTxData(exactBatchIds, rewards),
        [expected, [REWARD]],
      ],
    ] as const;
    for (const [method, tx, args] of batches) {
      expect(tx.to).toBe(REVENUE);
      expect(revenueIface.decodeFunctionData(method, tx.data).toArray()).toEqual(args);
    }

    expect(exactBatchIds).toEqual([
      0,
      0n,
      '0',
      Number.MAX_SAFE_INTEGER,
      '9007199254740993',
      9007199254740993n,
      2n ** 256n - 1n,
    ]);
    expect(rewards).toEqual([REWARD]);
  });

  it.each(invalidBatchIds)('rejects invalid batch ID %s in every batch encoder', value => {
    expect(() => helper.getEnableSelfRepayLoanBatchTxData([0, value])).toThrow();
    expect(() => helper.getDisableSelfRepayLoanBatchTxData([0, value])).toThrow();
    expect(() => helper.getBatchClaimRewardsTxData([0, value], [REWARD])).toThrow();
  });

  it('rejects the empty and oversized batches RevenueReward reverts on', () => {
    const ids = (count: number) => Array.from({ length: count }, (_, index) => index + 1);
    const rewards = (count: number) =>
      Array.from(
        { length: count },
        (_, index) => `0x${(index + 1).toString(16).padStart(40, '0')}`,
      );
    for (const count of [0, 65]) {
      expect(() => helper.getEnableSelfRepayLoanBatchTxData(ids(count))).toThrow(
        `tokenIds must contain between 1 and 64 entries, got ${count}`,
      );
      expect(() => helper.getDisableSelfRepayLoanBatchTxData(ids(count))).toThrow(
        'between 1 and 64',
      );
      expect(() => helper.getBatchClaimRewardsTxData(ids(count), [REWARD])).toThrow(
        'between 1 and 64',
      );
    }

    for (const count of [0, 33]) {
      expect(() => helper.getBatchClaimRewardsTxData([1], rewards(count))).toThrow(
        `rewardTokens must contain between 1 and 32 entries, got ${count}`,
      );
    }

    const full = helper.getBatchClaimRewardsTxData(ids(64), rewards(32));
    expect(revenueIface.decodeFunctionData('getRewardBatch', full.data).toArray()).toEqual([
      ids(64).map(BigInt),
      rewards(32).map(address => getAddress(address)),
    ]);
    expect(() => helper.getEnableSelfRepayLoanBatchTxData(ids(64))).not.toThrow();
    expect(() => helper.getDisableSelfRepayLoanBatchTxData(ids(1))).not.toThrow();
    expect(() => helper.getBatchClaimRewardsTxData([0], ['bad'])).toThrow();
  });
});

describe('VeDustRevenueHelper configuration and reward token order', () => {
  it.each(['', 'not-an-address', '0x1234'])('rejects the revenue address %j', revenueAddress => {
    expect(
      () =>
        new VeDustRevenueHelper({ provider, chainId: 143, revenueAddress, dustLockAddress: LOCK }),
    ).toThrow();
  });

  it('checksums the revenue address used as the transaction target', () => {
    const mixed = '0x74132ce97c02e286d221715b3df6094790a1dec1';
    const configured = new VeDustRevenueHelper({
      provider,
      chainId: 143,
      revenueAddress: mixed,
      dustLockAddress: LOCK,
    });
    expect(configured.getBatchClaimRewardsTxData([7], [REWARD]).to).toBe(getAddress(mixed));
  });

  it('queries earned rewards in ascending token order and maps them back to registration order', async () => {
    // Registration order puts the higher address first, which earnedRewardsAll would reject.
    const HIGH = '0x00000000000000000000000000000000000000F2';
    const LOW = '0x00000000000000000000000000000000000000e1';
    jest
      .spyOn(provider, 'getBlock')
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- This focused provider stub supplies the timestamp used by the real helper; constructing unrelated block fields would change no tested behavior.
      .mockResolvedValue({ timestamp: 1700000000 } as Awaited<
        ReturnType<typeof provider.getBlock>
      >);
    const earnedQueries: string[][] = [];
    jest.spyOn(provider, 'call').mockImplementation(async tx => {
      const iface = ifaceFor(tx.to);
      const parsed = iface.parseTransaction({ data: tx.data! })!;
      if (parsed.name === 'earnedRewardsAll') {
        const queried: unknown = parsed.args[0];
        if (!Array.isArray(queried)) throw new Error('Expected a token array');
        const tokens = queried.map((token: unknown) => getAddress(String(token)));
        earnedQueries.push(tokens);
        // Mirror RevenueReward._validateUniqueArray: strictly ascending or revert.
        for (let i = 1; i < tokens.length; i++)
          if (BigInt(tokens[i]) <= BigInt(tokens[i - 1]))
            throw new Error('ArrayNotSortedOrContainsDuplicates');
        const earned: Record<string, bigint> = { [LOW]: 1000000n, [HIGH]: 3000000n };
        const row = tokens.map(token => earned[token]);
        return revenueIface.encodeFunctionResult('earnedRewardsAll', [[row], row]);
      }

      const values: Record<string, unknown[]> = {
        balanceOf: [1],
        ownerToNFTokenIdList: [7],
        balanceOfNFT: [parseEther('2')],
        locked: [[parseEther('3'), 1000, 2000, false]],
        totalSupply: [parseEther('20')],
        getRewardTokens: [[HIGH, LOW]],
        tokenRewardsPerEpoch: [0],
        decimals: [6],
      };
      if (!values[parsed.name]) throw new Error(`Unexpected read: ${parsed.name}`);
      return iface.encodeFunctionResult(parsed.name, values[parsed.name]);
    });

    // Both tokens are declared USD reward tokens, so the 6-decimal amounts may be summed.
    const pegged = new VeDustRevenueHelper({
      provider,
      chainId: 143,
      revenueAddress: REVENUE,
      dustLockAddress: LOCK,
      usdRewardTokens: [HIGH, LOW],
    });
    const result = await pegged.getUserVeDustRevenueData(USER);
    expect(earnedQueries).toEqual([[getAddress(LOW), getAddress(HIGH)]]);
    expect(result).toMatchObject({
      rewardTokens: [getAddress(HIGH), getAddress(LOW)],
      rewardAmounts: ['3000000', '1000000'],
      individualNftRewards: { 7: ['3.0', '1.0'] },
      totalRevenueUSD: '4.0',
      hasRewards: true,
    });
  });
});

describe('VeDustRevenueHelper reward token decimals and USD totals', () => {
  const USDC = REWARD;
  const DUST = '0x0000000000000000000000000000000000000055';
  const USDS = '0x0000000000000000000000000000000000000066';
  type Fixture = {
    tokens: string[];
    earned: Record<string, bigint>;
    decimals: Record<string, bigint | Error>;
    pending?: Record<string, bigint>;
    /** Make getRewardTokens() revert so the index fallback runs; these indexes then fail to read. */
    fallbackSkip?: number[];
  };
  const build = (usdRewardTokens?: readonly string[]) =>
    new VeDustRevenueHelper({
      provider,
      chainId: 143,
      revenueAddress: REVENUE,
      dustLockAddress: LOCK,
      ...(usdRewardTokens ? { usdRewardTokens } : {}),
    });
  /** Answer one veNFT (ID 7) and the fixture's reward reads; returns each decimals() target. */
  const mockReads = (fixture: Fixture): string[] => {
    const decimalsReads: string[] = [];
    jest
      .spyOn(provider, 'getBlock')
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- This focused provider stub supplies the timestamp used by the real helper; constructing unrelated block fields would change no tested behavior.
      .mockResolvedValue({ timestamp: 1700000000 } as Awaited<
        ReturnType<typeof provider.getBlock>
      >);
    jest.spyOn(provider, 'call').mockImplementation(async tx => {
      if (typeof tx.to !== 'string' || typeof tx.data !== 'string') {
        throw new Error('Expected a string target and calldata');
      }

      const to = getAddress(tx.to);
      const iface = ifaceFor(to);
      const parsed = iface.parseTransaction({ data: tx.data });
      if (!parsed) throw new Error(`Unexpected call to ${to}`);
      if (parsed.name === 'decimals') {
        decimalsReads.push(to);
        const value = fixture.decimals[to];
        if (value === undefined) throw new Error(`No decimals for ${to}`);
        if (value instanceof Error) throw value;
        return erc20Iface.encodeFunctionResult('decimals', [value]);
      }

      if (parsed.name === 'earnedRewardsAll') {
        const queried: unknown = parsed.args[0];
        if (!Array.isArray(queried)) throw new Error('Expected a token array');
        const row = queried.map(
          (token: unknown) => fixture.earned[getAddress(String(token))] ?? 0n,
        );
        return revenueIface.encodeFunctionResult('earnedRewardsAll', [[row], row]);
      }

      if (parsed.name === 'tokenRewardsPerEpoch') {
        const pending = fixture.pending?.[getAddress(String(parsed.args[0]))] ?? 0n;
        return revenueIface.encodeFunctionResult('tokenRewardsPerEpoch', [pending]);
      }

      if (fixture.fallbackSkip !== undefined) {
        if (parsed.name === 'getRewardTokens') throw new Error('getRewardTokens reverted');
        if (parsed.name === 'rewardTokensLength') {
          return revenueIface.encodeFunctionResult('rewardTokensLength', [fixture.tokens.length]);
        }

        if (parsed.name === 'rewardTokens') {
          const index = Number(parsed.args[0]);
          if (fixture.fallbackSkip.includes(index)) throw new Error('rewardTokens reverted');
          return revenueIface.encodeFunctionResult('rewardTokens', [fixture.tokens[index]]);
        }
      }

      const values: Record<string, unknown[]> = {
        balanceOf: [1],
        ownerToNFTokenIdList: [7],
        balanceOfNFT: [parseEther('2')],
        locked: [[parseEther('3'), 1000, 2000, false]],
        totalSupply: [parseEther('20')],
        getRewardTokens: [fixture.tokens],
      };
      if (!values[parsed.name]) throw new Error(`Unexpected read: ${parsed.name}`);
      return iface.encodeFunctionResult(parsed.name, values[parsed.name]);
    });
    return decimalsReads;
  };

  it('formats each token in its own decimals and leaves non-USD tokens out of the default total', async () => {
    mockReads({
      tokens: [USDC, DUST],
      earned: { [USDC]: 2500000n, [DUST]: 10n ** 18n },
      decimals: { [USDC]: 6n, [DUST]: 18n },
      pending: { [USDC]: 5000000n, [DUST]: 7n * 10n ** 18n },
    });
    const result = await build().getUserVeDustRevenueData(USER);
    expect(result).toMatchObject({
      rewardTokens: [USDC, DUST],
      rewardAmounts: ['2500000', '1000000000000000000'],
      individualNftRewards: { 7: ['2.5', '1.0'] },
      rewardTokenDecimals: [6, 18],
      totalRevenueUSD: '2.5',
      formattedRevenueUSD: '2.5',
      unpricedRewardTokens: [DUST],
      pendingRewardsUSD: '5.0',
      hasRewards: true,
    });
  });

  it('sums declared USD reward tokens across decimals without adding raw units', async () => {
    mockReads({
      tokens: [USDC, DUST, USDS],
      earned: { [USDC]: 2500000n, [DUST]: 10n ** 18n, [USDS]: 125n * 10n ** 16n },
      decimals: { [USDC]: 6n, [DUST]: 18n, [USDS]: 18n },
      pending: { [USDC]: 5000000n, [DUST]: 10n ** 18n, [USDS]: 5n * 10n ** 17n },
    });
    const helperWithUsd = build([USDS, USDC]);
    const result = await helperWithUsd.getUserVeDustRevenueData(USER);
    expect(result).toMatchObject({
      individualNftRewards: { 7: ['2.5', '1.0', '1.25'] },
      rewardTokenDecimals: [6, 18, 18],
      totalRevenueUSD: '3.75',
      unpricedRewardTokens: [DUST],
      pendingRewardsUSD: '5.5',
    });
    expect(await helperWithUsd.getPendingRewardsForNextEpoch()).toBe('5.5');
  });

  it('counts no token in USD when usdRewardTokens is empty, yet still reports rewards', async () => {
    mockReads({
      tokens: [USDC],
      earned: { [USDC]: 2500000n },
      decimals: { [USDC]: 6n },
      pending: { [USDC]: 5000000n },
    });
    const result = await build([]).getUserVeDustRevenueData(USER);
    expect(result).toMatchObject({
      individualNftRewards: { 7: ['2.5'] },
      totalRevenueUSD: '0.0',
      unpricedRewardTokens: [USDC],
      pendingRewardsUSD: '0.00',
      hasRewards: true,
    });
  });

  it('bases hasRewards on raw amounts of any token', async () => {
    mockReads({
      tokens: [USDC, DUST],
      earned: { [DUST]: 1n },
      decimals: { [USDC]: 6n, [DUST]: 18n },
    });
    const withDust = await build().getUserVeDustRevenueData(USER);
    expect(withDust).toMatchObject({
      totalRevenueUSD: '0.0',
      unpricedRewardTokens: [DUST],
      hasRewards: true,
    });

    mockReads({ tokens: [USDC, DUST], earned: {}, decimals: { [USDC]: 6n, [DUST]: 18n } });
    const none = await build().getUserVeDustRevenueData(USER);
    expect(none).toMatchObject({
      rewardAmounts: ['0', '0'],
      individualNftRewards: { 7: ['0.0', '0.0'] },
      totalRevenueUSD: '0.0',
      unpricedRewardTokens: [],
      hasRewards: false,
    });
  });

  it('excludes a token whose decimals read fails instead of zeroing the result, then retries', async () => {
    const fresh = build();
    const reads = mockReads({
      tokens: [USDC, DUST],
      earned: { [USDC]: 2500000n, [DUST]: 10n ** 18n },
      decimals: { [USDC]: new Error('decimals reverted'), [DUST]: 18n },
      pending: { [USDC]: 5000000n },
    });
    const failed = await fresh.getUserVeDustRevenueData(USER);
    expect(failed).toMatchObject({
      veNftIds: [7],
      votingPower: '2.0',
      hasVeNfts: true,
      rewardAmounts: ['2500000', '1000000000000000000'],
      individualNftRewards: { 7: ['0', '1.0'] },
      rewardTokenDecimals: [null, 18],
      totalRevenueUSD: '0.0',
      unpricedRewardTokens: [USDC, DUST],
      pendingRewardsUSD: '0.00',
      hasRewards: true,
    });
    // The failed USDC read is not cached: the pending-rewards read in the same call retries it.
    expect(reads.filter(token => token === USDC)).toHaveLength(2);
    expect(reads.filter(token => token === DUST)).toHaveLength(1);

    mockReads({
      tokens: [USDC, DUST],
      earned: { [USDC]: 2500000n, [DUST]: 10n ** 18n },
      decimals: { [USDC]: 6n, [DUST]: 18n },
      pending: { [USDC]: 5000000n },
    });
    expect(await fresh.getUserVeDustRevenueData(USER)).toMatchObject({
      individualNftRewards: { 7: ['2.5', '1.0'] },
      rewardTokenDecimals: [6, 18],
      totalRevenueUSD: '2.5',
      unpricedRewardTokens: [DUST],
      pendingRewardsUSD: '5.0',
    });
  });

  it('treats decimals above 36 as unknown rather than formatting them', async () => {
    mockReads({
      tokens: [USDC, DUST],
      earned: { [USDC]: 2500000n, [DUST]: 10n ** 18n },
      decimals: { [USDC]: 6n, [DUST]: 77n },
    });
    expect(await build().getUserVeDustRevenueData(USER)).toMatchObject({
      individualNftRewards: { 7: ['2.5', '0'] },
      rewardTokenDecimals: [6, null],
      totalRevenueUSD: '2.5',
      unpricedRewardTokens: [DUST],
    });
  });

  it('reads each token decimals once per helper', async () => {
    const fresh = build();
    const reads = mockReads({
      tokens: [USDC, DUST],
      earned: { [USDC]: 2500000n, [DUST]: 10n ** 18n },
      decimals: { [USDC]: 6n, [DUST]: 18n },
      pending: { [USDC]: 5000000n },
    });
    await fresh.getUserVeDustRevenueData(USER);
    await fresh.getUserVeDustRevenueData(USER);
    expect(await fresh.getPendingRewardsForNextEpoch()).toBe('5.0');
    expect([...reads].sort()).toEqual([USDC, DUST]);
  });

  it('reports a failed decimals read on the default USD token in protocol and user data', async () => {
    mockReads({
      tokens: [USDC, DUST],
      earned: { [USDC]: 2500000n },
      decimals: { [USDC]: new Error('decimals reverted'), [DUST]: 18n },
      pending: { [USDC]: 5000000n },
    });
    expect(await build().getProtocolData()).toMatchObject({
      pendingRewardsUSD: '0.00',
      unpricedRewardTokens: [USDC],
    });
    expect(await build().getUserVeDustRevenueData(USER)).toMatchObject({
      pendingRewardsUSD: '0.00',
      unpricedRewardTokens: [USDC],
    });

    // A healthy read keeps the field empty and the figure unchanged.
    mockReads({
      tokens: [USDC, DUST],
      earned: {},
      decimals: { [USDC]: 6n, [DUST]: 18n },
      pending: { [USDC]: 5000000n },
    });
    expect(await build().getProtocolData()).toMatchObject({
      pendingRewardsUSD: '5.0',
      unpricedRewardTokens: [],
    });
  });

  it('sums the readable USD tokens and names the unreadable one in protocol data', async () => {
    mockReads({
      tokens: [USDC, USDS],
      earned: {},
      decimals: { [USDC]: new Error('decimals reverted'), [USDS]: 18n },
      pending: { [USDC]: 5000000n, [USDS]: 5n * 10n ** 17n },
    });
    expect(await build([USDC, USDS]).getProtocolData()).toMatchObject({
      pendingRewardsUSD: '0.5',
      unpricedRewardTokens: [USDC],
    });
  });

  it('selects no default USD token when the fallback enumeration skipped an index', async () => {
    mockReads({
      tokens: [USDC, DUST],
      earned: { [USDC]: 2500000n, [DUST]: 10n ** 18n },
      decimals: { [USDC]: 6n, [DUST]: 18n },
      pending: { [USDC]: 5000000n, [DUST]: 7n * 10n ** 18n },
      fallbackSkip: [0],
    });
    expect(await build().getProtocolData()).toMatchObject({
      pendingRewardsUSD: '0.00',
      unpricedRewardTokens: [DUST],
    });
    expect(await build().getUserVeDustRevenueData(USER)).toMatchObject({
      rewardTokens: [DUST],
      totalRevenueUSD: '0.0',
      pendingRewardsUSD: '0.00',
      unpricedRewardTokens: [DUST],
    });
  });

  it('keeps the first token as the default when the fallback enumeration is complete', async () => {
    mockReads({
      tokens: [USDC, DUST],
      earned: { [USDC]: 2500000n, [DUST]: 10n ** 18n },
      decimals: { [USDC]: 6n, [DUST]: 18n },
      pending: { [USDC]: 5000000n, [DUST]: 7n * 10n ** 18n },
      fallbackSkip: [],
    });
    expect(await build().getProtocolData()).toMatchObject({
      pendingRewardsUSD: '5.0',
      unpricedRewardTokens: [],
    });
    expect(await build().getUserVeDustRevenueData(USER)).toMatchObject({
      totalRevenueUSD: '2.5',
      pendingRewardsUSD: '5.0',
      unpricedRewardTokens: [DUST],
    });
  });

  it('lets an explicit usdRewardTokens win over a skipped fallback index', async () => {
    mockReads({
      tokens: [USDC, DUST],
      earned: { [DUST]: 10n ** 18n },
      decimals: { [USDC]: 6n, [DUST]: 18n },
      pending: { [DUST]: 7n * 10n ** 18n },
      fallbackSkip: [0],
    });
    expect(await build([DUST]).getProtocolData()).toMatchObject({
      pendingRewardsUSD: '7.0',
      unpricedRewardTokens: [],
    });
    expect(await build([DUST]).getUserVeDustRevenueData(USER)).toMatchObject({
      totalRevenueUSD: '1.0',
      pendingRewardsUSD: '7.0',
      unpricedRewardTokens: [],
    });
  });

  it('rejects an invalid usdRewardTokens entry', () => {
    expect(() => build(['not-an-address'])).toThrow();
  });
});
