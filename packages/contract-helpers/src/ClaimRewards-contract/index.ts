import { ethers } from 'ethers';
import { dustRewardsControllerAbi } from '@neverland-money/contract-types';
import { AbiBaseService } from '../commons/BaseService';

export interface ClaimRewardsParams {
  assetAddresses: string[];
  chainId: number;
  lockTime?: number;
  tokenId?: number;
}

export class ClaimRewardsHelper {
  /**
   * Build tx data for claimAllRewardsToSelf using AbiBaseService
   */
  getClaimAllRewardsToSelfTxData(
    params: ClaimRewardsParams & { controller: string; provider?: ethers.providers.Provider },
  ): { to: string; data: string } {
    const { assetAddresses, controller, lockTime = 0, tokenId = 0, provider } = params;
    const svc = new AbiBaseService(provider ?? (new ethers.providers.JsonRpcProvider() as ethers.providers.Provider), dustRewardsControllerAbi as any);
    const data = svc.encodeFunctionData('claimAllRewardsToSelf' as any, [assetAddresses, lockTime, tokenId] as any);
    return { to: controller, data };
  }

  /**
   * Build tx data for claimRewardsToSelf using AbiBaseService
   */
  getClaimRewardsToSelfTxData(
    params: ClaimRewardsParams & { controller: string; dustToken: string; amount: string; provider?: ethers.providers.Provider },
  ): { to: string; data: string } {
    const { assetAddresses, controller, dustToken, lockTime = 0, tokenId = 0, amount, provider } = params;
    const svc = new AbiBaseService(provider ?? (new ethers.providers.JsonRpcProvider() as ethers.providers.Provider), dustRewardsControllerAbi as any);
    const amountWei = ethers.utils.parseUnits(amount, 18);
    const data = svc.encodeFunctionData('claimRewardsToSelf' as any, [assetAddresses, amountWei, dustToken, lockTime, tokenId] as any);
    return { to: controller, data };
  }
}


