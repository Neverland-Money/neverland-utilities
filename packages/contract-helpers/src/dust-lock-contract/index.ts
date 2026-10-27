import { dustLockAbi, erc20Abi, multicall3Abi } from '@neverland-money/contract-types';
import { estimateVeDustPower } from '@neverland-money/math-utils';
import type { Abi } from 'abitype';
import { ethers, isAddress } from 'ethers';
import type { BigNumberish } from 'ethers';
import { asAbiContract, decodeAbiResult, type AbiContract } from '../commons/abi-types';
import { AbiBaseService } from '../commons/base-service';
import { toUint256 } from '../commons/uint256';
import { DustLockTransactionBuilder } from './transaction-builder';
import type {
  CreateLockForParams,
  CreateLockParams,
  CreateLockPermanentParams,
  IncreaseAmountParams,
  LockInfo,
  MergeParams,
  TransferParams,
  UserLock,
  VeDustCalculationParams,
} from './types';
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface DustLockHelperContext {
  lockAddress: string;
  dustTokenAddress: string;
  provider: ethers.Provider;
  chainId?: number;
}
const SECONDS_PER_DAY = 86400;

/** Resolve an explicit Unix-seconds clock, or sample the local clock once when it is omitted. */
function resolveCurrentTimestamp(currentTimestamp: number | undefined): number {
  if (currentTimestamp === undefined) return Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(currentTimestamp) || currentTimestamp < 0) {
    throw new Error('currentTimestamp must be a nonnegative safe integer of Unix seconds');
  }

  return currentTimestamp;
}

/** Whole days left and expiry for a lock end, measured against `now`; permanent locks never expire. */
function lockTiming(
  end: number,
  isPermanent: boolean,
  now: number,
): { daysRemaining: number; isExpired: boolean } {
  if (isPermanent || end <= 0) return { daysRemaining: 0, isExpired: false };
  const secondsRemaining = end - now;
  return {
    daysRemaining: Math.max(0, Math.floor(secondsRemaining / SECONDS_PER_DAY)),
    isExpired: secondsRemaining <= 0,
  };
}

export class DustLockHelper extends AbiBaseService<Abi> {
  // ---------- Utilities ----------
  static calculateVeDustPower(params: VeDustCalculationParams): number {
    const { dustAmount, endTimestamp, isPermanent, currentTimestamp } = params;
    return estimateVeDustPower({
      dustAmount,
      endTimestamp,
      isPermanent,
      currentTimestamp: currentTimestamp ?? (isPermanent ? 0 : Math.floor(Date.now() / 1000)),
    });
  }

  static calculateMergedVeDustPower(
    totalDustAmount: number,
    toPositionEndTimestamp: number,
    toPositionIsPermanent: boolean,
    currentTimestamp?: number,
  ): number {
    return DustLockHelper.calculateVeDustPower({
      dustAmount: totalDustAmount,
      endTimestamp: toPositionEndTimestamp,
      isPermanent: toPositionIsPermanent,
      currentTimestamp,
    });
  }

  // eslint-disable-next-line max-params -- Preserve positional compatibility while allowing an explicit clock.
  static calculateVeDustIncrease(
    additionalDustAmount: number,
    currentVeDustPower: number,
    lockEndTimestamp: number,
    isPermanent: boolean,
    currentTimestamp?: number,
  ): number {
    const inc = DustLockHelper.calculateVeDustPower({
      dustAmount: additionalDustAmount,
      endTimestamp: lockEndTimestamp,
      isPermanent,
      currentTimestamp,
    });
    return currentVeDustPower + inc;
  }

  private readonly transactionBuilder: DustLockTransactionBuilder;
  private readonly lockAddress: string;
  private readonly dustTokenAddress: string;
  private readonly lockInterface = new ethers.Interface(dustLockAbi);
  private readonly erc20Interface = new ethers.Interface(erc20Abi);
  private readonly lockContract: AbiContract<
    typeof dustLockAbi,
    | 'balanceOf'
    | 'balanceOfNFT'
    | 'locked'
    | 'minLockAmount'
    | 'ownerToNFTokenIdList'
    | 'totalSupply'
    | 'earlyWithdrawPenaltyAmount'
  >;

  private readonly erc20Contract: AbiContract<typeof erc20Abi, 'balanceOf' | 'allowance'>;
  constructor(context: DustLockHelperContext) {
    super(context.provider, dustLockAbi, context.lockAddress);
    if (!isAddress(context.lockAddress)) throw new Error('lockAddress is not valid');
    if (!isAddress(context.dustTokenAddress)) throw new Error('dustTokenAddress is not valid');
    this.transactionBuilder = new DustLockTransactionBuilder(context);
    this.lockAddress = context.lockAddress;
    this.dustTokenAddress = context.dustTokenAddress;
    const svcErc20 = new AbiBaseService(this.provider, erc20Abi, context.dustTokenAddress);
    this.lockContract = asAbiContract<
      typeof dustLockAbi,
      | 'balanceOf'
      | 'balanceOfNFT'
      | 'locked'
      | 'minLockAmount'
      | 'ownerToNFTokenIdList'
      | 'totalSupply'
      | 'earlyWithdrawPenaltyAmount'
    >(this.getContractInstance(this.lockAddress), dustLockAbi);
    this.erc20Contract = asAbiContract<typeof erc20Abi, 'balanceOf' | 'allowance'>(
      svcErc20.getContractInstance(this.dustTokenAddress),
      erc20Abi,
    );
  }

  getCreateLockTxData(params: CreateLockParams): { to: string; data: string } {
    return this.transactionBuilder.getCreateLockTxData(params);
  }

  getCreateLockPermanentTxData(params: CreateLockPermanentParams): { to: string; data: string } {
    return this.transactionBuilder.getCreateLockPermanentTxData(params);
  }

  getCreateLockForTxData(params: CreateLockForParams): { to: string; data: string } {
    return this.transactionBuilder.getCreateLockForTxData(params);
  }

  getIncreaseAmountTxData(params: IncreaseAmountParams): { to: string; data: string } {
    return this.transactionBuilder.getIncreaseAmountTxData(params);
  }

  getIncreaseUnlockTimeTxData(
    tokenId: BigNumberish,
    lockDurationSeconds: number,
  ): { to: string; data: string } {
    return this.transactionBuilder.getIncreaseUnlockTimeTxData(tokenId, lockDurationSeconds);
  }

  getLockPermanentTxData(tokenId: BigNumberish): { to: string; data: string } {
    return this.transactionBuilder.getLockPermanentTxData(tokenId);
  }

  getUnlockPermanentTxData(tokenId: BigNumberish): { to: string; data: string } {
    return this.transactionBuilder.getUnlockPermanentTxData(tokenId);
  }

  /** Set a raw DUST penalty cap to select earlyWithdraw(uint256,uint256). */
  getEarlyWithdrawTxData(
    tokenId: BigNumberish,
    maxPenalty?: BigNumberish,
  ): { to: string; data: string } {
    return this.transactionBuilder.getEarlyWithdrawTxData(tokenId, maxPenalty);
  }

  getWithdrawTxData(tokenId: BigNumberish): { to: string; data: string } {
    return this.transactionBuilder.getWithdrawTxData(tokenId);
  }

  getMergeTxData(params: MergeParams): { to: string; data: string } {
    return this.transactionBuilder.getMergeTxData(params);
  }

  getTransferTxData(params: TransferParams): { to: string; data: string } {
    return this.transactionBuilder.getTransferTxData(params);
  }

  getApprovalTxData(fromAddress: string, amount: string): { to: string; data: string } {
    return this.transactionBuilder.getApprovalTxData(fromAddress, amount);
  }

  // ---------- Reads ----------
  async getLockInfo(tokenId: BigNumberish): Promise<LockInfo> {
    const id = toUint256(tokenId, 'tokenId');
    const [locked, veDust] = await Promise.all([
      this.lockContract.locked(id),
      this.lockContract.balanceOfNFT(id),
    ]);
    const end = ethers.getNumber(locked.end);
    const isPermanent = locked.isPermanent && end === 0;
    return {
      amount: locked.amount.toString(),
      veDustAmount: veDust.toString(),
      end,
      effectiveStart: ethers.getNumber(locked.effectiveStart),
      isPermanent,
    };
  }

  async getTotalVotingPower(): Promise<bigint> {
    return this.lockContract.totalSupply();
  }

  async readEarlyWithdrawPenaltyAmount(tokenId: BigNumberish): Promise<bigint> {
    return this.lockContract.earlyWithdrawPenaltyAmount(toUint256(tokenId, 'tokenId'));
  }

  /**
   * Read every lock the owner holds, one RPC call at a time, skipping locks whose reads fail.
   * `daysRemaining` and `isExpired` are measured against `currentTimestamp` (Unix seconds), which
   * defaults to the local clock; pass the chain's block timestamp on forks or when they differ.
   */
  async getUserLocks(owner: string, currentTimestamp?: number): Promise<UserLock[]> {
    const now = resolveCurrentTimestamp(currentTimestamp);
    const tokenIds = await this.getOwnerTokenIds(owner);
    const userLocks: UserLock[] = [];
    for (const tokenId of tokenIds) {
      try {
        // eslint-disable-next-line no-await-in-loop -- Preserve sequential enumeration/cursor reads, per-item fallback handling and the original request order.
        const info = await this.getLockInfo(tokenId);
        const amountFormatted = parseFloat(ethers.formatUnits(info.amount, 18)).toFixed(2);
        const veDustFormatted = parseFloat(ethers.formatUnits(info.veDustAmount, 18)).toFixed(2);
        const { daysRemaining, isExpired } = lockTiming(info.end, info.isPermanent, now);
        userLocks.push({
          tokenId,
          amount: info.amount,
          veDustAmount: info.veDustAmount,
          end: info.end,
          effectiveStart: info.effectiveStart,
          isPermanent: info.isPermanent,
          amountFormatted,
          veDustFormatted,
          daysRemaining,
          isExpired,
        });
      } catch {
        // Preserve the existing fallback when an individual read fails.
      }
    }

    return this.sortLocks(userLocks);
  }

  /**
   * {@link getUserLocks} through one Multicall3 `aggregate3` read for the lock rows. The same
   * optional `currentTimestamp` clock applies.
   */
  async getUserLocksWithMulticall(
    owner: string,
    multicallAddress: string,
    currentTimestamp?: number,
  ): Promise<UserLock[]> {
    if (!isAddress(multicallAddress)) throw new Error('multicallAddress is not valid');
    const now = resolveCurrentTimestamp(currentTimestamp);
    const tokenIds = await this.getOwnerTokenIds(owner);
    if (tokenIds.length === 0) return [];
    const calls: Array<{
      target: string;
      allowFailure: boolean;
      callData: string;
    }> = [];
    for (const tokenId of tokenIds) {
      calls.push({
        target: this.lockAddress,
        allowFailure: true,
        callData: this.lockInterface.encodeFunctionData('locked', [tokenId]),
      });
      calls.push({
        target: this.lockAddress,
        allowFailure: true,
        callData: this.lockInterface.encodeFunctionData('balanceOfNFT', [tokenId]),
      });
    }

    const results = await this.aggregate3(multicallAddress, calls);
    const userLocks: UserLock[] = [];
    for (let i = 0; i < tokenIds.length; i++) {
      const lockedIx = i * 2;
      const balanceIx = i * 2 + 1;
      const lockedRes = results[lockedIx];
      const balRes = results[balanceIx];
      if (!lockedRes?.success || !balRes?.success) continue;
      try {
        const [locked] = decodeAbiResult(
          this.lockInterface,
          dustLockAbi,
          'locked',
          lockedRes.returnData,
        );
        const [veDust] = decodeAbiResult(
          this.lockInterface,
          dustLockAbi,
          'balanceOfNFT',
          balRes.returnData,
        );
        const end = ethers.getNumber(locked[2] ?? 0);
        const isPermanent = (locked[3] ?? false) && end === 0;
        const amountFormatted = parseFloat(ethers.formatUnits(locked[0], 18)).toFixed(2);
        const veDustFormatted = parseFloat(ethers.formatUnits(veDust, 18)).toFixed(2);
        const { daysRemaining, isExpired } = lockTiming(end, isPermanent, now);
        userLocks.push({
          tokenId: tokenIds[i],
          amount: locked[0].toString(),
          veDustAmount: veDust.toString(),
          end,
          effectiveStart: ethers.getNumber(locked[1] ?? 0),
          isPermanent,
          amountFormatted,
          veDustFormatted,
          daysRemaining,
          isExpired,
        });
      } catch {
        // Preserve the existing fallback when an individual read fails.
      }
    }

    return this.sortLocks(userLocks);
  }

  /** Balances, allowance, `minLockAmount` and locks; `currentTimestamp` as in {@link getUserLocks}. */
  async getUserDustDataWithMulticall(
    userAddress: string,
    multicallAddress: string,
    currentTimestamp?: number,
  ): Promise<{
    userLocks: UserLock[];
    dustBalance: bigint;
    dustAllowance: bigint;
    minLockAmount: bigint;
  }> {
    if (!isAddress(multicallAddress)) throw new Error('multicallAddress is not valid');
    resolveCurrentTimestamp(currentTimestamp);
    const calls = [
      {
        target: this.lockAddress,
        allowFailure: true,
        callData: this.lockInterface.encodeFunctionData('balanceOf', [userAddress]),
      },
      {
        target: this.dustTokenAddress,
        allowFailure: true,
        callData: this.erc20Interface.encodeFunctionData('balanceOf', [userAddress]),
      },
      {
        target: this.dustTokenAddress,
        allowFailure: true,
        callData: this.erc20Interface.encodeFunctionData('allowance', [
          userAddress,
          this.lockAddress,
        ]),
      },
      {
        target: this.lockAddress,
        allowFailure: true,
        callData: this.lockInterface.encodeFunctionData('minLockAmount', []),
      },
    ];
    const res = await this.aggregate3(multicallAddress, calls);
    const balance = res[0]?.success
      ? decodeAbiResult(this.lockInterface, dustLockAbi, 'balanceOf', res[0].returnData)[0]
      : 0n;
    const dustBalance = res[1]?.success
      ? decodeAbiResult(this.erc20Interface, erc20Abi, 'balanceOf', res[1].returnData)[0]
      : 0n;
    const dustAllowance = res[2]?.success
      ? decodeAbiResult(this.erc20Interface, erc20Abi, 'allowance', res[2].returnData)[0]
      : 0n;
    const minLockAmount = res[3]?.success
      ? decodeAbiResult(this.lockInterface, dustLockAbi, 'minLockAmount', res[3].returnData)[0]
      : 0n;
    const userLocks =
      balance > 0n
        ? await this.getUserLocksWithMulticall(userAddress, multicallAddress, currentTimestamp)
        : [];
    return { userLocks, dustBalance, dustAllowance, minLockAmount };
  }

  async getDustBalance(userAddress: string): Promise<bigint> {
    const awaitedResult = await this.erc20Contract.balanceOf(userAddress);
    return awaitedResult;
  }

  async getDustAllowance(userAddress: string, spender = this.lockAddress): Promise<bigint> {
    const awaitedResult = await this.erc20Contract.allowance(userAddress, spender);
    return awaitedResult;
  }

  async getMinLockAmount(): Promise<bigint> {
    const awaitedResult = await this.lockContract.minLockAmount();
    return awaitedResult;
  }

  private async getOwnerTokenIds(owner: string): Promise<number[]> {
    if (!isAddress(owner)) return [];
    try {
      const balance: bigint = await this.lockContract.balanceOf(owner);
      const count = ethers.getNumber(balance);
      if (count === 0) return [];
      const tokenIds: number[] = [];
      for (let i = 0; i < count; i++) {
        try {
          // eslint-disable-next-line no-await-in-loop -- Preserve sequential enumeration/cursor reads, per-item fallback handling and the original request order.
          const id: bigint = await this.lockContract.ownerToNFTokenIdList(owner, i);
          const n = ethers.getNumber(id);
          if (n > 0) tokenIds.push(n);
        } catch {
          // Preserve the existing fallback when an individual read fails.
        }
      }

      return tokenIds;
    } catch {
      return [];
    }
  }

  // ---------- Multicall helpers ----------
  private async aggregate3(
    multicallAddress: string,
    calls: Array<{
      target: string;
      allowFailure: boolean;
      callData: string;
    }>,
  ): Promise<
    Array<{
      success: boolean;
      returnData: string;
    }>
  > {
    const svcMc = new AbiBaseService(this.provider, multicall3Abi);
    const mc = asAbiContract<typeof multicall3Abi, 'aggregate3'>(
      svcMc.getContractInstance(multicallAddress),
      multicall3Abi,
    );
    // aggregate3 is payable, so ethers only treats it as a read through staticCall.
    const awaitedResult = await mc.aggregate3.staticCall(calls);
    return awaitedResult;
  }

  private sortLocks(userLocks: UserLock[]): UserLock[] {
    return userLocks.sort((a, b) => {
      if (a.isPermanent && !b.isPermanent) return -1;
      if (!a.isPermanent && b.isPermanent) return 1;
      const amountA = parseFloat(a.amountFormatted);
      const amountB = parseFloat(b.amountFormatted);
      if (amountA !== amountB) return amountB - amountA;
      if (a.isExpired && !b.isExpired) return 1;
      if (!a.isExpired && b.isExpired) return -1;
      return b.daysRemaining - a.daysRemaining;
    });
  }
}

export { DustLockTransactionBuilder } from './transaction-builder';
export type { DustLockTransactionBuilderContext } from './transaction-builder';
