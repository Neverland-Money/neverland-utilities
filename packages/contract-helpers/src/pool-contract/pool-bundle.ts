import { poolAbi } from '@neverland-money/contract-types';
import type { Provider, TransactionRequest } from 'ethers';
import { type Interface, MaxUint256, Signature } from 'ethers';

import { AbiBaseService } from '../commons/base-service';
import { estimateGasByNetwork } from '../commons/gas-station';
import {
  type BorrowTxBuilder,
  type RepayTxBuilder,
  type RepayWithATokensTxBuilder,
  type tEthereumAddress,
} from '../commons/types';
import { API_ETH_MOCK_ADDRESS } from '../commons/utils';
import {
  type ApproveType,
  ERC20Service,
  type IERC20ServiceInterface,
  type TokenOwner,
} from '../erc20-contract';
import { type ERC20_2612Interface, ERC20_2612Service } from '../erc20-permit-contract';
import { type WETHGatewayInterface, WETHGatewayService } from '../wrapped-native-gateway-contract';
import { Pool, type PoolConfig, type PoolInterface } from './pool';
import {
  type LPBorrowParamsType,
  type LPSignedSupplyParamsType,
  type LPSupplyParamsType,
} from './pool-types';
import { assertNonZeroAddress, legacyRateMode } from './validation';

export type SupplyTxBuilder = {
  generateTxData: ({
    user,
    reserve,
    amount,
    onBehalfOf,
    referralCode,
  }: LPSupplyParamsType) => TransactionRequest;
  generateSignedTxData: ({
    user,
    reserve,
    amount,
    onBehalfOf,
    referralCode,
    signature,
  }: LPSignedSupplyParamsType) => TransactionRequest;
  getApprovedAmount: ({ user, token }: TokenOwner) => Promise<ApproveType>;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface PoolBundleInterface {
  supplyTxBuilder: SupplyTxBuilder;
}

export class PoolBundle extends AbiBaseService<typeof poolAbi> implements PoolBundleInterface {
  readonly erc20Service: IERC20ServiceInterface;

  readonly poolAddress: tEthereumAddress;

  readonly wethGatewayService: WETHGatewayInterface;

  readonly erc20_2612Service: ERC20_2612Interface;

  readonly poolService: PoolInterface;

  readonly wethGatewayAddress: tEthereumAddress;

  readonly contractInterface: Interface;

  supplyTxBuilder: SupplyTxBuilder;
  borrowTxBuilder: BorrowTxBuilder;
  repayTxBuilder: RepayTxBuilder;
  repayWithATokensTxBuilder: RepayWithATokensTxBuilder;

  constructor(provider: Provider, poolConfig?: PoolConfig) {
    super(provider, poolAbi, undefined, estimateGasByNetwork);

    const { POOL, WETH_GATEWAY } = poolConfig ?? {};

    this.poolAddress = POOL ?? '';
    this.wethGatewayAddress = WETH_GATEWAY ?? '';
    this.poolService = new Pool(provider, poolConfig);

    // initialize services
    this.erc20_2612Service = new ERC20_2612Service(provider);
    this.erc20Service = new ERC20Service(provider);
    this.wethGatewayService = new WETHGatewayService(provider, this.erc20Service, WETH_GATEWAY);

    this.contractInterface = this.iface;

    this.supplyTxBuilder = {
      /** Allowance in normalized token units, or '-1' when unlimited or native; generateTxData takes raw base units. */
      getApprovedAmount: async (props: TokenOwner): Promise<ApproveType> => {
        const spender =
          props.token.toLowerCase() === API_ETH_MOCK_ADDRESS.toLowerCase()
            ? this.wethGatewayAddress
            : this.poolAddress;
        const amount = await this.erc20Service.approvedAmount({
          ...props,
          spender,
        });
        return {
          ...props,
          spender,
          amount: amount.toString(),
        };
      },
      generateTxData: ({
        user,
        reserve,
        amount,
        onBehalfOf,
        referralCode,
      }: LPSupplyParamsType): TransactionRequest => {
        let actionTx: TransactionRequest = {};
        const onBehalfOfParam = onBehalfOf ?? user;
        assertNonZeroAddress(onBehalfOfParam, 'onBehalfOf');
        const referralCodeParam = referralCode ?? '0';
        if (reserve.toLowerCase() === API_ETH_MOCK_ADDRESS.toLowerCase()) {
          actionTx = this.wethGatewayService.generateDepositEthTxData({
            lendingPool: this.poolAddress,
            user,
            amount,
            onBehalfOf: onBehalfOfParam,
            referralCode: referralCodeParam,
          });
        } else {
          const txData = this.contractInterface.encodeFunctionData('supply', [
            reserve,
            amount,
            onBehalfOfParam,
            referralCodeParam,
          ]);
          actionTx.to = this.poolAddress;
          actionTx.from = user;
          actionTx.data = txData;
        }

        return actionTx;
      },
      generateSignedTxData: ({
        user,
        reserve,
        amount,
        onBehalfOf,
        referralCode,
        signature,
        deadline,
      }: LPSignedSupplyParamsType): TransactionRequest => {
        const decomposedSignature: Signature = Signature.from(signature);
        const populatedTx: TransactionRequest = {};
        const onBehalfOfParam = onBehalfOf ?? user;
        assertNonZeroAddress(onBehalfOfParam, 'onBehalfOf');
        const referralCodeParam = referralCode ?? '0';
        const txData = this.contractInterface.encodeFunctionData('supplyWithPermit', [
          reserve,
          amount,
          onBehalfOfParam,
          referralCodeParam,
          deadline,
          decomposedSignature.v,
          decomposedSignature.r,
          decomposedSignature.s,
        ]);
        populatedTx.to = this.poolAddress;
        populatedTx.from = user;
        populatedTx.data = txData;

        return populatedTx;
      },
    };

    this.borrowTxBuilder = {
      generateTxData: ({
        user,
        reserve,
        amount,
        interestRateMode,
        debtTokenAddress,
        onBehalfOf,
        referralCode,
      }: LPBorrowParamsType): TransactionRequest => {
        let actionTx: TransactionRequest = {};
        const referralCodeParam = referralCode ?? '0';
        const onBehalfOfParam = onBehalfOf ?? user;
        assertNonZeroAddress(onBehalfOfParam, 'onBehalfOf');
        const numericRateMode = legacyRateMode(interestRateMode);
        if (reserve.toLowerCase() === API_ETH_MOCK_ADDRESS.toLowerCase()) {
          if (!debtTokenAddress) {
            throw new Error(
              `To borrow ETH you need to pass the stable or variable WETH debt Token Address corresponding the interestRateMode`,
            );
          }

          actionTx = this.wethGatewayService.generateBorrowEthTxData({
            lendingPool: this.poolAddress,
            user,
            amount,
            debtTokenAddress,
            referralCode: referralCodeParam,
            interestRateMode,
          });
        } else {
          const txData = this.contractInterface.encodeFunctionData('borrow', [
            reserve,
            amount,
            numericRateMode,
            referralCodeParam,
            onBehalfOfParam,
          ]);
          actionTx.to = this.poolAddress;
          actionTx.from = user;
          actionTx.data = txData;
        }

        return actionTx;
      },
    };

    this.repayTxBuilder = {
      generateTxData: ({ user, reserve, amount, interestRateMode, onBehalfOf }) => {
        const numericRateMode = legacyRateMode(interestRateMode);
        const onBehalfOfParam = onBehalfOf ?? user;
        assertNonZeroAddress(onBehalfOfParam, 'onBehalfOf');
        if (reserve.toLowerCase() === API_ETH_MOCK_ADDRESS.toLowerCase()) {
          return this.wethGatewayService.generateRepayEthTxData({
            lendingPool: this.poolAddress,
            user,
            amount,
            onBehalfOf: onBehalfOfParam,
            interestRateMode,
          });
        }

        const actionTx: TransactionRequest = {};
        const txData = this.contractInterface.encodeFunctionData('repay', [
          reserve,
          amount === '-1' ? MaxUint256.toString() : amount,
          numericRateMode,
          onBehalfOfParam,
        ]);
        actionTx.to = this.poolAddress;
        actionTx.from = user;
        actionTx.data = txData;
        return actionTx;
      },
      generateSignedTxData: ({
        onBehalfOf,
        signature,
        deadline,
        user,
        reserve,
        amount,
        interestRateMode,
      }) => {
        const decomposedSignature: Signature = Signature.from(signature);
        const populatedTx: TransactionRequest = {};
        const numericRateMode = legacyRateMode(interestRateMode);
        const onBehalfOfParam = onBehalfOf ?? user;
        assertNonZeroAddress(onBehalfOfParam, 'onBehalfOf');

        const txData = this.contractInterface.encodeFunctionData('repayWithPermit', [
          reserve,
          amount === '-1' ? MaxUint256.toString() : amount,
          numericRateMode,
          onBehalfOfParam,
          deadline,
          decomposedSignature.v,
          decomposedSignature.r,
          decomposedSignature.s,
        ]);
        populatedTx.to = this.poolAddress;
        populatedTx.from = user;
        populatedTx.data = txData;
        return populatedTx;
      },
    };

    this.repayWithATokensTxBuilder = {
      generateTxData: ({ rateMode, user, amount, reserve }) => {
        const actionTx: TransactionRequest = {};
        const numericRateMode = legacyRateMode(rateMode);
        if (reserve.toLowerCase() === API_ETH_MOCK_ADDRESS.toLowerCase()) {
          throw new Error('Can not repay with aTokens with eth. Should be WETH instead');
        }

        const txData = this.contractInterface.encodeFunctionData('repayWithATokens', [
          reserve,
          amount === '-1' ? MaxUint256.toString() : amount,
          numericRateMode,
        ]);
        actionTx.to = this.poolAddress;
        actionTx.from = user;
        actionTx.data = txData;

        return actionTx;
      },
    };
  }
}
