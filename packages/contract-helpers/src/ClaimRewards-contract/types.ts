export interface ClaimRewardsParams {
  assetAddresses: string[];
  chainId: number;
  lockTime?: number; // 0 for instant claim
  tokenId?: number; // 0 for instant claim
}

export interface ClaimRewardsResult {
  txHash: string;
  rewardsList: string[];
  claimedAmounts: string[];
  tokenId?: number;
  isPermanentLock?: boolean;
  requiresManualVerification?: boolean;
}


