import { InterestRate } from "../interestRate";

export interface LegacyWETHBorrowParamsType {
    lendingPool: string;
    user: string;
    amount: string;
    interestRateMode: InterestRate;
    referralCode?: string;
  }
  
  export interface LegacyWETHRepayParamsType {
    lendingPool: string;
    user: string;
    amount: string;
    onBehalfOf?: string;
    interestRateMode: InterestRate;
  }
  
  export interface WETHDepositParamsType {
    lendingPool: string;
    user: string;
    amount: string;
    onBehalfOf?: string;
    referralCode?: string;
  }
  
  export interface WETHWithdrawParamsType {
    lendingPool: string;
    user: string;
    amount: string;
    aTokenAddress: string;
    onBehalfOf?: string;
  } 