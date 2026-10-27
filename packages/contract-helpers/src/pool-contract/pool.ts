import { erc20Abi, poolAbi } from '@neverland-money/contract-types';
import type { Provider } from 'ethers';
import { Contract, Interface, MaxUint256, Signature, ZeroAddress } from 'ethers';
import { AbiBaseService } from '../commons/base-service';
import { estimateGasByNetwork } from '../commons/gas-station';
import type {
  EthereumTransactionTypeExtended,
  tEthereumAddress,
  transactionType,
} from '../commons/types';
import { eEthereumTxType, InterestRate, ProtocolAction } from '../commons/types';
import {
  API_ETH_MOCK_ADDRESS,
  DEFAULT_APPROVE_AMOUNT,
  getTxValue,
  valueToWei,
} from '../commons/utils';
import { PoolValidator } from '../commons/validators/method-validators';
import {
  is0OrPositiveAmount,
  isEthAddress,
  isPositiveAmount,
  isPositiveOrMinusOneAmount,
} from '../commons/validators/param-validators';
import type { IERC20ServiceInterface } from '../erc20-contract';
import { ERC20Service } from '../erc20-contract';
import type { ERC20_2612Interface } from '../erc20-permit-contract';
import { ERC20_2612Service } from '../erc20-permit-contract';
import type { WETHGatewayInterface } from '../wrapped-native-gateway-contract';
import { WETHGatewayService } from '../wrapped-native-gateway-contract';
import type {
  LPBorrowParamsType,
  LPRepayParamsType,
  LPRepayWithATokensType,
  LPRepayWithPermitParamsType,
  LPReserveData,
  LPSetUsageAsCollateral,
  LPSetUserEModeType,
  LPSupplyParamsType,
  LPSupplyWithPermitType,
  LPWithdrawParamsType,
  PoolRepayRawParams,
  PoolRepayWithPermitRawParams,
  PoolSupplyRawParams,
  PoolSupplyWithPermitRawParams,
} from './pool-types';
import {
  address,
  assertErc20Reserve,
  legacyRateMode,
  UINT256_MAX,
  unsignedDecimal,
} from './validation';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface PoolInterface {
  getReserveData: (reserve: tEthereumAddress) => Promise<LPReserveData>;
  deposit: (args: LPSupplyParamsType) => Promise<EthereumTransactionTypeExtended[]>;
  supply: (args: LPSupplyParamsType) => Promise<EthereumTransactionTypeExtended[]>;
  supplyWithPermit: (args: LPSupplyWithPermitType) => Promise<EthereumTransactionTypeExtended[]>;
  withdraw: (args: LPWithdrawParamsType) => Promise<EthereumTransactionTypeExtended[]>;
  borrow: (args: LPBorrowParamsType) => Promise<EthereumTransactionTypeExtended[]>;
  repay: (args: LPRepayParamsType) => Promise<EthereumTransactionTypeExtended[]>;
  repayWithPermit: (
    args: LPRepayWithPermitParamsType,
  ) => Promise<EthereumTransactionTypeExtended[]>;
  setUsageAsCollateral: (
    args: LPSetUsageAsCollateral,
  ) => Promise<EthereumTransactionTypeExtended[]>;
  repayWithATokens: (args: LPRepayWithATokensType) => Promise<EthereumTransactionTypeExtended[]>;
  setUserEMode: (args: LPSetUserEModeType) => EthereumTransactionTypeExtended[];
  supplyRaw(args: PoolSupplyRawParams): Promise<EthereumTransactionTypeExtended[]>;
  repayRaw(args: PoolRepayRawParams): Promise<EthereumTransactionTypeExtended[]>;
  supplyWithPermitRaw(
    args: PoolSupplyWithPermitRawParams,
  ): Promise<EthereumTransactionTypeExtended[]>;
  repayWithPermitRaw(
    args: PoolRepayWithPermitRawParams,
  ): Promise<EthereumTransactionTypeExtended[]>;
}

export type PoolConfig = {
  POOL: tEthereumAddress;
  WETH_GATEWAY?: tEthereumAddress;
};

function finiteAddress(value: string, name: string): string {
  const normalized = address(value, name);
  if (
    normalized === ZeroAddress ||
    normalized.toLowerCase() === API_ETH_MOCK_ADDRESS.toLowerCase()
  ) {
    throw new TypeError(
      `${name} must be a nonzero ERC20/pool/user address; native sentinels are unsupported`,
    );
  }

  return normalized;
}

function captureAmount(params: PoolSupplyRawParams) {
  const user = finiteAddress(params.user, 'user');
  const amountRaw = unsignedDecimal(params.amountRaw, 'amountRaw', UINT256_MAX - 1n);
  if (amountRaw === '0') throw new RangeError('amountRaw must be positive');
  return {
    user,
    reserve: finiteAddress(params.reserve, 'reserve'),
    amountRaw,
    onBehalfOf:
      params.onBehalfOf === undefined ? user : finiteAddress(params.onBehalfOf, 'onBehalfOf'),
  };
}

function zeroFirstFlag(value: boolean | undefined): boolean {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new TypeError('zeroFirst must be a boolean');
  }

  return value === true;
}

function numericRateMode(value: PoolRepayRawParams['interestRateMode']): 1 | 2 {
  if (value === InterestRate.Variable) return 2;
  if (value === InterestRate.Stable) return 1;
  throw new TypeError('interestRateMode must be InterestRate.Stable or InterestRate.Variable');
}

function finiteReferralCode(value: string | undefined): string {
  if (value === undefined) return '0';
  return unsignedDecimal(value, 'referralCode', 65_535n);
}

export class Pool extends AbiBaseService<typeof poolAbi> implements PoolInterface {
  readonly erc20Service: IERC20ServiceInterface;

  readonly poolAddress: string;

  readonly wethGatewayService: WETHGatewayInterface;

  readonly erc20_2612Service: ERC20_2612Interface;
  private readonly rawPoolInterface = new Interface(poolAbi);

  private readonly rawTokenInterface = new Interface(erc20Abi);

  constructor(provider: Provider, poolConfig?: PoolConfig) {
    super(provider, poolAbi, undefined, estimateGasByNetwork);
    const { POOL, WETH_GATEWAY } = poolConfig ?? {};
    this.poolAddress = POOL ?? '';
    this.erc20_2612Service = new ERC20_2612Service(provider);
    this.erc20Service = new ERC20Service(provider);
    this.wethGatewayService = new WETHGatewayService(provider, this.erc20Service, WETH_GATEWAY);
  }

  @PoolValidator
  public async getReserveData(
    @isEthAddress('reserve') reserve: tEthereumAddress,
  ): Promise<LPReserveData> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ABI address/hex typing preserves the public string API; ethers retains the existing runtime encoding and address validation.
    return this.readContract(this.poolAddress, 'getReserveData', [reserve as `0x${string}`]);
  }

  @PoolValidator
  public async deposit(
    @isEthAddress('user')
    @isEthAddress('reserve')
    @isPositiveAmount('amount')
    @isEthAddress('onBehalfOf')
    { user, reserve, amount, onBehalfOf, referralCode }: LPSupplyParamsType,
  ): Promise<EthereumTransactionTypeExtended[]> {
    if (reserve.toLowerCase() === API_ETH_MOCK_ADDRESS.toLowerCase()) {
      return this.wethGatewayService.depositETH({
        lendingPool: this.poolAddress,
        user,
        amount,
        onBehalfOf,
        referralCode,
      });
    }

    const { isApproved, approve, decimalsOf }: IERC20ServiceInterface = this.erc20Service;
    const txs: EthereumTransactionTypeExtended[] = [];
    const reserveDecimals: number = await decimalsOf(reserve);
    const convertedAmount: string = valueToWei(amount, reserveDecimals);

    const approved = await isApproved({
      token: reserve,
      user,
      spender: this.poolAddress,
      amount,
    });

    if (!approved) {
      const approveTx: EthereumTransactionTypeExtended = approve({
        user,
        token: reserve,
        spender: this.poolAddress,
        amount: DEFAULT_APPROVE_AMOUNT,
      });
      txs.push(approveTx);
    }

    const poolContract: Contract = this.getContractInstance(this.poolAddress);

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: async () =>
        poolContract.deposit.populateTransaction(
          reserve,
          convertedAmount,
          onBehalfOf ?? user,
          referralCode ?? '0',
        ),
      from: user,
      value: getTxValue(reserve, convertedAmount),
      action: ProtocolAction.supply,
    });

    txs.push({
      tx: txCallback,
      txType: eEthereumTxType.DLP_ACTION,
      gas: this.generateTxPriceEstimation(txs, txCallback, ProtocolAction.supply),
    });

    return txs;
  }

  @PoolValidator
  public async supply(
    @isEthAddress('user')
    @isEthAddress('reserve')
    @isPositiveAmount('amount')
    @isEthAddress('onBehalfOf')
    { user, reserve, amount, onBehalfOf, referralCode }: LPSupplyParamsType,
  ): Promise<EthereumTransactionTypeExtended[]> {
    if (reserve.toLowerCase() === API_ETH_MOCK_ADDRESS.toLowerCase()) {
      return this.wethGatewayService.depositETH({
        lendingPool: this.poolAddress,
        user,
        amount,
        onBehalfOf,
        referralCode,
      });
    }

    const { isApproved, approve, decimalsOf }: IERC20ServiceInterface = this.erc20Service;
    const txs: EthereumTransactionTypeExtended[] = [];
    const reserveDecimals: number = await decimalsOf(reserve);
    const convertedAmount: string = valueToWei(amount, reserveDecimals);

    const approved = await isApproved({
      token: reserve,
      user,
      spender: this.poolAddress,
      amount,
    });

    if (!approved) {
      const approveTx: EthereumTransactionTypeExtended = approve({
        user,
        token: reserve,
        spender: this.poolAddress,
        amount: DEFAULT_APPROVE_AMOUNT,
      });
      txs.push(approveTx);
    }

    const poolContract: Contract = this.getContractInstance(this.poolAddress);

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: async () =>
        poolContract.supply.populateTransaction(
          reserve,
          convertedAmount,
          onBehalfOf ?? user,
          referralCode ?? '0',
        ),
      from: user,
      value: getTxValue(reserve, convertedAmount),
      action: ProtocolAction.supply,
    });

    txs.push({
      tx: txCallback,
      txType: eEthereumTxType.DLP_ACTION,
      gas: this.generateTxPriceEstimation(txs, txCallback, ProtocolAction.supply),
    });

    return txs;
  }

  @PoolValidator
  public async supplyWithPermit(
    @isEthAddress('user')
    @isEthAddress('reserve')
    @isEthAddress('onBehalfOf')
    @isPositiveAmount('amount')
    @is0OrPositiveAmount('referralCode')
    {
      user,
      reserve,
      onBehalfOf,
      amount,
      referralCode,
      signature,
      deadline,
    }: LPSupplyWithPermitType,
  ): Promise<EthereumTransactionTypeExtended[]> {
    assertErc20Reserve(reserve, 'supplyWithPermit');
    const { v, r, s } = Signature.from(signature);
    const txs: EthereumTransactionTypeExtended[] = [];
    const { decimalsOf } = this.erc20Service;
    const poolContract: Contract = this.getContractInstance(this.poolAddress);
    const stakedTokenDecimals: number = await decimalsOf(reserve);
    const convertedAmount: string = valueToWei(amount, stakedTokenDecimals);

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: async () =>
        poolContract.supplyWithPermit.populateTransaction(
          reserve,
          convertedAmount,
          onBehalfOf ?? user,
          referralCode ?? 0,
          deadline,
          v,
          r,
          s,
        ),
      from: user,
      action: ProtocolAction.supplyWithPermit,
    });

    txs.push({
      tx: txCallback,
      txType: eEthereumTxType.DLP_ACTION,
      gas: this.generateTxPriceEstimation(txs, txCallback, ProtocolAction.supplyWithPermit),
    });

    return txs;
  }

  @PoolValidator
  public async withdraw(
    @isEthAddress('user')
    @isEthAddress('reserve')
    @isPositiveOrMinusOneAmount('amount')
    @isEthAddress('onBehalfOf')
    @isEthAddress('aTokenAddress')
    { user, reserve, amount, onBehalfOf, aTokenAddress }: LPWithdrawParamsType,
  ): Promise<EthereumTransactionTypeExtended[]> {
    if (reserve.toLowerCase() === API_ETH_MOCK_ADDRESS.toLowerCase()) {
      if (!aTokenAddress) {
        throw new Error('To withdraw ETH you need to pass the aWETH token address');
      }

      return this.wethGatewayService.withdrawETH({
        lendingPool: this.poolAddress,
        user,
        amount,
        onBehalfOf,
        aTokenAddress,
      });
    }

    const { decimalsOf }: IERC20ServiceInterface = this.erc20Service;
    const decimals: number = await decimalsOf(reserve);

    const convertedAmount: string =
      amount === '-1' ? MaxUint256.toString() : valueToWei(amount, decimals);

    const poolContract: Contract = this.getContractInstance(this.poolAddress);

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: async () =>
        poolContract.withdraw.populateTransaction(reserve, convertedAmount, onBehalfOf ?? user),
      from: user,
      action: ProtocolAction.withdraw,
    });

    return [
      {
        tx: txCallback,
        txType: eEthereumTxType.DLP_ACTION,
        gas: this.generateTxPriceEstimation([], txCallback, ProtocolAction.withdraw),
      },
    ];
  }

  @PoolValidator
  public async borrow(
    @isEthAddress('user')
    @isEthAddress('reserve')
    @isPositiveAmount('amount')
    @isEthAddress('debtTokenAddress')
    @isEthAddress('onBehalfOf')
    {
      user,
      reserve,
      amount,
      interestRateMode,
      debtTokenAddress,
      onBehalfOf,
      referralCode,
    }: LPBorrowParamsType,
  ): Promise<EthereumTransactionTypeExtended[]> {
    if (reserve.toLowerCase() === API_ETH_MOCK_ADDRESS.toLowerCase()) {
      if (!debtTokenAddress) {
        throw new Error(
          `To borrow ETH you need to pass the stable or variable WETH debt Token Address corresponding the interestRateMode`,
        );
      }

      return this.wethGatewayService.borrowETH({
        lendingPool: this.poolAddress,
        user,
        amount,
        debtTokenAddress,
        referralCode,
        interestRateMode,
      });
    }

    const { decimalsOf }: IERC20ServiceInterface = this.erc20Service;
    const reserveDecimals = await decimalsOf(reserve);
    const formatAmount: string = valueToWei(amount, reserveDecimals);

    const numericRateMode = legacyRateMode(interestRateMode);

    const poolContract = this.getContractInstance(this.poolAddress);

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: async () =>
        poolContract.borrow.populateTransaction(
          reserve,
          formatAmount,
          numericRateMode,
          referralCode ?? 0,
          onBehalfOf ?? user,
        ),
      from: user,
      action: ProtocolAction.borrow,
    });

    return [
      {
        tx: txCallback,
        txType: eEthereumTxType.DLP_ACTION,
        gas: this.generateTxPriceEstimation([], txCallback, ProtocolAction.borrow),
      },
    ];
  }

  @PoolValidator
  public async repay(
    @isEthAddress('user')
    @isEthAddress('reserve')
    @isPositiveOrMinusOneAmount('amount')
    @isEthAddress('onBehalfOf')
    { user, reserve, amount, interestRateMode, onBehalfOf }: LPRepayParamsType,
  ): Promise<EthereumTransactionTypeExtended[]> {
    if (reserve.toLowerCase() === API_ETH_MOCK_ADDRESS.toLowerCase()) {
      return this.wethGatewayService.repayETH({
        lendingPool: this.poolAddress,
        user,
        amount,
        onBehalfOf,
        interestRateMode,
      });
    }

    const txs: EthereumTransactionTypeExtended[] = [];
    const { isApproved, approve, decimalsOf }: IERC20ServiceInterface = this.erc20Service;

    const poolContract = this.getContractInstance(this.poolAddress);

    const numericRateMode = legacyRateMode(interestRateMode);
    const decimals: number = await decimalsOf(reserve);

    const convertedAmount: string =
      amount === '-1' ? MaxUint256.toString() : valueToWei(amount, decimals);

    const approved: boolean = await isApproved({
      token: reserve,
      user,
      spender: this.poolAddress,
      amount,
    });

    if (!approved) {
      const approveTx: EthereumTransactionTypeExtended = approve({
        user,
        token: reserve,
        spender: this.poolAddress,
        amount: DEFAULT_APPROVE_AMOUNT,
      });
      txs.push(approveTx);
    }

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: async () =>
        poolContract.repay.populateTransaction(
          reserve,
          convertedAmount,
          numericRateMode,
          onBehalfOf ?? user,
        ),
      from: user,
      value: getTxValue(reserve, convertedAmount),
      action: ProtocolAction.repay,
    });

    txs.push({
      tx: txCallback,
      txType: eEthereumTxType.DLP_ACTION,
      gas: this.generateTxPriceEstimation(txs, txCallback, ProtocolAction.repay),
    });

    return txs;
  }

  @PoolValidator
  public async repayWithPermit(
    @isEthAddress('user')
    @isEthAddress('reserve')
    @isPositiveOrMinusOneAmount('amount')
    @isEthAddress('onBehalfOf')
    {
      user,
      reserve,
      amount,
      interestRateMode,
      onBehalfOf,
      signature,
      deadline,
    }: LPRepayWithPermitParamsType,
  ): Promise<EthereumTransactionTypeExtended[]> {
    assertErc20Reserve(reserve, 'repayWithPermit');
    const { v, r, s } = Signature.from(signature);
    const txs: EthereumTransactionTypeExtended[] = [];
    const { decimalsOf }: IERC20ServiceInterface = this.erc20Service;

    const poolContract = this.getContractInstance(this.poolAddress);

    const numericRateMode = legacyRateMode(interestRateMode);
    const decimals: number = await decimalsOf(reserve);

    const convertedAmount: string =
      amount === '-1' ? MaxUint256.toString() : valueToWei(amount, decimals);

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: async () =>
        poolContract.repayWithPermit.populateTransaction(
          reserve,
          convertedAmount,
          numericRateMode,
          onBehalfOf ?? user,
          deadline,
          v,
          r,
          s,
        ),
      from: user,
      value: getTxValue(reserve, convertedAmount),
      action: ProtocolAction.repayWithPermit,
    });

    txs.push({
      tx: txCallback,
      txType: eEthereumTxType.DLP_ACTION,
      gas: this.generateTxPriceEstimation(txs, txCallback, ProtocolAction.repayWithPermit),
    });

    return txs;
  }

  @PoolValidator
  public async setUsageAsCollateral(
    @isEthAddress('user')
    @isEthAddress('reserve')
    { user, reserve, usageAsCollateral }: LPSetUsageAsCollateral,
  ): Promise<EthereumTransactionTypeExtended[]> {
    if (typeof usageAsCollateral !== 'boolean') {
      throw new TypeError('usageAsCollateral must be a boolean');
    }

    assertErc20Reserve(reserve, 'setUsageAsCollateral');
    const poolContract: Contract = this.getContractInstance(this.poolAddress);

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: async () =>
        poolContract.setUserUseReserveAsCollateral.populateTransaction(reserve, usageAsCollateral),
      from: user,
    });

    return [
      {
        tx: txCallback,
        txType: eEthereumTxType.DLP_ACTION,
        gas: this.generateTxPriceEstimation([], txCallback),
      },
    ];
  }

  @PoolValidator
  public async repayWithATokens(
    @isEthAddress('user')
    @isEthAddress('reserve')
    @isPositiveOrMinusOneAmount('amount')
    { user, amount, reserve, rateMode }: LPRepayWithATokensType,
  ): Promise<EthereumTransactionTypeExtended[]> {
    if (reserve.toLowerCase() === API_ETH_MOCK_ADDRESS.toLowerCase()) {
      throw new Error('Can not repay with aTokens with eth. Should be WETH instead');
    }

    const txs: EthereumTransactionTypeExtended[] = [];
    const { decimalsOf }: IERC20ServiceInterface = this.erc20Service;

    const poolContract = this.getContractInstance(this.poolAddress);

    const numericRateMode = legacyRateMode(rateMode);
    const decimals: number = await decimalsOf(reserve);

    const convertedAmount: string =
      amount === '-1' ? MaxUint256.toString() : valueToWei(amount, decimals);

    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: async () =>
        poolContract.repayWithATokens.populateTransaction(
          reserve,
          convertedAmount,
          numericRateMode,
        ),
      from: user,
      value: getTxValue(reserve, convertedAmount),
    });

    txs.push({
      tx: txCallback,
      txType: eEthereumTxType.DLP_ACTION,
      gas: this.generateTxPriceEstimation(txs, txCallback, ProtocolAction.repay),
    });

    return txs;
  }

  @PoolValidator
  public setUserEMode(
    @isEthAddress('user')
    @is0OrPositiveAmount('categoryId')
    { user, categoryId }: LPSetUserEModeType,
  ): EthereumTransactionTypeExtended[] {
    const poolContract = this.getContractInstance(this.poolAddress);
    const txCallback: () => Promise<transactionType> = this.generateTxCallback({
      rawTxMethod: async () => poolContract.setUserEMode.populateTransaction(categoryId),
      from: user,
    });

    return [
      {
        tx: txCallback,
        txType: eEthereumTxType.DLP_ACTION,
        gas: this.generateTxPriceEstimation([], txCallback, ProtocolAction.repay),
      },
    ];
  }

  async supplyRaw(params: PoolSupplyRawParams): Promise<EthereumTransactionTypeExtended[]> {
    const poolAddress = finiteAddress(this.poolAddress, 'POOL');
    const { user, reserve, amountRaw, onBehalfOf } = captureAmount(params);
    const referralCode = finiteReferralCode(params.referralCode);
    const zeroFirst = zeroFirstFlag(params.zeroFirst);
    const data = this.rawPoolInterface.encodeFunctionData('supply', [
      reserve,
      amountRaw,
      onBehalfOf,
      referralCode,
    ]);
    return this.withRawApprovals(
      { user, reserve, amountRaw },
      zeroFirst,
      data,
      poolAddress,
      ProtocolAction.supply,
    );
  }

  async repayRaw(params: PoolRepayRawParams): Promise<EthereumTransactionTypeExtended[]> {
    const poolAddress = finiteAddress(this.poolAddress, 'POOL');
    const { user, reserve, amountRaw, onBehalfOf } = captureAmount(params);
    const rateMode = numericRateMode(params.interestRateMode);
    const zeroFirst = zeroFirstFlag(params.zeroFirst);
    const data = this.rawPoolInterface.encodeFunctionData('repay', [
      reserve,
      amountRaw,
      rateMode,
      onBehalfOf,
    ]);
    return this.withRawApprovals(
      { user, reserve, amountRaw },
      zeroFirst,
      data,
      poolAddress,
      ProtocolAction.repay,
    );
  }

  async supplyWithPermitRaw(
    params: PoolSupplyWithPermitRawParams,
  ): Promise<EthereumTransactionTypeExtended[]> {
    const poolAddress = finiteAddress(this.poolAddress, 'POOL');
    const { user, reserve, amountRaw, onBehalfOf } = captureAmount(params);
    const referralCode = finiteReferralCode(params.referralCode);
    const deadline = unsignedDecimal(params.deadline, 'deadline', UINT256_MAX, true);
    const { v, r, s } = Signature.from(params.signature);
    const data = this.rawPoolInterface.encodeFunctionData('supplyWithPermit', [
      reserve,
      amountRaw,
      onBehalfOf,
      referralCode,
      deadline,
      v,
      r,
      s,
    ]);
    return [
      this.rawTransaction(
        { to: poolAddress, from: user, data },
        ProtocolAction.supplyWithPermit,
        eEthereumTxType.DLP_ACTION,
      ),
    ];
  }

  async repayWithPermitRaw(
    params: PoolRepayWithPermitRawParams,
  ): Promise<EthereumTransactionTypeExtended[]> {
    const poolAddress = finiteAddress(this.poolAddress, 'POOL');
    const { user, reserve, amountRaw, onBehalfOf } = captureAmount(params);
    const rateMode = numericRateMode(params.interestRateMode);
    const deadline = unsignedDecimal(params.deadline, 'deadline', UINT256_MAX, true);
    const { v, r, s } = Signature.from(params.signature);
    const data = this.rawPoolInterface.encodeFunctionData('repayWithPermit', [
      reserve,
      amountRaw,
      rateMode,
      onBehalfOf,
      deadline,
      v,
      r,
      s,
    ]);
    return [
      this.rawTransaction(
        { to: poolAddress, from: user, data },
        ProtocolAction.repayWithPermit,
        eEthereumTxType.DLP_ACTION,
      ),
    ];
  }

  // eslint-disable-next-line max-params -- Preserve the existing positional signature and argument order used by callers.
  private async withRawApprovals(
    { user, reserve, amountRaw }: Pick<PoolSupplyRawParams, 'user' | 'reserve' | 'amountRaw'>,
    zeroFirst: boolean,
    data: string,
    poolAddress: string,
    action: ProtocolAction,
  ): Promise<EthereumTransactionTypeExtended[]> {
    const allowance = await this.erc20Service.allowanceRaw({
      user,
      token: reserve,
      spender: poolAddress,
    });
    const txs: EthereumTransactionTypeExtended[] = [];
    if (allowance < BigInt(amountRaw)) {
      const amounts = zeroFirst && allowance !== 0n ? ['0', amountRaw] : [amountRaw];
      for (const amount of amounts) {
        const approval = this.rawTokenInterface.encodeFunctionData('approve', [
          poolAddress,
          amount,
        ]);
        // Snapshot the earlier approvals so an approval's own gas() estimates instead of using the
        // pending-approval table value.
        txs.push(
          this.rawTransaction(
            { to: reserve, from: user, data: approval },
            ProtocolAction.approval,
            eEthereumTxType.ERC20_APPROVAL,
            [...txs],
          ),
        );
      }
    }

    txs.push(
      this.rawTransaction(
        { to: poolAddress, from: user, data },
        action,
        eEthereumTxType.DLP_ACTION,
        [...txs],
      ),
    );
    return txs;
  }

  private rawTransaction(
    { to, from, data }: { to: string; from: string; data: string },
    action: ProtocolAction,
    txType: eEthereumTxType,
    previousTransactions: EthereumTransactionTypeExtended[] = [],
  ): EthereumTransactionTypeExtended {
    const callback = this.generateTxCallback({
      rawTxMethod: async () => ({ to, data }),
      from,
      action,
    });
    return {
      tx: callback,
      txType,
      gas: this.generateTxPriceEstimation(previousTransactions, callback, action),
    };
  }
}
