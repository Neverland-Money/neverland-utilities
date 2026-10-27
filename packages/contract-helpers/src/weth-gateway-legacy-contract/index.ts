import { wethGatewayLegacyAbi } from '@neverland-money/contract-types';
import type { ethers } from 'ethers';
import { AbiBaseService } from '../commons/base-service';
import { InterestRate } from '../interest-rate';
import type {
  LegacyWETHBorrowParamsType,
  LegacyWETHRepayParamsType,
  WETHDepositParamsType,
  WETHWithdrawParamsType,
} from './types';

/**
 * Simplified adapter for legacy WrappedTokenGatewayV3 contracts
 * that handles the ABI differences (extra interestRateMode parameters)
 */
export class WETHGatewayLegacyAdapter extends AbiBaseService<typeof wethGatewayLegacyAbi> {
  readonly wethGatewayAddress: string;
  readonly provider: ethers.Provider;
  readonly contract: ethers.Contract;
  readonly contractInterface: ethers.Interface;

  constructor(
    provider: ethers.Provider,
    _erc20Service: unknown, // For compatibility
    wethGatewayAddress: string,
  ) {
    super(provider, wethGatewayLegacyAbi, wethGatewayAddress);
    this.provider = provider;
    this.wethGatewayAddress = wethGatewayAddress;
    this.contractInterface = this.iface;
    this.contract = this.getContractInstance(wethGatewayAddress);
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
  }: WETHDepositParamsType): Promise<ethers.TransactionRequest> {
    return this.contract.depositETH.populateTransaction(
      lendingPool,
      onBehalfOf ?? user,
      referralCode,
      { value: amount },
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
  }: LegacyWETHBorrowParamsType): Promise<ethers.TransactionRequest> {
    const numericRateMode = interestRateMode === InterestRate.Stable ? 1 : 2;
    const result = await this.contract.borrowETH.populateTransaction(
      lendingPool,
      amount,
      numericRateMode,
      referralCode,
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
  }: LegacyWETHRepayParamsType): Promise<ethers.TransactionRequest> {
    const numericRateMode = interestRateMode === InterestRate.Stable ? 1 : 2;
    return this.contract.repayETH.populateTransaction(
      lendingPool,
      amount,
      numericRateMode,
      onBehalfOf ?? user,
      { value: amount },
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
  }: WETHWithdrawParamsType): Promise<ethers.TransactionRequest> {
    return this.contract.withdrawETH.populateTransaction(lendingPool, amount, onBehalfOf ?? user);
  }

  /**
   * Get the WETH/WMON token address
   */
  async getWETHAddress(): Promise<string> {
    return this.readContract(this.wethGatewayAddress, 'getWETHAddress', []);
  }

  /**
   * Encode function data for legacy contract calls
   */
  encodeDepositETH(lendingPool: string, onBehalfOf: string, referralCode = '0'): string {
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
    referralCode = '0',
  ): string {
    return this.contractInterface.encodeFunctionData('borrowETH', [
      lendingPool,
      amount,
      interestRateMode === InterestRate.Stable ? 1 : 2,
      referralCode,
    ]);
  }

  encodeRepayETH(
    lendingPool: string,
    amount: string,
    interestRateMode: InterestRate,
    onBehalfOf: string,
  ): string {
    return this.contractInterface.encodeFunctionData('repayETH', [
      lendingPool,
      amount,
      interestRateMode === InterestRate.Stable ? 1 : 2,
      onBehalfOf,
    ]);
  }

  encodeWithdrawETH(lendingPool: string, amount: string, to: string): string {
    return this.contractInterface.encodeFunctionData('withdrawETH', [lendingPool, amount, to]);
  }
}
