import type {
  Abi,
  AbiParametersToPrimitiveTypes,
  ExtractAbiFunction,
  ExtractAbiFunctionNames,
} from 'abitype';
import type { Provider, TransactionRequest } from 'ethers';
import { Contract, Interface, getBigInt } from 'ethers';
import type {
  GasResponse,
  TransactionGenerationMethod,
  TransactionGenerationMethodNew,
  transactionType,
} from './types';
import { ProtocolAction, eEthereumTxType } from './types';
import { DEFAULT_NULL_VALUE_ON_TX, gasLimitRecommendations } from './utils';

export { ProtocolAction, eEthereumTxType } from './types';
export type {
  GasResponse,
  GasType,
  TransactionGenerationMethod,
  tEthereumAddress,
  transactionType,
} from './types';

/** Ethers decodes every ABI integer width to bigint, including uint8/uint16. */
export type EthersOutput<T> = T extends number
  ? bigint
  : T extends readonly unknown[]
    ? { readonly [K in keyof T]: EthersOutput<T[K]> }
    : T extends object
      ? { readonly [K in keyof T]: EthersOutput<T[K]> }
      : T;
export type AbiReadOutputs<A extends Abi, N extends ExtractAbiFunctionNames<A>> = EthersOutput<
  AbiParametersToPrimitiveTypes<ExtractAbiFunction<A, N>['outputs'], 'outputs'>
>;
type AbiReadReturn<A extends Abi, N extends ExtractAbiFunctionNames<A>> =
  AbiReadOutputs<A, N> extends readonly [infer Value] ? Value : AbiReadOutputs<A, N>;
export type GasEstimator = (
  tx: TransactionRequest,
  provider: Provider,
  surplus?: number,
) => Promise<bigint>;

/** Actions without a table entry, such as setEModeUsage, fall back to the default recommendation. */
function gasRecommendation(action: ProtocolAction = ProtocolAction.default): {
  limit: string;
  recommended: string;
} {
  return action in gasLimitRecommendations
    ? gasLimitRecommendations[action]
    : gasLimitRecommendations[ProtocolAction.default];
}

/** One ABI/ethers service shared by the native and lending helpers. */
export class AbiBaseService<A extends Abi> {
  readonly contractInstances: Record<string, Contract> = {};
  readonly iface: Interface;

  constructor(
    readonly provider: Provider,
    readonly abi: A,
    readonly defaultAddress?: string,
    private readonly gasEstimator: GasEstimator = async (tx, runner) => runner.estimateGas(tx),
  ) {
    this.iface = new Interface(JSON.stringify(abi));
  }

  public getContractInstance = (address: string): Contract => {
    this.contractInstances[address] ||= new Contract(address, this.iface, this.provider);
    return this.contractInstances[address];
  };

  readonly generateTxCallback =
    ({
      rawTxMethod,
      from,
      value,
      gasSurplus,
      action,
    }: TransactionGenerationMethod): (() => Promise<transactionType>) =>
    async () => {
      const tx = { ...(await rawTxMethod()), from, value: value ?? DEFAULT_NULL_VALUE_ON_TX };
      let gasLimit = await this.gasEstimator(tx, this.provider, gasSurplus);
      if (
        action &&
        gasLimitRecommendations[action] &&
        gasLimit <= BigInt(gasLimitRecommendations[action].limit)
      )
        gasLimit = BigInt(gasLimitRecommendations[action].recommended);
      return { ...tx, gasLimit };
    };

  readonly generateTxPriceEstimation =
    (
      txs: Array<{ txType: eEthereumTxType }>,
      callback: () => Promise<transactionType>,
      action: ProtocolAction = ProtocolAction.default,
    ): GasResponse =>
    async (force = false) => {
      const { gasPrice } = await this.provider.getFeeData();
      if (gasPrice === null) throw new Error('Gas price is unavailable');
      if (!txs.some(tx => tx.txType === eEthereumTxType.ERC20_APPROVAL) || force) {
        const tx = await callback();
        if (!tx.gasLimit) throw new Error('Transaction calculation error');
        return {
          gasLimit: tx.gasLimit.toString(),
          gasPrice:
            tx.gasPrice === null || tx.gasPrice === undefined
              ? gasPrice.toString()
              : tx.gasPrice.toString(),
        };
      }

      return {
        gasLimit: gasRecommendation(action).recommended,
        gasPrice: gasPrice.toString(),
      };
    };

  readonly estimateGasLimit = async ({
    tx,
    gasSurplus,
    action,
    skipGasEstimation,
  }: TransactionGenerationMethodNew): Promise<TransactionRequest> => {
    const minimum = BigInt(gasRecommendation(action).limit);
    let estimated = 0n;
    if (!skipGasEstimation) {
      try {
        estimated = await this.gasEstimator(
          {
            ...tx,
            value:
              tx.value === null || tx.value === undefined
                ? DEFAULT_NULL_VALUE_ON_TX
                : getBigInt(tx.value),
          },
          this.provider,
          gasSurplus,
        );
      } catch {
        /* Approval-dependent estimation may fail. */
      }
    }

    tx.gasLimit = estimated > minimum ? estimated : minimum;
    return tx;
  };

  /** The sole typed read boundary; output integers follow ethers rather than viem inference. */
  public async readContract<N extends ExtractAbiFunctionNames<A>>(
    address: string,
    name: N,
    args: AbiParametersToPrimitiveTypes<ExtractAbiFunction<A, N>['inputs']>,
    overrides?: { blockTag?: string | number },
  ): Promise<AbiReadReturn<A, N>> {
    const method = this.getContractInstance(address).getFunction(name);
    const result: unknown = await method.staticCall(...args, ...(overrides ? [overrides] : []));
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- The single ABI boundary maps every decoded Solidity integer width to ethers bigint.
    return result as AbiReadReturn<A, N>;
  }

  public encodeFunctionData<N extends ExtractAbiFunctionNames<A>>(
    name: N,
    args: AbiParametersToPrimitiveTypes<ExtractAbiFunction<A, N>['inputs']>,
  ): string {
    return this.iface.encodeFunctionData(name, args);
  }

  // eslint-disable-next-line max-params -- Preserve the existing positional signature and argument order used by callers.
  public buildTx<N extends ExtractAbiFunctionNames<A>>(
    to: string,
    name: N,
    args: AbiParametersToPrimitiveTypes<ExtractAbiFunction<A, N>['inputs']>,
    from?: string,
    value?: string,
  ): transactionType {
    return {
      to,
      from,
      data: this.encodeFunctionData(name, args),
      value: value ?? DEFAULT_NULL_VALUE_ON_TX,
    };
  }
}
