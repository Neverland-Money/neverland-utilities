import { ethers } from 'ethers';
import type { Abi } from 'abitype';
import { dustRewardsControllerAbi } from '@neverland-money/contract-types';
import { AbiBaseService } from '../commons/BaseService';

export interface ClaimRewardsParams {
  assetAddresses: string[];
  chainId: number;
  lockTime?: number;
  tokenId?: number;
}

export interface ClaimRewardsProviderInterface {
  getClaimAllRewardsToSelfTxData: (params: ClaimRewardsParams & { controller?: string }) => {
    to: string;
    data: string;
  };
  getClaimRewardsToSelfTxData: (
    params: ClaimRewardsParams & { controller?: string; dustToken: string; amount: string },
  ) => {
    to: string;
    data: string;
  };
}

export class ClaimRewardsHelper extends AbiBaseService<Abi> {
  public readonly chainId?: number;

  constructor({ provider, chainId, controller }: { provider: ethers.providers.Provider; chainId?: number; controller?: string }) {
    super(provider, dustRewardsControllerAbi as any, controller);
    this.chainId = chainId;
  }

  /**
   * Build tx data for claimAllRewardsToSelf using AbiBaseService
   */
  getClaimAllRewardsToSelfTxData(params: ClaimRewardsParams & { controller?: string }): {
    to: string;
    data: string;
  } {
    const { assetAddresses, controller, lockTime = 0, tokenId = 0 } = params;
    const to = controller ?? this.defaultAddress;
    if (!to) throw new Error('controller address is required');
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
    params: ClaimRewardsParams & { controller?: string; dustToken: string; amount: string },
  ): { to: string; data: string } {
    const { assetAddresses, controller, dustToken, lockTime = 0, tokenId = 0, amount } = params;
    const to = controller ?? this.defaultAddress;
    if (!to) throw new Error('controller address is required');
    const amountWei = ethers.utils.parseUnits(amount, 18);
    const data = this.encodeFunctionData(
      'claimRewardsToSelf' as any,
      [assetAddresses, amountWei, dustToken, lockTime, tokenId] as any,
    );
    return { to, data };
  }
}
