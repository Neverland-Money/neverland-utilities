import { ethers } from 'ethers';
import { dustRewardsControllerAbi } from '@neverland-money/contract-types';

export interface ClaimRewardsParams {
  assetAddresses: string[];
  chainId: number;
  lockTime?: number;
  tokenId?: number;
}

export class ClaimRewardsHelper {
  getClaimAllRewardsToSelfTxData(params: ClaimRewardsParams & { controller: string }): { to: string; data: string } {
    const { assetAddresses, controller, lockTime = 0, tokenId = 0 } = params;
    const iface = new ethers.utils.Interface(dustRewardsControllerAbi as any);
    const data = iface.encodeFunctionData('claimAllRewardsToSelf', [assetAddresses, lockTime, tokenId]);
    return { to: controller, data };
  }

  getClaimRewardsToSelfTxData(params: ClaimRewardsParams & { controller: string; dustToken: string; amount: string }): { to: string; data: string } {
    const { assetAddresses, controller, dustToken, lockTime = 0, tokenId = 0, amount } = params;
    const iface = new ethers.utils.Interface(dustRewardsControllerAbi as any);
    const amountWei = ethers.utils.parseUnits(amount, 18);
    const data = iface.encodeFunctionData('claimRewardsToSelf', [assetAddresses, amountWei, dustToken, lockTime, tokenId]);
    return { to: controller, data };
  }
}


