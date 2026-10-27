import type { BigNumberish } from 'ethers';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface ClaimRewardsParams {
  assetAddresses: readonly string[];
  /**
   * Not read by the provider-free claim builders, which accept params without it. Kept required
   * here so consumers that derive their own params from this type still receive a chain ID.
   */
  chainId: number;
  /**
   * Required. Raw uint256 that selects how the DUST transfer strategy delivers a claim when
   * `tokenId` is 0. There is no default, because every route has a different cost:
   * - `0`: instant claim. The strategy sends half of the claimed DUST to the early-withdraw
   *   treasury as the instant-claim toll and transfers the other half to the caller.
   * - A duration in seconds: creates a new veDUST lock. The unlock time is
   *   `now + lockTime` rounded down to a whole week, and it must land at least 28 days and at
   *   most 365 days ahead, or the claim reverts. A 28-day duration usually rounds below the
   *   minimum, so use at least 35 days. The toll is 40% at a 28-day commitment (the time from
   *   the claim to the rounded unlock) and falls linearly toward 0 at 365 days, rounded up in
   *   the treasury's favor. It is 0 for any commitment of 358 days (365 days minus a week) or more.
   * - `MaxUint256`: creates a permanent lock with no toll.
   * The net DUST after the toll must meet DustLock `minLockAmount` for a new lock. When `tokenId`
   * is above 0 the contract ignores `lockTime`; pass 0. Quote any route first with the
   * transfer strategy's `previewClaim(amount, lockTime, tokenId)`.
   */
  lockTime: BigNumberish;
  /**
   * Raw uint256 veNFT ID; defaults to 0, which routes the claim by `lockTime`. Above 0, the net
   * DUST is deposited into that existing lock, which the caller must own, and `lockTime` is
   * ignored. The toll is priced from that lock's remaining time on the same curve as a timed
   * claim: none for a permanent lock, and a revert when the lock has expired, or has under 28 days
   * or over 365 days left. The deposit must be at least one tenth of DustLock `minLockAmount`.
   */
  tokenId?: BigNumberish;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface ClaimRewardsResult {
  txHash: string;
  rewardsList: string[];
  claimedAmounts: string[];
  tokenId?: number; // Extracted from transaction events for new lock creation
  isPermanentLock?: boolean; // Added after permanent lock conversion
  requiresManualVerification?: boolean;
}
