import { wethGatewayLegacyAbi } from '@neverland-money/contract-types';
import type { Interface, Provider, TransactionRequest } from 'ethers';
import { MaxUint256, ZeroAddress } from 'ethers';
import { AbiBaseService } from '../commons/base-service';
import { estimateGas } from '../commons/gas-station';
import type {
  EthereumTransactionTypeExtended,
  tEthereumAddress,
  transactionType,
} from '../commons/types';
import { eEthereumTxType, InterestRate, ProtocolAction } from '../commons/types';
import { valueToWei } from '../commons/utils';
import { WETHValidator } from '../commons/validators/method-validators';
import {
  is0OrPositiveAmount,
  isEthAddress,
  isPositiveAmount,
  isPositiveOrMinusOneAmount,
} from '../commons/validators/param-validators';
import type { BaseDebtTokenInterface } from '../debt-token-contract';
import { BaseDebtToken } from '../debt-token-contract';
import type { IERC20ServiceInterface } from '../erc20-contract';
import { WETHGatewayLegacyAdapter } from '../weth-gateway-legacy-contract';
export type WETHDepositParamsType = {
  lendingPool: tEthereumAddress;
  user: tEthereumAddress;
  amount: string; // normal
  onBehalfOf?: tEthereumAddress;
  referralCode?: string;
};

export type WETHWithdrawParamsType = {
  lendingPool: tEthereumAddress;
  user: tEthereumAddress;
  amount: string;
  aTokenAddress: tEthereumAddress;
  onBehalfOf?: tEthereumAddress;
};

export type WETHRepayParamsType = {
  interestRateMode: InterestRate;
  lendingPool: tEthereumAddress;
  user: tEthereumAddress;
  amount: string;
  onBehalfOf?: tEthereumAddress;
};

export type WETHBorrowParamsType = {
  interestRateMode: InterestRate;
  lendingPool: tEthereumAddress;
  user: tEthereumAddress;
  amount: string;
  debtTokenAddress?: tEthereumAddress;
  referralCode?: string;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface WETHGatewayInterface {
  generateDepositEthTxData: (args: WETHDepositParamsType) => TransactionRequest;
  generateBorrowEthTxData: (args: WETHBorrowParamsType) => TransactionRequest;
  generateRepayEthTxData: (args: WETHRepayParamsType) => TransactionRequest;
  depositETH: (args: WETHDepositParamsType) => EthereumTransactionTypeExtended[];
  withdrawETH: (args: WETHWithdrawParamsType) => Promise<EthereumTransactionTypeExtended[]>;
  repayETH: (args: WETHRepayParamsType) => EthereumTransactionTypeExtended[];
  borrowETH: (args: WETHBorrowParamsType) => Promise<EthereumTransactionTypeExtended[]>;
}

export class WETHGatewayService
  extends AbiBaseService<typeof wethGatewayLegacyAbi>
  implements WETHGatewayInterface
{
  readonly wethGatewayAddress: string;

  readonly baseDebtTokenService: BaseDebtTokenInterface;

  readonly erc20Service: IERC20ServiceInterface;

  readonly wethGatewayInstance: Interface;

  generateDepositEthTxData: (args: WETHDepositParamsType) => TransactionRequest;

  generateBorrowEthTxData: (args: WETHBorrowParamsType) => TransactionRequest;

  generateRepayEthTxData: (args: WETHRepayParamsType) => TransactionRequest;

  private readonly adapter: WETHGatewayLegacyAdapter;

  constructor(
    provider: Provider,
    erc20Service: IERC20ServiceInterface,
    wethGatewayAddress?: string,
  ) {
    super(provider, wethGatewayLegacyAbi, undefined, estimateGas);
    this.erc20Service = erc20Service;

    this.baseDebtTokenService = new BaseDebtToken(this.provider, this.erc20Service);

    this.wethGatewayAddress = wethGatewayAddress ?? '';
    this.adapter = new WETHGatewayLegacyAdapter(
      provider,
      erc20Service,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- An empty legacy gateway address must retain the existing zero-address fallback.
      wethGatewayAddress || ZeroAddress,
    );

    this.depositETH = this.depositETH.bind(this);
    this.withdrawETH = this.withdrawETH.bind(this);
    this.repayETH = this.repayETH.bind(this);
    this.borrowETH = this.borrowETH.bind(this);
    this.wethGatewayInstance = this.iface;
    this.generateDepositEthTxData = (args: WETHDepositParamsType): TransactionRequest => {
      const txData = this.adapter.encodeDepositETH(
        args.lendingPool,
        args.onBehalfOf ?? args.user,
        args.referralCode ?? '0',
      );
      const actionTx: TransactionRequest = {
        data: txData,
        to: this.wethGatewayAddress,
        from: args.user,
        value: BigInt(args.amount),
      };
      return actionTx;
    };

    this.generateBorrowEthTxData = (args: WETHBorrowParamsType): TransactionRequest => {
      const txData = this.adapter.encodeBorrowETH(
        args.lendingPool,
        args.amount,
        args.interestRateMode,
        args.referralCode ?? '0',
      );
      const actionTx: TransactionRequest = {
        data: txData,
        to: this.wethGatewayAddress,
        from: args.user,
      };
      return actionTx;
    };

    this.generateRepayEthTxData = ({ lendingPool, amount, user, onBehalfOf, interestRateMode }) => {
      const txData = this.adapter.encodeRepayETH(
        lendingPool,
        amount,
        interestRateMode,
        onBehalfOf ?? user,
      );
      const actionTx: TransactionRequest = {
        data: txData,
        to: this.wethGatewayAddress,
        from: user,
        value: BigInt(amount),
      };
      return actionTx;
    };
  }

  @WETHValidator
  public depositETH(
    @isEthAddress('lendingPool')
    @isEthAddress('user')
    @isEthAddress('onBehalfOf')
    @isPositiveAmount('amount')
    @is0OrPositiveAmount('referralCode')
    { lendingPool, user, amount, onBehalfOf, referralCode }: WETHDepositParamsType,
  ): EthereumTransactionTypeExtended[] {
    const convertedAmount: string = valueToWei(amount, 18);
    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: async () => ({
        to: this.wethGatewayAddress,
        data: this.adapter.encodeDepositETH(lendingPool, onBehalfOf ?? user, referralCode ?? '0'),
      }),
      from: user,
      value: convertedAmount,
    });

    return [
      {
        tx: txCallback,
        txType: eEthereumTxType.DLP_ACTION,
        gas: this.generateTxPriceEstimation([], txCallback),
      },
    ];
  }

  @WETHValidator
  public async borrowETH(
    @isEthAddress('lendingPool')
    @isEthAddress('user')
    @isPositiveAmount('amount')
    @isEthAddress('debtTokenAddress')
    @is0OrPositiveAmount('referralCode')
    {
      lendingPool,
      user,
      amount,
      debtTokenAddress,
      referralCode,
      interestRateMode,
    }: WETHBorrowParamsType,
  ): Promise<EthereumTransactionTypeExtended[]> {
    const txs: EthereumTransactionTypeExtended[] = [];
    const convertedAmount: string = valueToWei(amount, 18);
    if (!debtTokenAddress) {
      throw new Error(`To borrow ETH you need to pass the variable WETH debt Token Address`);
    }

    const delegationApproved: boolean = await this.baseDebtTokenService.isDelegationApproved({
      debtTokenAddress,
      allowanceGiver: user,
      allowanceReceiver: this.wethGatewayAddress,
      amount,
    });

    if (!delegationApproved) {
      const approveDelegationTx: EthereumTransactionTypeExtended =
        this.baseDebtTokenService.approveDelegation({
          user,
          delegatee: this.wethGatewayAddress,
          debtTokenAddress,
          amount: MaxUint256.toString(),
        });

      txs.push(approveDelegationTx);
    }

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: async () => ({
        to: this.wethGatewayAddress,
        data: this.adapter.encodeBorrowETH(
          lendingPool,
          convertedAmount,
          interestRateMode,
          referralCode ?? '0',
        ),
      }),
      from: user,
    });

    txs.push({
      tx: txCallback,
      txType: eEthereumTxType.DLP_ACTION,
      gas: this.generateTxPriceEstimation(txs, txCallback, ProtocolAction.borrowETH),
    });

    return txs;
  }

  @WETHValidator
  public async withdrawETH(
    @isEthAddress('lendingPool')
    @isEthAddress('user')
    @isEthAddress('onBehalfOf')
    @isPositiveOrMinusOneAmount('amount')
    @isEthAddress('aTokenAddress')
    { lendingPool, user, amount, onBehalfOf, aTokenAddress }: WETHWithdrawParamsType,
  ): Promise<EthereumTransactionTypeExtended[]> {
    const txs: EthereumTransactionTypeExtended[] = [];
    const { isApproved, approve }: IERC20ServiceInterface = this.erc20Service;
    const convertedAmount: string =
      amount === '-1' ? MaxUint256.toString() : valueToWei(amount, 18);

    const approved: boolean = await isApproved({
      token: aTokenAddress,
      user,
      spender: this.wethGatewayAddress,
      amount,
    });

    if (!approved) {
      const approveTx: EthereumTransactionTypeExtended = approve({
        user,
        token: aTokenAddress,
        spender: this.wethGatewayAddress,
        amount: MaxUint256.toString(),
      });
      txs.push(approveTx);
    }

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: async () => ({
        to: this.wethGatewayAddress,
        data: this.adapter.encodeWithdrawETH(lendingPool, convertedAmount, onBehalfOf ?? user),
      }),
      from: user,
    });

    txs.push({
      tx: txCallback,
      txType: eEthereumTxType.DLP_ACTION,
      gas: this.generateTxPriceEstimation(txs, txCallback, ProtocolAction.withdrawETH),
    });

    return txs;
  }

  @WETHValidator
  public repayETH(
    @isEthAddress('lendingPool')
    @isEthAddress('user')
    @isEthAddress('onBehalfOf')
    @isPositiveAmount('amount')
    { lendingPool, user, amount, onBehalfOf, interestRateMode }: WETHRepayParamsType,
  ): EthereumTransactionTypeExtended[] {
    const convertedAmount: string = valueToWei(amount, 18);

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: async () => ({
        to: this.wethGatewayAddress,
        data: this.adapter.encodeRepayETH(
          lendingPool,
          convertedAmount,
          interestRateMode,
          onBehalfOf ?? user,
        ),
      }),
      gasSurplus: 30,
      from: user,
      value: convertedAmount,
    });

    return [
      {
        tx: txCallback,
        txType: eEthereumTxType.DLP_ACTION,
        gas: this.generateTxPriceEstimation([], txCallback),
      },
    ];
  }
}
