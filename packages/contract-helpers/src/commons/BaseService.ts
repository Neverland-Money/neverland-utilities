import { Contract, ethers } from 'ethers';
import type {
  Abi,
  ExtractAbiFunctionNames,
  ExtractAbiFunction,
  AbiParametersToPrimitiveTypes,
} from 'abitype';
export type tEthereumAddress = string;
export enum ProtocolAction {
  default = 'default',
}
export enum eEthereumTxType {
  ERC20_APPROVAL = 'ERC20_APPROVAL',
}
export type transactionType = ethers.TransactionRequest;
export type TransactionGenerationMethod = {
  rawTxMethod: () => Promise<ethers.TransactionRequest>;
  from: tEthereumAddress;
  value?: string;
  gasSurplus?: number;
  action?: ProtocolAction;
};
export type GasType = {
  gasLimit: string | undefined;
  gasPrice: string;
};
export type GasResponse = (force?: boolean) => Promise<GasType | null>;
const DEFAULT_NULL_VALUE_ON_TX = ethers.toBeHex(0n);
const gasLimitRecommendations: Record<
  ProtocolAction,
  {
    limit: string;
    recommended: string;
  }
> = {
  [ProtocolAction.default]: { limit: '210000', recommended: '210000' },
};
export class AbiBaseService<A extends Abi> {
  readonly contractInstances: Record<string, Contract> = {};
  readonly provider: ethers.Provider;
  readonly abi: A;
  readonly iface: ethers.Interface;
  readonly defaultAddress?: tEthereumAddress;
  constructor(provider: ethers.Provider, abi: A, defaultAddress?: tEthereumAddress) {
    this.provider = provider;
    this.abi = abi;
    this.iface = new ethers.Interface(abi as any);
    this.defaultAddress = defaultAddress;
  }
  public getContractInstance = (address: tEthereumAddress): Contract => {
    if (!this.contractInstances[address]) {
      this.contractInstances[address] = new Contract(address, this.abi as any, this.provider);
    }
    return this.contractInstances[address];
  };
  public encodeFunctionData<Name extends ExtractAbiFunctionNames<A>>(
    functionName: Name,
    args: AbiParametersToPrimitiveTypes<ExtractAbiFunction<A, Name>['inputs']>,
  ): string {
    return this.iface.encodeFunctionData(functionName as string, args as any);
  }
  public buildTx<Name extends ExtractAbiFunctionNames<A>>(
    to: tEthereumAddress,
    functionName: Name,
    args: AbiParametersToPrimitiveTypes<ExtractAbiFunction<A, Name>['inputs']>,
    from?: tEthereumAddress,
    value?: string,
  ): transactionType {
    const data = this.encodeFunctionData(functionName, args);
    return { to, from, data, value: value ?? DEFAULT_NULL_VALUE_ON_TX };
  }
  readonly generateTxCallback =
    ({
      rawTxMethod,
      from,
      value,
      action,
    }: TransactionGenerationMethod): (() => Promise<transactionType>) =>
    async () => {
      const txRaw: ethers.TransactionRequest = await rawTxMethod();
      const tx: transactionType = { ...txRaw, from, value: value ?? DEFAULT_NULL_VALUE_ON_TX };
      tx.gasLimit = await this.provider.estimateGas(tx);
      if (
        action &&
        gasLimitRecommendations[action] &&
        tx.gasLimit <= ethers.getBigInt(gasLimitRecommendations[action].limit)
      ) {
        tx.gasLimit = ethers.getBigInt(gasLimitRecommendations[action].recommended);
      }
      return tx;
    };
  readonly generateTxPriceEstimation =
    (
      txs: Array<{
        txType: eEthereumTxType;
      }>,
      txCallback: () => Promise<transactionType>,
      action: ProtocolAction = ProtocolAction.default,
    ): GasResponse =>
    async (force = false) => {
      const { gasPrice } = await this.provider.getFeeData();
      if (gasPrice === null) throw new Error('Gas price is unavailable');
      const hasPendingApprovals = txs.find(tx => tx.txType === eEthereumTxType.ERC20_APPROVAL);
      if (!hasPendingApprovals || force) {
        const { gasLimit, gasPrice: gasPriceProv }: transactionType = await txCallback();
        if (!gasLimit) throw new Error('Transaction calculation error');
        return {
          gasLimit: gasLimit.toString(),
          gasPrice: gasPriceProv != null ? gasPriceProv.toString() : gasPrice.toString(),
        };
      }
      return {
        gasLimit: gasLimitRecommendations[action].recommended,
        gasPrice: gasPrice.toString(),
      };
    };
}
