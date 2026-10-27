import type { BigNumberish } from 'ethers';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface VeDustCalculationParams {
  dustAmount: number;
  endTimestamp: number;
  isPermanent: boolean;
  /** Current Unix seconds; defaults to the local clock when omitted. */
  currentTimestamp?: number;
}

/*
 * DustLock validates every new lock the same way; the builders encode values as given and do not
 * check these rules, so a value that breaks one produces a transaction that reverts:
 * - amount is raw DUST wei and must be at least DustLock `minLockAmount`, a raw wei value the
 *   team can change (10 DUST on mainnet as of October 2026). Read it with
 *   `DustLockHelper.getMinLockAmount()` rather than hard-coding it.
 * - The unlock time is `now + duration` rounded down to a whole week (Thursday 00:00 UTC). It must
 *   land in the future, at least 28 days (MINTIME) ahead, and at most 365 days (MAXTIME) ahead.
 *   A 28-day duration usually rounds below the minimum; a duration of 35 to 365 days always fits.
 */

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface CreateLockParams {
  /** Raw DUST wei; at least DustLock `minLockAmount`. */
  amount: string;
  /** Lock duration in seconds, rounded down to whole weeks; 28 to 365 days after rounding. */
  lockDuration: number;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface CreateLockPermanentParams {
  /** Raw DUST wei; at least DustLock `minLockAmount`. */
  amount: string;
  /**
   * Lock duration in seconds. The contract creates a timed lock first and validates this exactly
   * like `createLock` (whole weeks, 28 to 365 days after rounding) before making it permanent, so
   * 0 or a short duration reverts. 365 days is the conventional value.
   */
  lockDuration: number;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface CreateLockForParams {
  to: string;
  /** Raw DUST wei; at least DustLock `minLockAmount`. */
  amount: string;
  /**
   * Lock duration in seconds despite the legacy name, not a timestamp. Rounded down to whole
   * weeks; 28 to 365 days after rounding.
   */
  unlockTime: number;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface IncreaseAmountParams {
  tokenId: BigNumberish;
  /**
   * Raw DUST wei; at least a tenth of DustLock `minLockAmount`. A timed lock must not have
   * expired and must have at least 28 days left.
   */
  amount: string;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface MergeParams {
  fromTokenId: BigNumberish;
  toTokenId: BigNumberish;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface TransferParams {
  from: string;
  to: string;
  tokenId: BigNumberish;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface LockInfo {
  amount: string;
  veDustAmount: string;
  end: number;
  effectiveStart: number;
  isPermanent: boolean;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface UserLock extends LockInfo {
  tokenId: number;
  // UI derived fields
  amountFormatted: string;
  veDustFormatted: string;
  daysRemaining: number;
  isExpired: boolean;
}
