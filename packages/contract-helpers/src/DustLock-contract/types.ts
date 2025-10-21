export interface VeDustCalculationParams {
  dustAmount: number;
  endTimestamp: number;
  isPermanent: boolean;
}

export interface CreateLockParams {
  amount: string; // wei
  lockDuration: number; // seconds
}

export interface CreateLockPermanentParams {
  amount: string; // wei
  lockDuration: number; // seconds (ignored by contract)
}

export interface CreateLockForParams {
  to: string;
  amount: string; // wei
  unlockTime: number; // unix timestamp
}

export interface IncreaseAmountParams {
  tokenId: number;
  amount: string; // wei
}

export interface MergeParams {
  fromTokenId: number;
  toTokenId: number;
}

export interface LockInfo {
  amount: string;
  veDustAmount: string;
  end: number;
  effectiveStart: number;
  isPermanent: boolean;
}

export interface UserLock extends LockInfo {
  tokenId: number;
  // UI derived fields
  amountFormatted: string;
  veDustFormatted: string;
  daysRemaining: number;
  isExpired: boolean;
}


