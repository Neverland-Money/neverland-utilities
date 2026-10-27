import { variableDebtTokenAbi } from '@neverland-money/contract-types';
import type { Contract, Interface, Provider, TransactionRequest } from 'ethers';
import { AbiBaseService } from '../commons/base-service';
import { estimateGas } from '../commons/gas-station';
import type {
  EthereumTransactionTypeExtended,
  tEthereumAddress,
  transactionType,
} from '../commons/types';
import { eEthereumTxType } from '../commons/types';
import { toUint256 } from '../commons/uint256';
import { decimalsToCurrencyUnits, valueToWei } from '../commons/utils';
import { DebtTokenValidator } from '../commons/validators/method-validators';
import { isEthAddress, isPositiveAmount } from '../commons/validators/param-validators';
import type { IERC20ServiceInterface } from '../erc20-contract';
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface BaseDebtTokenInterface {
  approveDelegation: (args: ApproveDelegationType) => EthereumTransactionTypeExtended;
  generateApproveDelegationTxData: (args: ApproveDelegationType) => TransactionRequest;
  approvedDelegationAmount: (args: Omit<ApproveDelegationType, 'amount'>) => Promise<string>;
  borrowAllowanceRaw: (args: Omit<ApproveDelegationType, 'amount'>) => Promise<bigint>;
  isDelegationApproved: (args: DelegationApprovedType) => Promise<boolean>;
}

export type ApproveDelegationType = {
  user: tEthereumAddress;
  delegatee: tEthereumAddress;
  debtTokenAddress: tEthereumAddress;
  amount: string; // Raw uint256 amount, including zero to revoke a delegation
};

export type DelegationApprovedType = {
  debtTokenAddress: tEthereumAddress;
  allowanceGiver: tEthereumAddress;
  allowanceReceiver: tEthereumAddress;
  amount: string; // normal  by default
  nativeDecimals?: boolean;
};

export class BaseDebtToken
  extends AbiBaseService<typeof variableDebtTokenAbi>
  implements BaseDebtTokenInterface
{
  readonly erc20Service: IERC20ServiceInterface;
  readonly debtTokenInterface: Interface;

  constructor(provider: Provider, erc20Service: IERC20ServiceInterface) {
    super(provider, variableDebtTokenAbi, undefined, estimateGas);
    this.erc20Service = erc20Service;
    this.debtTokenInterface = this.iface;
  }

  @DebtTokenValidator
  public approveDelegation(
    @isEthAddress('user')
    @isEthAddress('delegatee')
    @isEthAddress('debtTokenAddress')
    { user, delegatee, debtTokenAddress, amount }: ApproveDelegationType,
  ): EthereumTransactionTypeExtended {
    const delegationAmount = toUint256(amount, 'amount');
    const debtTokenContract: Contract = this.getContractInstance(debtTokenAddress);
    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: async () =>
        debtTokenContract.approveDelegation.populateTransaction(delegatee, delegationAmount),
      from: user,
    });

    return {
      tx: txCallback,
      txType: eEthereumTxType.ERC20_APPROVAL,
      gas: this.generateTxPriceEstimation([], txCallback),
    };
  }

  @DebtTokenValidator
  public async approvedDelegationAmount(
    @isEthAddress('user')
    @isEthAddress('delegatee')
    @isEthAddress('debtTokenAddress')
    { user, delegatee, debtTokenAddress }: Omit<ApproveDelegationType, 'amount'>,
  ): Promise<string> {
    const allowance = await this.borrowAllowanceRaw({ user, delegatee, debtTokenAddress });
    const decimals = await this.erc20Service.decimalsOf(debtTokenAddress);
    return decimalsToCurrencyUnits(allowance.toString(), decimals);
  }

  @DebtTokenValidator
  public generateApproveDelegationTxData(
    @isEthAddress('user')
    @isEthAddress('delegatee')
    @isEthAddress('debtTokenAddress')
    { user, delegatee, debtTokenAddress, amount }: ApproveDelegationType,
  ): TransactionRequest {
    const txData = this.debtTokenInterface.encodeFunctionData('approveDelegation', [
      delegatee,
      toUint256(amount, 'amount'),
    ]);
    const approveDelegationTx: TransactionRequest = {
      data: txData,
      to: debtTokenAddress,
      from: user,
    };
    return approveDelegationTx;
  }

  @DebtTokenValidator
  public async isDelegationApproved(
    @isEthAddress('debtTokenAddress')
    @isEthAddress('allowanceGiver')
    @isEthAddress('allowanceReceiver')
    @isPositiveAmount('amount')
    {
      debtTokenAddress,
      allowanceGiver,
      allowanceReceiver,
      amount,
      nativeDecimals,
    }: DelegationApprovedType,
  ): Promise<boolean> {
    const decimals: number = await this.erc20Service.decimalsOf(debtTokenAddress);
    const delegatedAllowance = await this.borrowAllowanceRaw({
      user: allowanceGiver,
      delegatee: allowanceReceiver,
      debtTokenAddress,
    });

    const amountBNWithDecimals: bigint = nativeDecimals
      ? BigInt(amount)
      : BigInt(valueToWei(amount, decimals));

    return delegatedAllowance >= amountBNWithDecimals;
  }

  @DebtTokenValidator
  public async borrowAllowanceRaw(
    @isEthAddress('user')
    @isEthAddress('delegatee')
    @isEthAddress('debtTokenAddress')
    { user, delegatee, debtTokenAddress }: Omit<ApproveDelegationType, 'amount'>,
  ): Promise<bigint> {
    return this.readContract(debtTokenAddress, 'borrowAllowance', [
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ABI address/hex typing preserves the public string API; ethers retains the existing runtime encoding and address validation.
      user as `0x${string}`,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ABI address/hex typing preserves the public string API; ethers retains the existing runtime encoding and address validation.
      delegatee as `0x${string}`,
    ]);
  }
}
