import { InterestRate } from '../interestRate';
import { ethers } from 'ethers';
import { wethGatewayLegacyAbi } from '@neverland-money/contract-types';

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

/**
 * Simplified adapter for legacy WrappedTokenGatewayV3 contracts
 * that handles the ABI differences (extra interestRateMode parameters)
 */
export class WETHGatewayLegacyAdapter {
  readonly wethGatewayAddress: string;
  readonly provider: ethers.providers.Provider;
  readonly contract: ethers.Contract;
  readonly contractInterface: ethers.utils.Interface;

  constructor(
    provider: ethers.providers.Provider,
    _erc20Service: unknown, // For compatibility
    wethGatewayAddress: string
  ) {
    this.provider = provider;
    this.wethGatewayAddress = wethGatewayAddress;
    this.contractInterface = new ethers.utils.Interface(wethGatewayLegacyAbi as any);
    this.contract = new ethers.Contract(
      wethGatewayAddress,
      wethGatewayLegacyAbi as any,
      provider
    );
  }

  /**
   * Deposit ETH - returns PopulatedTransaction
   */
  async depositETH({
    lendingPool,
    user,
    amount,
    onBehalfOf,
    referralCode = '0',
  }: WETHDepositParamsType): Promise<ethers.PopulatedTransaction> {
    return this.contract.populateTransaction.depositETH!(
      lendingPool,
      onBehalfOf ?? user,
      referralCode,
      { value: amount }
    );
  }

  /**
   * Borrow ETH - legacy version with interestRateMode parameter
   */
  async borrowETH({
    lendingPool,
    amount,
    interestRateMode = InterestRate.Variable,
    referralCode = '0',
  }: LegacyWETHBorrowParamsType): Promise<ethers.PopulatedTransaction> {
    const numericRateMode = interestRateMode === InterestRate.Stable ? 1 : 2;

    const result = await this.contract.populateTransaction.borrowETH!(
      lendingPool,
      amount,
      numericRateMode,
      referralCode
    );
    return result;
  }

  /**
   * Repay ETH - legacy version with interestRateMode parameter
   */
  async repayETH({
    lendingPool,
    user,
    amount,
    onBehalfOf,
    interestRateMode = InterestRate.Variable,
  }: LegacyWETHRepayParamsType): Promise<ethers.PopulatedTransaction> {
    const numericRateMode = interestRateMode === InterestRate.Stable ? 1 : 2;

    return this.contract.populateTransaction.repayETH!(
      lendingPool,
      amount,
      numericRateMode,
      onBehalfOf ?? user,
      { value: amount }
    );
  }

  /**
   * Withdraw ETH - returns PopulatedTransaction
   */
  async withdrawETH({
    lendingPool,
    user,
    amount,
    onBehalfOf,
  }: WETHWithdrawParamsType): Promise<ethers.PopulatedTransaction> {
    return this.contract.populateTransaction.withdrawETH!(
      lendingPool,
      amount,
      onBehalfOf ?? user
    );
  }

  /**
   * Get the WETH/WMON token address
   */
  async getWETHAddress(): Promise<string> {
    return this.contract.getWETHAddress();
  }

  /**
   * Encode function data for legacy contract calls
   */
  encodeDepositETH(
    lendingPool: string,
    onBehalfOf: string,
    referralCode: string = '0'
  ): string {
    return this.contractInterface.encodeFunctionData('depositETH', [
      lendingPool,
      onBehalfOf,
      referralCode,
    ]);
  }

  encodeBorrowETH(
    lendingPool: string,
    amount: string,
    interestRateMode: InterestRate,
    referralCode: string = '0'
  ): string {
    return this.contractInterface.encodeFunctionData('borrowETH', [
      lendingPool,
      amount,
      interestRateMode,
      referralCode,
    ]);
  }

  encodeRepayETH(
    lendingPool: string,
    amount: string,
    interestRateMode: InterestRate,
    onBehalfOf: string
  ): string {
    return this.contractInterface.encodeFunctionData('repayETH', [
      lendingPool,
      amount,
      interestRateMode,
      onBehalfOf,
    ]);
  }

  encodeWithdrawETH(lendingPool: string, amount: string, to: string): string {
    return this.contractInterface.encodeFunctionData('withdrawETH', [
      lendingPool,
      amount,
      to,
    ]);
  }
}


