import { dustLockAbi, erc20Abi, revenueRewardAbi } from '@neverland-money/contract-types';
import { pow10 } from '@neverland-money/math-utils';
import type { Abi } from 'abitype';
import { ethers } from 'ethers';
import type { BigNumberish } from 'ethers';
import { asAbiContract, decodeAbiResult, type AbiContract } from '../commons/abi-types';
import { AbiBaseService } from '../commons/base-service';
import { toUint256 } from '../commons/uint256';
import type { VeDustRevenueData, VeDustRevenueHelperContext } from './types';

/** RevenueReward `MAX_TOKENIDS`: the most veNFT IDs one batch call accepts. */
const MAX_BATCH_TOKEN_IDS = 64;
/** RevenueReward `MAX_TOKENS`: the most reward tokens one call accepts. */
const MAX_BATCH_REWARD_TOKENS = 32;
/**
 * The widest reward-token decimals this helper formats. Larger values mark the token unresolved:
 * ethers formats at most 80 decimals, and 36 keeps a scaled uint256 sum well inside its range.
 */
const MAX_REWARD_TOKEN_DECIMALS = 36;
/** USDC's decimals, the smallest scale a USD total is formatted at. */
const USD_TOTAL_MIN_DECIMALS = 6;

/** One USD reward token's raw amount in its own decimals. */
type UsdAmount = { amount: bigint; decimals: number };

/**
 * Sum USD reward tokens at $1 per whole token. Each amount is scaled to the widest decimals first,
 * so raw units of different tokens are never added. A single 6-decimal token formats exactly as
 * `formatUnits(amount, 6)`.
 */
function formatUsdTotal(amounts: readonly UsdAmount[]): string {
  const scale = Math.max(USD_TOTAL_MIN_DECIMALS, ...amounts.map(entry => entry.decimals));
  const total = amounts.reduce(
    (sum, entry) => sum + entry.amount * pow10(scale - entry.decimals),
    0n,
  );
  return ethers.formatUnits(total, scale);
}

/**
 * Split per-token reward totals: USD reward tokens with known decimals feed the USD total, and
 * every other token with a nonzero amount is listed as unpriced, in `tokens` order.
 */
function splitUsdRewards(
  tokens: readonly string[],
  amounts: readonly bigint[],
  decimals: ReadonlyArray<number | null>,
  usdTokens: ReadonlySet<string>,
): { usdAmounts: UsdAmount[]; unpriced: string[] } {
  const usdAmounts: UsdAmount[] = [];
  const unpriced: string[] = [];
  for (const [index, token] of tokens.entries()) {
    const amount = amounts[index] ?? 0n;
    const tokenDecimals = decimals[index];
    if (tokenDecimals !== null && usdTokens.has(ethers.getAddress(token))) {
      usdAmounts.push({ amount, decimals: tokenDecimals });
    } else if (amount > 0n) {
      unpriced.push(token);
    }
  }

  return { usdAmounts, unpriced };
}

/** RevenueReward reverts `InvalidArrayLengths` on an empty or oversized array, so reject it here. */
function assertBatchLength(length: number, max: number, name: string): void {
  if (length === 0 || length > max) {
    throw new Error(`${name} must contain between 1 and ${max} entries, got ${length}`);
  }
}

/** Unique checksummed addresses in strictly ascending numeric order, as RevenueReward requires. */
function sortedUniqueAddresses(addresses: readonly string[]): string[] {
  const unique = [...new Set(addresses.map(address => ethers.getAddress(address)))];
  return unique.sort((a, b) => {
    const left = BigInt(a);
    const right = BigInt(b);
    if (left === right) return 0;
    return left < right ? -1 : 1;
  });
}

export class VeDustRevenueHelper extends AbiBaseService<Abi> {
  static formatUSDAmount(amount: string): string {
    const numAmount = parseFloat(amount);
    if (numAmount === 0) return '—';
    if (numAmount < 0.01) return '< $0.01';
    return `$${numAmount.toFixed(2)}`;
  }

  private readonly revenueContract: ethers.Contract;
  private readonly dustLockContract: AbiContract<
    typeof dustLockAbi,
    'balanceOf' | 'balanceOfNFT' | 'locked' | 'ownerToNFTokenIdList' | 'totalSupply'
  >;

  private readonly revenueIfaceManual: ethers.Interface;
  private readonly erc20Service: AbiBaseService<typeof erc20Abi>;
  /** Checksummed `usdRewardTokens`; undefined selects the first registered reward token. */
  private readonly usdRewardTokens: ReadonlySet<string> | undefined;
  /** Successful `decimals()` reads by checksummed token; a failed read is dropped and retried. */
  private readonly rewardTokenDecimalsCache = new Map<string, Promise<number>>();
  /**
   * Throws when `revenueAddress` or a `usdRewardTokens` entry is not a valid address; transactions
   * target the checksummed `revenueAddress`.
   */
  constructor(context: VeDustRevenueHelperContext) {
    super(context.provider, revenueRewardAbi, ethers.getAddress(context.revenueAddress));
    this.usdRewardTokens =
      context.usdRewardTokens === undefined
        ? undefined
        : new Set(context.usdRewardTokens.map(token => ethers.getAddress(token)));
    this.erc20Service = new AbiBaseService(this.provider, erc20Abi);
    const svcLock = new AbiBaseService(this.provider, dustLockAbi, context.dustLockAddress);
    this.revenueContract = this.getContractInstance(this.defaultAddress!);
    this.dustLockContract = asAbiContract<
      typeof dustLockAbi,
      'balanceOf' | 'balanceOfNFT' | 'locked' | 'ownerToNFTokenIdList' | 'totalSupply'
    >(svcLock.getContractInstance(context.dustLockAddress), dustLockAbi);
    this.revenueIfaceManual = new ethers.Interface([
      'function rewardTokens(uint256 index) view returns (address)',
      'function rewardTokensLength() view returns (uint256)',
      'function getRewardTokens() view returns (address[] tokens)',
      'function tokenRewardsPerEpoch(address token, uint256 epoch) view returns (uint256)',
      'function earnedRewardsAll(address[] tokens, uint256[] tokenIds) view returns (uint256[][] matrix, uint256[] totals)',
      'function earnedRewards(address token, uint256 tokenId, uint256 endTs) view returns (uint256 amount)',
      'function getReward(uint256 tokenId, address[] tokens)',
      'function getRewardBatch(uint256[] tokenIds, address[] tokens)',
    ]);
  }

  async getNextEpochTimestamp(currentTimestamp?: number): Promise<number> {
    const WEEK = 7 * 24 * 60 * 60;
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Zero and NaN deliberately retain the historical provider/clock timestamp fallback.
    const timestamp = currentTimestamp || (await this.getCurrentBlockTimestamp());
    return timestamp - (timestamp % WEEK) + WEEK;
  }

  async getTotalVeDustSupply(): Promise<string> {
    try {
      const totalSupply = await this.dustLockContract.totalSupply();
      return ethers.formatEther(totalSupply);
    } catch {
      return '0.0';
    }
  }

  async getRewardTokens(): Promise<string[]> {
    return (await this.enumerateRewardTokens()).tokens;
  }

  /**
   * The next epoch's notified rewards across the USD reward tokens, at $1 per whole token in each
   * token's own decimals. Without `usdRewardTokens` only the first registered reward token counts,
   * USDC on Monad, unless the token list is incomplete (see `getProtocolData`). Returns '0.00' when
   * no USD reward token is priced or a read fails. A USD reward token whose `decimals()` is
   * unreadable is left out of the total; `getProtocolData` names it.
   */
  async getPendingRewardsForNextEpoch(): Promise<string> {
    return (await this.resolvePendingRewards()).pendingRewardsUSD;
  }

  /**
   * `unpricedRewardTokens` lists the USD reward tokens the total leaves out because their
   * `decimals()` is unreadable, in registration order. When `usdRewardTokens` is omitted and the
   * reward-token list is incomplete, no default USD token is selected and every enumerated token is
   * listed. It is empty when every `decimals()` read succeeds. A failed pending read yields '0.00'
   * and an empty list.
   */
  async getProtocolData(): Promise<{
    pendingRewardsUSD: string;
    nextEpochTimestamp: number;
    totalVeDustSupply: string;
    unpricedRewardTokens?: string[];
  }> {
    const { pendingRewardsUSD, unpricedRewardTokens } = await this.resolvePendingRewards();
    const [nextEpochTimestamp, totalVeDustSupply] = await Promise.all([
      this.getNextEpochTimestamp(),
      this.getTotalVeDustSupply(),
    ]);
    return { pendingRewardsUSD, nextEpochTimestamp, totalVeDustSupply, unpricedRewardTokens };
  }

  // eslint-disable-next-line complexity -- Preserve the explicit source-derived financial branches, rounding, fallback values and evaluation order.
  async getUserVeDustRevenueData(userAddress: string): Promise<VeDustRevenueData> {
    try {
      const veNftCount = await this.dustLockContract.balanceOf(userAddress);
      const veNftIds: number[] = [];
      if (veNftCount === 0n) {
        const emptyPending = await this.resolvePendingRewards();
        const pendingRewards = emptyPending.pendingRewardsUSD;
        const nextEpoch = await this.getNextEpochTimestamp();
        return {
          totalRevenueUSD: '0.00',
          rewardTokens: [],
          rewardAmounts: [],
          selfRepayEnabled: false,
          selfRepayTokenIds: [],
          votingPower: '0.0',
          lockedAmount: '0.0',
          veNftCount: 0,
          veNftIds: [],
          individualNftRewards: {},
          individualNftVotingPower: {},
          individualNftLockedAmounts: {},
          individualNftEndTimes: {},
          pendingRewardsUSD: pendingRewards,
          nextEpochTimestamp: nextEpoch,
          totalVeDustSupply: await this.getTotalVeDustSupply(),
          selfRepayVotingPower: '0.0',
          userRevenueShare: '0.0',
          weeklyRevenueUSD: '0.00',
          formattedRevenueUSD: '0.00',
          hasRewards: false,
          hasVeNfts: false,
          rewardTokenDecimals: [],
          unpricedRewardTokens: emptyPending.unpricedRewardTokens,
        };
      }

      for (let i = 0; i < ethers.getNumber(veNftCount); i++) {
        try {
          // eslint-disable-next-line no-await-in-loop -- Preserve sequential enumeration/cursor reads, per-item fallback handling and the original request order.
          const tokenId = await this.dustLockContract.ownerToNFTokenIdList(userAddress, i);
          const n = Number(tokenId);
          if (n > 0) veNftIds.push(n);
        } catch {
          // Preserve the existing fallback when an individual read fails.
        }
      }

      let totalVotingPower = 0n;
      let totalLockedAmount = 0n;
      const selfRepayVotingPower = 0n;
      const individualNftVotingPower: Record<number, string> = {};
      const individualNftLockedAmounts: Record<number, string> = {};
      const individualNftEndTimes: Record<number, number> = {};
      for (const tokenId of veNftIds) {
        try {
          // eslint-disable-next-line no-await-in-loop -- Preserve sequential enumeration/cursor reads, per-item fallback handling and the original request order.
          const votingPower = await this.dustLockContract.balanceOfNFT(tokenId);
          // eslint-disable-next-line no-await-in-loop -- Preserve sequential enumeration/cursor reads, per-item fallback handling and the original request order.
          const lockedBalance = await this.dustLockContract.locked(tokenId);
          totalVotingPower += ethers.getBigInt(votingPower);
          individualNftVotingPower[tokenId] = ethers.formatEther(votingPower);
          // eslint-disable-next-line @typescript-eslint/prefer-optional-chain -- Preserve the original truthiness guard and property access order on ABI-derived lock values.
          if (lockedBalance && lockedBalance.amount) {
            const { amount } = lockedBalance;
            const endTime = lockedBalance.end;
            totalLockedAmount += ethers.getBigInt(amount);
            individualNftLockedAmounts[tokenId] = ethers.formatEther(amount);
            individualNftEndTimes[tokenId] = ethers.getNumber(endTime);
          } else {
            individualNftLockedAmounts[tokenId] = '0';
            individualNftEndTimes[tokenId] = 0;
          }
        } catch {
          individualNftVotingPower[tokenId] = '0';
          individualNftLockedAmounts[tokenId] = '0';
          individualNftEndTimes[tokenId] = 0;
        }
      }

      // Fetch reward tokens
      const enumeration = await this.enumerateRewardTokens();
      const rewardTokens: string[] = enumeration.tokens;
      let rewardAmounts: bigint[] = [];
      const individualNftRewards: Record<number, string[]> = {};
      let totalRevenueUSD = '0.00';
      let rewardTokenDecimals: Array<number | null> = [];
      let unpricedRewardTokens: string[] = [];
      if (veNftIds.length > 0 && rewardTokens.length > 0) {
        const validTokens = rewardTokens.filter(t => t && t !== ethers.ZeroAddress);
        const validIds = veNftIds.filter(id => id > 0);
        const rewardAmountsByToken: bigint[] = [];
        // Never throws: a failed read yields null and excludes that token, not the whole result.
        rewardTokenDecimals = await this.readRewardTokenDecimals(validTokens);
        // Unknown decimals format as '0', as a failed earned read does; rewardAmounts stays raw.
        const formatReward = (amount: bigint, index: number): string => {
          const decimals = rewardTokenDecimals[index];
          return decimals === null ? '0' : ethers.formatUnits(amount, decimals);
        };

        // earnedRewardsAll reverts unless tokens are strictly ascending, while getRewardTokens()
        // returns registration order; query sorted and read each column back in caller order.
        const queryTokens = sortedUniqueAddresses(validTokens);
        const columnOf = validTokens.map(token => queryTokens.indexOf(ethers.getAddress(token)));
        for (const tokenId of validIds) {
          try {
            const callData = this.revenueIfaceManual.encodeFunctionData('earnedRewardsAll', [
              queryTokens,
              [tokenId],
            ]);
            // eslint-disable-next-line no-await-in-loop -- Preserve sequential enumeration/cursor reads, per-item fallback handling and the original request order.
            const callRaw = await this.provider.call({
              to: this.revenueContract.target,
              data: callData,
            });
            const result = decodeAbiResult(
              this.revenueIfaceManual,
              revenueRewardAbi,
              'earnedRewardsAll',
              callRaw,
            );
            const matrix = result?.[0];
            const sortedRow: bigint[] = matrix?.[0] ?? [];
            const tokenRow: bigint[] =
              sortedRow.length > 0 ? columnOf.map(column => sortedRow[column] ?? 0n) : [];
            // eslint-disable-next-line max-depth -- Keep the existing nested per-market/per-item fallback and comparison order intact.
            if (tokenRow.length > 0) {
              individualNftRewards[tokenId] = tokenRow.map(formatReward);
              tokenRow.forEach((r, idx) => {
                // eslint-disable-next-line logical-assignment-operators -- Retain the existing lookup/default write order and financial accumulator behavior.
                if (!rewardAmountsByToken[idx]) rewardAmountsByToken[idx] = 0n;
                rewardAmountsByToken[idx] += ethers.getBigInt(r);
              });
            } else {
              individualNftRewards[tokenId] = validTokens.map(() => '0');
            }
          } catch {
            individualNftRewards[tokenId] = validTokens.map(() => '0');
          }
        }

        rewardAmounts = rewardAmountsByToken;
        if (rewardAmounts.length > 0) {
          const split = splitUsdRewards(
            validTokens,
            rewardAmounts,
            rewardTokenDecimals,
            new Set(this.selectUsdRewardTokens(validTokens, enumeration.complete)),
          );
          totalRevenueUSD = formatUsdTotal(split.usdAmounts);
          unpricedRewardTokens = split.unpriced;
        }
      }

      const pending = await this.resolvePendingRewards();
      const pendingRewards = pending.pendingRewardsUSD;
      // Pending exclusions also reach this result, in rewardTokens order, without duplicates.
      const unpricedSet = new Set(
        [...unpricedRewardTokens, ...pending.unpricedRewardTokens].map(token =>
          ethers.getAddress(token),
        ),
      );
      unpricedRewardTokens = [
        ...new Set(rewardTokens.filter(token => unpricedSet.has(ethers.getAddress(token)))),
      ];
      const nextEpoch = await this.getNextEpochTimestamp();
      const totalVeDustSupply = await this.getTotalVeDustSupply();
      const totalSupplyBN = ethers.parseEther(totalVeDustSupply);
      let userRevenueShare = '0.0';
      let weeklyRevenueUSD = '0.00';
      if (totalSupplyBN > 0n && selfRepayVotingPower > 0n) {
        const sharePercentage = (selfRepayVotingPower * 10000n) / ethers.getBigInt(totalSupplyBN);
        userRevenueShare = ethers.formatUnits(sharePercentage, 2);
        // A pending total over 18-decimal USD tokens can carry more than 6 fraction digits.
        const pendingDecimals = Math.max(
          USD_TOTAL_MIN_DECIMALS,
          pendingRewards.split('.')[1]?.length ?? 0,
        );
        const pendingRewardsBN = ethers.parseUnits(pendingRewards, pendingDecimals);
        const userWeeklyRevenue =
          (pendingRewardsBN * ethers.getBigInt(selfRepayVotingPower)) /
          ethers.getBigInt(totalSupplyBN);
        weeklyRevenueUSD = ethers.formatUnits(userWeeklyRevenue, pendingDecimals);
      }

      return {
        totalRevenueUSD,
        rewardTokens: rewardTokens || [],
        rewardAmounts: rewardAmounts?.map(a => a.toString()) || [],
        selfRepayEnabled: false,
        selfRepayTokenIds: [],
        votingPower: ethers.formatEther(totalVotingPower),
        lockedAmount: ethers.formatEther(totalLockedAmount),
        veNftCount: veNftIds.length,
        veNftIds,
        individualNftRewards,
        individualNftVotingPower,
        individualNftLockedAmounts,
        individualNftEndTimes,
        pendingRewardsUSD: pendingRewards,
        nextEpochTimestamp: nextEpoch,
        totalVeDustSupply,
        selfRepayVotingPower: ethers.formatEther(selfRepayVotingPower),
        userRevenueShare,
        weeklyRevenueUSD,
        formattedRevenueUSD: totalRevenueUSD,
        // Raw amounts of any token, so rewards left out of the USD total still count.
        hasRewards: rewardAmounts.some(amount => amount > 0n),
        hasVeNfts: veNftIds.length > 0,
        rewardTokenDecimals,
        unpricedRewardTokens,
      };
    } catch {
      return {
        totalRevenueUSD: '0.00',
        rewardTokens: [],
        rewardAmounts: [],
        selfRepayEnabled: false,
        selfRepayTokenIds: [],
        votingPower: '0.0',
        lockedAmount: '0.0',
        veNftCount: 0,
        veNftIds: [],
        individualNftRewards: {},
        individualNftVotingPower: {},
        individualNftLockedAmounts: {},
        individualNftEndTimes: {},
        pendingRewardsUSD: '0.00',
        nextEpochTimestamp: await this.getNextEpochTimestamp(),
        totalVeDustSupply: await this.getTotalVeDustSupply(),
        selfRepayVotingPower: '0.0',
        userRevenueShare: '0.0',
        weeklyRevenueUSD: '0.00',
        formattedRevenueUSD: '0.00',
        hasRewards: false,
        hasVeNfts: false,
        rewardTokenDecimals: [],
        unpricedRewardTokens: [],
      };
    }
  }

  /** `tokenIds` must hold 1 to 64 IDs (RevenueReward `MAX_TOKENIDS`); chunk larger sets. */
  getEnableSelfRepayLoanBatchTxData(tokenIds: readonly BigNumberish[]): {
    to: string;
    data: string;
  } {
    assertBatchLength(tokenIds.length, MAX_BATCH_TOKEN_IDS, 'tokenIds');
    return this.encodeRevenueFunction('enableSelfRepayLoanBatch(uint256[] tokenIds)', [
      tokenIds.map(id => toUint256(id, 'tokenId')),
    ]);
  }

  /** `tokenIds` must hold 1 to 64 IDs (RevenueReward `MAX_TOKENIDS`); chunk larger sets. */
  getDisableSelfRepayLoanBatchTxData(tokenIds: readonly BigNumberish[]): {
    to: string;
    data: string;
  } {
    assertBatchLength(tokenIds.length, MAX_BATCH_TOKEN_IDS, 'tokenIds');
    return this.encodeRevenueFunction('disableSelfRepayLoanBatch(uint256[] tokenIds)', [
      tokenIds.map(id => toUint256(id, 'tokenId')),
    ]);
  }

  /**
   * `tokenIds` must hold 1 to 64 IDs and `rewardTokens` 1 to 32 tokens (RevenueReward
   * `MAX_TOKENIDS` and `MAX_TOKENS`); chunk larger sets. Claims accept tokens in any order.
   */
  getBatchClaimRewardsTxData(
    tokenIds: readonly BigNumberish[],
    rewardTokens: readonly string[],
  ): {
    to: string;
    data: string;
  } {
    assertBatchLength(tokenIds.length, MAX_BATCH_TOKEN_IDS, 'tokenIds');
    assertBatchLength(rewardTokens.length, MAX_BATCH_REWARD_TOKENS, 'rewardTokens');
    return this.encodeRevenueFunction('getRewardBatch(uint256[] tokenIds,address[] tokens)', [
      tokenIds.map(id => toUint256(id, 'tokenId')),
      rewardTokens.map(address => ethers.getAddress(address)),
    ]);
  }

  /**
   * The registered reward tokens, and whether the list is complete. `complete` is false when the
   * index-enumeration fallback skipped an index after a failed `rewardTokens(i)` read, which shifts
   * every later position.
   */
  private async enumerateRewardTokens(): Promise<{ tokens: string[]; complete: boolean }> {
    try {
      const data = this.revenueIfaceManual.encodeFunctionData('getRewardTokens', []);
      const raw = await this.provider.call({ to: this.revenueContract.target, data });
      const decoded = decodeAbiResult(
        this.revenueIfaceManual,
        revenueRewardAbi,
        'getRewardTokens',
        raw,
      );
      const tokens = decoded?.[0] || [];
      return { tokens: tokens.filter(t => t && t !== ethers.ZeroAddress), complete: true };
    } catch {
      try {
        const lenData = this.revenueIfaceManual.encodeFunctionData('rewardTokensLength', []);
        const lenRaw = await this.provider.call({
          to: this.revenueContract.target,
          data: lenData,
        });
        const lenDec = decodeAbiResult(
          this.revenueIfaceManual,
          revenueRewardAbi,
          'rewardTokensLength',
          lenRaw,
        );
        const lenBn = lenDec?.[0];
        const len = ethers.getNumber(lenBn ?? 0);
        const tokens: string[] = [];
        let complete = true;
        for (let i = 0; i < len; i++) {
          try {
            const tData = this.revenueIfaceManual.encodeFunctionData('rewardTokens', [i]);
            // eslint-disable-next-line no-await-in-loop -- Preserve sequential enumeration/cursor reads, per-item fallback handling and the original request order.
            const tRaw = await this.provider.call({
              to: this.revenueContract.target,
              data: tData,
            });
            const tDec = decodeAbiResult(
              this.revenueIfaceManual,
              revenueRewardAbi,
              'rewardTokens',
              tRaw,
            );
            const addr = tDec?.[0];
            // eslint-disable-next-line max-depth -- Keep the existing nested per-market/per-item fallback and comparison order intact.
            if (addr && addr !== ethers.ZeroAddress) tokens.push(addr);
          } catch {
            // Preserve the existing fallback when an individual read fails, and record the gap.
            complete = false;
          }
        }

        return { tokens, complete };
      } catch {
        return { tokens: [], complete: true };
      }
    }
  }

  private async resolvePendingRewards(): Promise<{
    pendingRewardsUSD: string;
    unpricedRewardTokens: string[];
  }> {
    try {
      const { tokens, complete } = await this.enumerateRewardTokens();
      const usdTokens = this.selectUsdRewardTokens(tokens, complete);
      if (usdTokens.length === 0) {
        return {
          pendingRewardsUSD: '0.00',
          unpricedRewardTokens: this.usdRewardTokens === undefined && !complete ? tokens : [],
        };
      }

      const nextEpoch = await this.getNextEpochTimestamp();
      const [pending, decimals] = await Promise.all([
        Promise.all(usdTokens.map(async token => this.readTokenRewardsPerEpoch(token, nextEpoch))),
        this.readRewardTokenDecimals(usdTokens),
      ]);
      const amounts: UsdAmount[] = [];
      const unpricedRewardTokens: string[] = [];
      for (const [index, amount] of pending.entries()) {
        const tokenDecimals = decimals[index];
        if (tokenDecimals === null || tokenDecimals === undefined) {
          unpricedRewardTokens.push(usdTokens[index]);
        } else {
          amounts.push({ amount, decimals: tokenDecimals });
        }
      }

      return {
        pendingRewardsUSD: amounts.length === 0 ? '0.00' : formatUsdTotal(amounts),
        unpricedRewardTokens,
      };
    } catch {
      return { pendingRewardsUSD: '0.00', unpricedRewardTokens: [] };
    }
  }

  private async getCurrentBlockTimestamp(): Promise<number> {
    try {
      const latestBlock = await this.provider.getBlock('latest');
      if (!latestBlock) throw new Error('Latest block is unavailable');
      return latestBlock.timestamp;
    } catch {
      return Math.floor(Date.now() / 1000);
    }
  }

  /**
   * The USD reward tokens among `tokens`, in `tokens` order: the configured `usdRewardTokens`, or
   * by default the first registered reward token. RevenueReward appends tokens on first notify and
   * never removes them, so index 0 stays the first token ever notified (USDC on Monad). When
   * `complete` is false a skipped index may have shifted the list, so no default is selected.
   */
  private selectUsdRewardTokens(tokens: readonly string[], complete: boolean): string[] {
    const configured = this.usdRewardTokens;
    if (configured === undefined) return complete ? tokens.slice(0, 1) : [];
    return tokens.filter(token => configured.has(ethers.getAddress(token)));
  }

  /**
   * Each token's ERC20 `decimals()`, in `tokens` order, read once per helper and token. `null`
   * marks a failed read or a value above `MAX_REWARD_TOKEN_DECIMALS`. It never throws, and a
   * failure is not cached, so the next call retries.
   */
  private async readRewardTokenDecimals(tokens: readonly string[]): Promise<Array<number | null>> {
    return Promise.all(
      tokens.map(async token => {
        const address = ethers.getAddress(token);
        let read = this.rewardTokenDecimalsCache.get(address);
        if (!read) {
          read = this.erc20Service.readContract(address, 'decimals', []).then(value => {
            if (
              typeof value !== 'bigint' ||
              value < 0n ||
              value > BigInt(MAX_REWARD_TOKEN_DECIMALS)
            ) {
              throw new RangeError(`Unsupported reward token decimals for ${address}`);
            }

            return Number(value);
          });
          this.rewardTokenDecimalsCache.set(address, read);
        }

        try {
          return await read;
        } catch {
          if (this.rewardTokenDecimalsCache.get(address) === read) {
            this.rewardTokenDecimalsCache.delete(address);
          }

          return null;
        }
      }),
    );
  }

  private async readTokenRewardsPerEpoch(token: string, epoch: number): Promise<bigint> {
    const callData = this.revenueIfaceManual.encodeFunctionData('tokenRewardsPerEpoch', [
      token,
      epoch,
    ]);
    const callRaw = await this.provider.call({ to: this.revenueContract.target, data: callData });
    const decoded = decodeAbiResult(
      this.revenueIfaceManual,
      revenueRewardAbi,
      'tokenRewardsPerEpoch',
      callRaw,
    );
    return ethers.getBigInt(decoded[0]);
  }

  private encodeRevenueFunction(
    signature: string,
    params: unknown[],
  ): {
    to: string;
    data: string;
  } {
    const fragment = `function ${signature}`;
    const manual = new ethers.Interface([fragment]);
    const name = signature.slice(0, signature.indexOf('('));
    return { to: this.defaultAddress!, data: manual.encodeFunctionData(name, params) };
  }
}
