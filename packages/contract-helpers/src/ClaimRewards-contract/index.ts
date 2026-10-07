import { ethers } from 'ethers';
import type { Abi } from 'abitype';
import { dustRewardsControllerAbi } from '@neverland-money/contract-types';
import { AbiBaseService } from '../commons/BaseService';
import type { ClaimRewardsParams } from './types';
export interface ClaimRewardsProviderInterface {
  getClaimAllRewardsToSelfTxData: (
    params: ClaimRewardsParams & {
      rewardsControllerAddress: string;
    },
  ) => {
    to: string;
    data: string;
  };
  getClaimRewardsToSelfTxData: (
    params: ClaimRewardsParams & {
      rewardsControllerAddress: string;
      dustTokenAddress: string;
      amount: string;
    },
  ) => {
    to: string;
    data: string;
  };
}
export class ClaimRewardsHelper
  extends AbiBaseService<Abi>
  implements ClaimRewardsProviderInterface
{
  public readonly chainId?: number;
  constructor({ provider, chainId }: { provider: ethers.Provider; chainId?: number }) {
    super(provider, dustRewardsControllerAbi as any);
    this.chainId = chainId;
  }
  /**
   * Build tx data for claimAllRewardsToSelf using AbiBaseService
   */
  getClaimAllRewardsToSelfTxData(
    params: ClaimRewardsParams & {
      rewardsControllerAddress: string;
    },
  ): {
    to: string;
    data: string;
  } {
    const { assetAddresses, rewardsControllerAddress, lockTime = 0, tokenId = 0 } = params;
    const to = rewardsControllerAddress;
    if (!to) throw new Error('rewardsControllerAddress address is required');
    const data = this.encodeFunctionData(
      'claimAllRewardsToSelf' as any,
      [assetAddresses, lockTime, tokenId] as any,
    );
    return { to, data };
  }
  /**
   * Build tx data for claimRewardsToSelf using AbiBaseService
   */
  getClaimRewardsToSelfTxData(
    params: ClaimRewardsParams & {
      rewardsControllerAddress: string;
      dustTokenAddress: string;
      amount: string;
    },
  ): {
    to: string;
    data: string;
  } {
    const {
      assetAddresses,
      rewardsControllerAddress,
      dustTokenAddress,
      lockTime = 0,
      tokenId = 0,
      amount,
    } = params;
    const to = rewardsControllerAddress;
    if (!to) throw new Error('rewardsControllerAddress address is required');
    const amountWei = ethers.parseUnits(amount, 18);
    const data = this.encodeFunctionData(
      'claimRewardsToSelf' as any,
      [assetAddresses, amountWei, dustTokenAddress, lockTime, tokenId] as any,
    );
    return { to, data };
  }
}
