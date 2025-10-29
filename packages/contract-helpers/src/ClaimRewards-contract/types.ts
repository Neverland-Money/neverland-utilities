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
  tokenId?: number; // Extracted from transaction events for new lock creation
  isPermanentLock?: boolean; // Added after permanent lock conversion
  requiresManualVerification?: boolean;
}
