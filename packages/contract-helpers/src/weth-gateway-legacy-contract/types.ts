import { type InterestRate } from '../interest-rate';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface LegacyWETHBorrowParamsType {
  lendingPool: string;
  user: string;
  amount: string;
  interestRateMode: InterestRate;
  referralCode?: string;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface LegacyWETHRepayParamsType {
  lendingPool: string;
  user: string;
  amount: string;
  onBehalfOf?: string;
  interestRateMode: InterestRate;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface WETHDepositParamsType {
  lendingPool: string;
  user: string;
  amount: string;
  onBehalfOf?: string;
  referralCode?: string;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface WETHWithdrawParamsType {
  lendingPool: string;
  user: string;
  amount: string;
  aTokenAddress: string;
  onBehalfOf?: string;
}
