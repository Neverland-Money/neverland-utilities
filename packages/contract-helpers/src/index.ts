// Export contract helpers
export { DustIncentiveProvider } from './DustIncentiveProvider-contract';

// Shared helper input types (used by v3-UiPoolDataProvider-contract)
export type ReservesHelperInput = {
  lendingPoolAddressProvider: string;
};

export type UserReservesHelperInput = {
  lendingPoolAddressProvider: string;
  user: string;
};

// Export contract-specific types
export * from './DustIncentiveProvider-contract/types';
export { DustLockHelper } from './DustLock-contract';
export * from './DustLock-contract/types';
export { InterestRate } from './interestRate';

