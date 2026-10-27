import { dustLockAbi, erc20Abi } from '@neverland-money/contract-types';
import { ethers } from 'ethers';
import type { BigNumberish } from 'ethers';
import { toUint256 } from '../commons/uint256';
import type {
  CreateLockForParams,
  CreateLockParams,
  CreateLockPermanentParams,
  IncreaseAmountParams,
  MergeParams,
  TransferParams,
} from './types';

export type DustLockTransactionBuilderContext = {
  lockAddress: string;
  dustTokenAddress: string;
};

/** Build canonical lock transactions locally from configured addresses, without a provider. */
export class DustLockTransactionBuilder {
  private readonly lockAddress: string;
  private readonly dustTokenAddress: string;
  private readonly lockInterface = new ethers.Interface(dustLockAbi);
  private readonly erc20Interface = new ethers.Interface(erc20Abi);

  constructor(context: DustLockTransactionBuilderContext) {
    if (!ethers.isAddress(context.lockAddress)) throw new Error('lockAddress is not valid');
    if (!ethers.isAddress(context.dustTokenAddress))
      throw new Error('dustTokenAddress is not valid');
    this.lockAddress = context.lockAddress;
    this.dustTokenAddress = context.dustTokenAddress;
  }

  getCreateLockTxData(params: CreateLockParams): {
    to: string;
    data: string;
  } {
    const { amount, lockDuration } = params;
    return this.encode('createLock', [
      toUint256(amount, 'amount'),
      toUint256(lockDuration, 'lockDuration'),
    ]);
  }

  getCreateLockPermanentTxData(params: CreateLockPermanentParams): {
    to: string;
    data: string;
  } {
    const { amount, lockDuration } = params;
    return this.encode('createLockPermanent', [
      toUint256(amount, 'amount'),
      toUint256(lockDuration, 'lockDuration'),
    ]);
  }

  getCreateLockForTxData(params: CreateLockForParams): {
    to: string;
    data: string;
  } {
    const { to, amount, unlockTime } = params;
    return this.encode('createLockFor', [
      toUint256(amount, 'amount'),
      toUint256(unlockTime, 'unlockTime'),
      ethers.getAddress(to),
    ]);
  }

  getIncreaseAmountTxData(params: IncreaseAmountParams): {
    to: string;
    data: string;
  } {
    const { tokenId, amount } = params;
    return this.encode('increaseAmount', [
      toUint256(tokenId, 'tokenId'),
      toUint256(amount, 'amount'),
    ]);
  }

  getIncreaseUnlockTimeTxData(
    tokenId: BigNumberish,
    lockDurationSeconds: number,
  ): {
    to: string;
    data: string;
  } {
    return this.encode('increaseUnlockTime', [
      toUint256(tokenId, 'tokenId'),
      toUint256(lockDurationSeconds, 'lockDurationSeconds'),
    ]);
  }

  getLockPermanentTxData(tokenId: BigNumberish): {
    to: string;
    data: string;
  } {
    return this.encode('lockPermanent', [toUint256(tokenId, 'tokenId')]);
  }

  getUnlockPermanentTxData(tokenId: BigNumberish): {
    to: string;
    data: string;
  } {
    return this.encode('unlockPermanent', [toUint256(tokenId, 'tokenId')]);
  }

  /**
   * `earlyWithdraw` is overloaded, so the encoder needs the full signature. Pass `maxPenalty`
   * (DUST, wei) to revert instead of paying more than a quoted penalty.
   */
  getEarlyWithdrawTxData(
    tokenId: BigNumberish,
    maxPenalty?: BigNumberish,
  ): {
    to: string;
    data: string;
  } {
    const id = toUint256(tokenId, 'tokenId');
    return maxPenalty === undefined
      ? this.encode('earlyWithdraw(uint256)', [id])
      : this.encode('earlyWithdraw(uint256,uint256)', [id, toUint256(maxPenalty, 'maxPenalty')]);
  }

  getWithdrawTxData(tokenId: BigNumberish): {
    to: string;
    data: string;
  } {
    return this.encode('withdraw', [toUint256(tokenId, 'tokenId')]);
  }

  getMergeTxData(params: MergeParams): {
    to: string;
    data: string;
  } {
    const { fromTokenId, toTokenId } = params;
    return this.encode('merge', [
      toUint256(fromTokenId, 'fromTokenId'),
      toUint256(toTokenId, 'toTokenId'),
    ]);
  }

  getTransferTxData(params: TransferParams): { to: string; data: string } {
    const { from, to, tokenId } = params;
    return this.encode('safeTransferFrom(address,address,uint256)', [
      ethers.getAddress(from),
      ethers.getAddress(to),
      toUint256(tokenId, 'tokenId'),
    ]);
  }

  getApprovalTxData(
    _fromAddress: string,
    amount: string,
  ): {
    to: string;
    data: string;
  } {
    const data = this.erc20Interface.encodeFunctionData('approve', [
      this.lockAddress,
      toUint256(amount, 'amount'),
    ]);
    return { to: this.dustTokenAddress, data };
  }

  private encode(method: string, params: unknown[]): { to: string; data: string } {
    return { to: this.lockAddress, data: this.lockInterface.encodeFunctionData(method, params) };
  }
}
