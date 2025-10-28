import { Contract, providers, BigNumber, utils } from 'ethers';
import { isAddress } from 'ethers/lib/utils';
import { dustLockAbi, erc20Abi, multicall3Abi } from '@neverland-money/contract-types';
import { AbiBaseService } from '../commons/BaseService';
import type { Abi } from 'abitype';
import type {
  LockInfo,
  UserLock,
  VeDustCalculationParams,
  CreateLockParams,
  CreateLockForParams,
  CreateLockPermanentParams,
  IncreaseAmountParams,
  MergeParams,
} from './types';

export interface DustLockHelperContext {
  lockAddress: string;
  dustTokenAddress: string;
  provider: providers.Provider;
  chainId?: number;
}

export class DustLockHelper extends AbiBaseService<Abi> {
  private readonly lockAddress: string;
  private readonly dustTokenAddress: string;
  private readonly lockInterface = new utils.Interface(dustLockAbi as any);
  private readonly erc20Interface = new utils.Interface(erc20Abi as any);
  private readonly lockContract: Contract;
  private readonly erc20Contract: Contract;

  constructor(context: DustLockHelperContext) {
    super(context.provider, dustLockAbi as any, context.lockAddress);

    if (!isAddress(context.lockAddress)) throw new Error('lockAddress is not valid');
    if (!isAddress(context.dustTokenAddress)) throw new Error('dustTokenAddress is not valid');
    this.lockAddress = context.lockAddress;
    this.dustTokenAddress = context.dustTokenAddress;
    const svcErc20 = new AbiBaseService(this.provider, erc20Abi as any, context.dustTokenAddress);
    this.lockContract = this.getContractInstance(this.lockAddress);
    this.erc20Contract = svcErc20.getContractInstance(this.dustTokenAddress);
  }

  // ---------- Tx data encoders ----------
  private encode(method: string, params: unknown[]): { to: string; data: string } {
    return { to: this.lockAddress, data: this.lockInterface.encodeFunctionData(method, params) };
  }

  getCreateLockTxData(params: CreateLockParams): { to: string; data: string } {
    const { amount, lockDuration } = params;
    return this.encode('createLock', [amount, lockDuration]);
  }

  getCreateLockPermanentTxData(params: CreateLockPermanentParams): { to: string; data: string } {
    const { amount, lockDuration } = params;
    return this.encode('createLockPermanent', [amount, lockDuration]);
  }

  getCreateLockForTxData(params: CreateLockForParams): { to: string; data: string } {
    const { to, amount, unlockTime } = params;
    return this.encode('createLockFor', [to, amount, unlockTime]);
  }

  getIncreaseAmountTxData(params: IncreaseAmountParams): { to: string; data: string } {
    const { tokenId, amount } = params;
    return this.encode('increaseAmount', [tokenId, amount]);
  }

  getIncreaseUnlockTimeTxData(
    tokenId: number,
    lockDurationSeconds: number,
  ): { to: string; data: string } {
    return this.encode('increaseUnlockTime', [tokenId, lockDurationSeconds]);
  }

  getLockPermanentTxData(tokenId: number): { to: string; data: string } {
    return this.encode('lockPermanent', [tokenId]);
  }

  getUnlockPermanentTxData(tokenId: number): { to: string; data: string } {
    return this.encode('unlockPermanent', [tokenId]);
  }

  getEarlyWithdrawTxData(tokenId: number): { to: string; data: string } {
    return this.encode('earlyWithdraw', [tokenId]);
  }

  getWithdrawTxData(tokenId: number): { to: string; data: string } {
    return this.encode('withdraw', [tokenId]);
  }

  getMergeTxData(params: MergeParams): { to: string; data: string } {
    const { fromTokenId, toTokenId } = params;
    return this.encode('merge', [fromTokenId, toTokenId]);
  }

  getApprovalTxData(_fromAddress: string, amount: string): { to: string; data: string } {
    const data = this.erc20Interface.encodeFunctionData('approve', [this.lockAddress, amount]);
    return { to: this.dustTokenAddress, data };
  }

  // ---------- Reads ----------
  async getLockInfo(tokenId: number): Promise<LockInfo> {
    const [locked, veDust] = await Promise.all([
      this.lockContract.locked(tokenId),
      this.lockContract.balanceOfNFT(tokenId),
    ]);

    const end = locked.end.toNumber();
    const isPermanent = locked.isPermanent && end === 0;

    return {
      amount: locked.amount.toString(),
      veDustAmount: veDust.toString(),
      end,
      effectiveStart: locked.effectiveStart.toNumber(),
      isPermanent,
    };
  }

  private async getOwnerTokenIds(owner: string): Promise<number[]> {
    if (!isAddress(owner)) return [];
    try {
      const balance: BigNumber = await this.lockContract.balanceOf(owner);
      const count = balance.toNumber();
      if (count === 0) return [];
      const tokenIds: number[] = [];
      for (let i = 0; i < count; i++) {
        try {
          const id: BigNumber = await this.lockContract.ownerToNFTokenIdList(owner, i);
          const n = id.toNumber();
          if (n > 0) tokenIds.push(n);
        } catch {}
      }
      return tokenIds;
    } catch {
      return [];
    }
  }

  async getUserLocks(owner: string): Promise<UserLock[]> {
    const tokenIds = await this.getOwnerTokenIds(owner);
    const userLocks: UserLock[] = [];
    for (const tokenId of tokenIds) {
      try {
        const info = await this.getLockInfo(tokenId);
        const amountFormatted = parseFloat(utils.formatUnits(info.amount, 18)).toFixed(2);
        const veDustFormatted = parseFloat(utils.formatUnits(info.veDustAmount, 18)).toFixed(2);

        const now = Math.floor(Date.now() / 1000);
        let daysRemaining = 0;
        let isExpired = false;
        if (info.isPermanent) {
          daysRemaining = 0;
        } else if (info.end > 0) {
          const secondsRemaining = info.end - now;
          daysRemaining = Math.max(0, Math.floor(secondsRemaining / 86400));
          isExpired = secondsRemaining <= 0;
        }

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
      } catch {}
    }

    return this.sortLocks(userLocks);
  }

  // ---------- Multicall helpers ----------
  private async aggregate3(
    multicallAddress: string,
    calls: { target: string; allowFailure: boolean; callData: string }[],
  ): Promise<{ success: boolean; returnData: string }[]> {
    const svcMc = new AbiBaseService(this.provider, multicall3Abi as any);
    const mc = svcMc.getContractInstance(multicallAddress);
    return await mc.aggregate3(calls);
  }

  async getUserLocksWithMulticall(owner: string, multicallAddress: string): Promise<UserLock[]> {
    if (!isAddress(multicallAddress)) throw new Error('multicallAddress is not valid');
    const tokenIds = await this.getOwnerTokenIds(owner);
    if (tokenIds.length === 0) return [];

    const calls: { target: string; allowFailure: boolean; callData: string }[] = [];
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
    const now = Math.floor(Date.now() / 1000);
    const userLocks: UserLock[] = [];

    for (let i = 0; i < tokenIds.length; i++) {
      const lockedIx = i * 2;
      const balanceIx = i * 2 + 1;
      const lockedRes = results[lockedIx];
      const balRes = results[balanceIx];
      if (!lockedRes?.success || !balRes?.success) continue;

      try {
        const [locked] = this.lockInterface.decodeFunctionResult(
          'locked',
          lockedRes.returnData,
        ) as any[];
        const [veDust] = this.lockInterface.decodeFunctionResult(
          'balanceOfNFT',
          balRes.returnData,
        ) as any[];
        const end = locked[2]?.toNumber?.() ?? 0;
        const isPermanent = (locked[3] ?? false) && end === 0;

        const amountFormatted = parseFloat(utils.formatUnits(locked[0], 18)).toFixed(2);
        const veDustFormatted = parseFloat(utils.formatUnits(veDust, 18)).toFixed(2);

        let daysRemaining = 0;
        let isExpired = false;
        if (isPermanent) {
          daysRemaining = 0;
        } else if (end > 0) {
          const secondsRemaining = end - now;
          daysRemaining = Math.max(0, Math.floor(secondsRemaining / 86400));
          isExpired = secondsRemaining <= 0;
        }

        userLocks.push({
          tokenId: tokenIds[i],
          amount: locked[0].toString(),
          veDustAmount: veDust.toString(),
          end,
          effectiveStart: locked[1]?.toNumber?.() ?? 0,
          isPermanent,
          amountFormatted,
          veDustFormatted,
          daysRemaining,
          isExpired,
        });
      } catch {}
    }

    return this.sortLocks(userLocks);
  }

  async getUserDustDataWithMulticall(
    userAddress: string,
    multicallAddress: string,
  ): Promise<{
    userLocks: UserLock[];
    dustBalance: BigNumber;
    dustAllowance: BigNumber;
    minLockAmount: BigNumber;
  }> {
    if (!isAddress(multicallAddress)) throw new Error('multicallAddress is not valid');

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
      ? (this.lockInterface.decodeFunctionResult('balanceOf', res[0].returnData)[0] as BigNumber)
      : BigNumber.from(0);
    const dustBalance = res[1]?.success
      ? (this.erc20Interface.decodeFunctionResult('balanceOf', res[1].returnData)[0] as BigNumber)
      : BigNumber.from(0);
    const dustAllowance = res[2]?.success
      ? (this.erc20Interface.decodeFunctionResult('allowance', res[2].returnData)[0] as BigNumber)
      : BigNumber.from(0);
    const minLockAmount = res[3]?.success
      ? (this.lockInterface.decodeFunctionResult(
          'minLockAmount',
          res[3].returnData,
        )[0] as BigNumber)
      : BigNumber.from(0);

    const userLocks = balance.gt(0)
      ? await this.getUserLocksWithMulticall(userAddress, multicallAddress)
      : [];

    return { userLocks, dustBalance, dustAllowance, minLockAmount };
  }

  async getDustBalance(userAddress: string): Promise<BigNumber> {
    return await this.erc20Contract.balanceOf(userAddress);
  }

  async getDustAllowance(userAddress: string): Promise<BigNumber> {
    return await this.erc20Contract.allowance(userAddress, this.lockAddress);
  }

  async getMinLockAmount(): Promise<BigNumber> {
    return await this.lockContract.minLockAmount();
  }

  // ---------- Utilities ----------
  static calculateVeDustPower(params: VeDustCalculationParams): number {
    const { dustAmount, endTimestamp, isPermanent } = params;
    if (isPermanent) return dustAmount;
    const MAXTIME = 365 * 86400;
    const now = Math.floor(Date.now() / 1000);
    const remaining = Math.max(0, endTimestamp - now);
    const ve = dustAmount * (remaining / MAXTIME);
    return Math.round(ve * 100) / 100;
  }

  static calculateMergedVeDustPower(
    totalDustAmount: number,
    toPositionEndTimestamp: number,
    toPositionIsPermanent: boolean,
  ): number {
    return DustLockHelper.calculateVeDustPower({
      dustAmount: totalDustAmount,
      endTimestamp: toPositionEndTimestamp,
      isPermanent: toPositionIsPermanent,
    });
  }

  static calculateVeDustIncrease(
    additionalDustAmount: number,
    currentVeDustPower: number,
    lockEndTimestamp: number,
    isPermanent: boolean,
  ): number {
    const inc = DustLockHelper.calculateVeDustPower({
      dustAmount: additionalDustAmount,
      endTimestamp: lockEndTimestamp,
      isPermanent,
    });
    return currentVeDustPower + inc;
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
