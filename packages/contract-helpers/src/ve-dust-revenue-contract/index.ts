import { dustLockAbi, revenueRewardAbi } from '@neverland-money/contract-types';
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
  /** Throws when `revenueAddress` is not a valid address; transactions target its checksummed form. */
  constructor(context: VeDustRevenueHelperContext) {
    super(context.provider, revenueRewardAbi, ethers.getAddress(context.revenueAddress));
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
      return tokens.filter(t => t && t !== ethers.ZeroAddress);
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
            // Preserve the existing fallback when an individual read fails.
          }
        }

        return tokens;
      } catch {
        return [];
      }
    }
  }

  async getPendingRewardsForNextEpoch(): Promise<string> {
    try {
      const tokens: string[] = await this.getRewardTokens();
      const usdcAddress = tokens?.[0];
      if (!usdcAddress || usdcAddress === ethers.ZeroAddress) {
        return '0.00';
      }

      const nextEpoch = await this.getNextEpochTimestamp();
      const callData = this.revenueIfaceManual.encodeFunctionData('tokenRewardsPerEpoch', [
        usdcAddress,
        nextEpoch,
      ]);
      const callRaw = await this.provider.call({ to: this.revenueContract.target, data: callData });
      const decoded = decodeAbiResult(
        this.revenueIfaceManual,
        revenueRewardAbi,
        'tokenRewardsPerEpoch',
        callRaw,
      );
      const totalPendingRewards = decoded?.[0];
      return ethers.formatUnits(totalPendingRewards, 6);
    } catch {
      return '0.00';
    }
  }

  async getProtocolData(): Promise<{
    pendingRewardsUSD: string;
    nextEpochTimestamp: number;
    totalVeDustSupply: string;
  }> {
    const pendingRewardsUSD = await this.getPendingRewardsForNextEpoch();
    const [nextEpochTimestamp, totalVeDustSupply] = await Promise.all([
      this.getNextEpochTimestamp(),
      this.getTotalVeDustSupply(),
    ]);
    return { pendingRewardsUSD, nextEpochTimestamp, totalVeDustSupply };
  }

  // eslint-disable-next-line complexity -- Preserve the explicit source-derived financial branches, rounding, fallback values and evaluation order.
  async getUserVeDustRevenueData(userAddress: string): Promise<VeDustRevenueData> {
    try {
      const veNftCount = await this.dustLockContract.balanceOf(userAddress);
      const veNftIds: number[] = [];
      if (veNftCount === 0n) {
        const pendingRewards = await this.getPendingRewardsForNextEpoch();
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
      const rewardTokens: string[] = await this.getRewardTokens();
      let rewardAmounts: bigint[] = [];
      const individualNftRewards: Record<number, string[]> = {};
      let totalRevenueUSD = '0.00';
      if (veNftIds.length > 0 && rewardTokens.length > 0) {
        const validTokens = rewardTokens.filter(t => t && t !== ethers.ZeroAddress);
        const validIds = veNftIds.filter(id => id > 0);
        const rewardAmountsByToken: bigint[] = [];
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
              individualNftRewards[tokenId] = tokenRow.map(r => ethers.formatUnits(r, 6));
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
          const totalRewards = rewardAmounts.reduce((sum, a) => sum + ethers.getBigInt(a), 0n);
          totalRevenueUSD = ethers.formatUnits(totalRewards, 6);
        }
      }

      const pendingRewards = await this.getPendingRewardsForNextEpoch();
      const nextEpoch = await this.getNextEpochTimestamp();
      const totalVeDustSupply = await this.getTotalVeDustSupply();
      const totalSupplyBN = ethers.parseEther(totalVeDustSupply);
      let userRevenueShare = '0.0';
      let weeklyRevenueUSD = '0.00';
      if (totalSupplyBN > 0n && selfRepayVotingPower > 0n) {
        const sharePercentage = (selfRepayVotingPower * 10000n) / ethers.getBigInt(totalSupplyBN);
        userRevenueShare = ethers.formatUnits(sharePercentage, 2);
        const pendingRewardsBN = ethers.parseUnits(pendingRewards, 6);
        const userWeeklyRevenue =
          (pendingRewardsBN * ethers.getBigInt(selfRepayVotingPower)) /
          ethers.getBigInt(totalSupplyBN);
        weeklyRevenueUSD = ethers.formatUnits(userWeeklyRevenue, 6);
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
        hasRewards: parseFloat(totalRevenueUSD) > 0,
        hasVeNfts: veNftIds.length > 0,
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

  private async getCurrentBlockTimestamp(): Promise<number> {
    try {
      const latestBlock = await this.provider.getBlock('latest');
      if (!latestBlock) throw new Error('Latest block is unavailable');
      return latestBlock.timestamp;
    } catch {
      return Math.floor(Date.now() / 1000);
    }
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
