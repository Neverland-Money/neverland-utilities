import { dustRewardsControllerAbi } from '@neverland-money/contract-types';
import type { Abi } from 'abitype';
import { ethers } from 'ethers';
import type { BigNumberish } from 'ethers';
import { AbiBaseService } from '../commons/base-service';
import { toUint256 } from '../commons/uint256';
import type { ClaimRewardsParams } from './types';

type ClaimAllRewardsToSelfParams = Omit<ClaimRewardsParams, 'chainId'> & {
  /** Accepted for compatibility; the builders do not read it. */
  chainId?: number;
  rewardsControllerAddress: string;
};
type ClaimRewardsToSelfParams = ClaimAllRewardsToSelfParams & {
  dustTokenAddress: string;
  /**
   * Human DUST amount with up to 18 decimals, such as '1.5'; the builder scales it to wei. It is
   * not a raw wei amount: a wei string is scaled again, and since the controller caps a claim at
   * the accrued balance of the listed assets, the claim (and its toll) then covers all of it.
   */
  amount: string;
};
const rewardsInterface = new ethers.Interface(dustRewardsControllerAbi);
const LOCK_TIME_REQUIRED =
  'lockTime is required: 0 claims instantly with the 50% instant-claim toll, a duration of at ' +
  'least 28 days in seconds locks with a timed toll, and MaxUint256 creates a permanent lock ' +
  'with no toll';

/** JavaScript callers can omit the field the types require, so reject it before encoding. */
function requireLockTime(params: { lockTime?: BigNumberish | null }): BigNumberish {
  const { lockTime } = params;
  if (lockTime === undefined || lockTime === null) throw new Error(LOCK_TIME_REQUIRED);
  return lockTime;
}

/**
 * Build a `claimAllRewardsToSelf` transaction locally. `lockTime` is required and `tokenId`
 * defaults to 0; both are raw uint256 values whose routes and tolls are described on
 * {@link ClaimRewardsParams}.
 */
export function buildClaimAllRewardsToSelfTxData(params: ClaimAllRewardsToSelfParams): {
  to: string;
  data: string;
} {
  const { assetAddresses, rewardsControllerAddress, tokenId = 0 } = params;
  const lockTime = requireLockTime(params);
  ethers.getAddress(rewardsControllerAddress);
  const assets = assetAddresses.map(address => ethers.getAddress(address));
  const data = rewardsInterface.encodeFunctionData('claimAllRewardsToSelf', [
    assets,
    toUint256(lockTime, 'lockTime'),
    toUint256(tokenId, 'tokenId'),
  ]);
  return { to: rewardsControllerAddress, data };
}

/**
 * Build a `claimRewardsToSelf` transaction without RPC. `amount` is a human DUST string with 18
 * decimals, not wei. `lockTime` is required and `tokenId` defaults to 0, as for
 * {@link buildClaimAllRewardsToSelfTxData}.
 */
export function buildClaimRewardsToSelfTxData(params: ClaimRewardsToSelfParams): {
  to: string;
  data: string;
} {
  const {
    assetAddresses,
    rewardsControllerAddress,
    dustTokenAddress,
    tokenId = 0,
    amount,
  } = params;
  const lockTime = requireLockTime(params);
  ethers.getAddress(rewardsControllerAddress);
  const assets = assetAddresses.map(address => ethers.getAddress(address));
  const rewardToken = ethers.getAddress(dustTokenAddress);
  const amountWei = toUint256(ethers.parseUnits(amount, 18), 'amount');
  const data = rewardsInterface.encodeFunctionData('claimRewardsToSelf', [
    assets,
    amountWei,
    rewardToken,
    toUint256(lockTime, 'lockTime'),
    toUint256(tokenId, 'tokenId'),
  ]);
  return { to: rewardsControllerAddress, data };
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface ClaimRewardsProviderInterface {
  getClaimAllRewardsToSelfTxData: typeof buildClaimAllRewardsToSelfTxData;
  getClaimRewardsToSelfTxData: typeof buildClaimRewardsToSelfTxData;
}
export class ClaimRewardsHelper
  extends AbiBaseService<Abi>
  implements ClaimRewardsProviderInterface
{
  public readonly chainId?: number;
  constructor({ provider, chainId }: { provider: ethers.Provider; chainId?: number }) {
    super(provider, dustRewardsControllerAbi);
    this.chainId = chainId;
  }

  getClaimAllRewardsToSelfTxData(params: ClaimAllRewardsToSelfParams): {
    to: string;
    data: string;
  } {
    return buildClaimAllRewardsToSelfTxData(params);
  }

  getClaimRewardsToSelfTxData(params: ClaimRewardsToSelfParams): { to: string; data: string } {
    return buildClaimRewardsToSelfTxData(params);
  }
}
