import type {
  Abi,
  AbiParameter,
  AbiParameterToPrimitiveType,
  ExtractAbiFunction,
  ExtractAbiFunctionNames,
} from 'abitype';
import type { Contract, ContractTransactionResponse, Interface } from 'ethers';

/**
 * Non-readonly views preserve existing public array signatures; ethers Results remain frozen.
 * All decoded Solidity integer widths are bigint.
 */
type Decoded<T> = T extends number
  ? bigint
  : T extends string
    ? string
    : T extends readonly unknown[]
      ? { -readonly [K in keyof T]: Decoded<T[K]> }
      : T extends object
        ? { -readonly [K in keyof T]: Decoded<T[K]> }
        : T;
type OutputParameter<P extends AbiParameter> = P extends {
  type: `tuple${infer Suffix}`;
  components: infer C extends readonly AbiParameter[];
}
  ? TupleShape<C, Suffix>
  : Decoded<AbiParameterToPrimitiveType<P, 'outputs'>>;
type TupleShape<
  C extends readonly AbiParameter[],
  Suffix extends string,
> = Suffix extends `[${string}]${infer Rest}`
  ? Array<TupleShape<C, Rest>>
  : OutputTuple<C> & NamedOutputs<C>;
type OutputTuple<P extends readonly AbiParameter[]> = {
  -readonly [K in keyof P]: P[K] extends AbiParameter ? OutputParameter<P[K]> : never;
};
type NamedOutputs<P extends readonly AbiParameter[]> = {
  [V in P[number] as V['name'] extends string ? Exclude<V['name'], ''> : never]: OutputParameter<V>;
};
export type AbiDecodedOutputs<A extends Abi, N extends ExtractAbiFunctionNames<A>> = OutputTuple<
  ExtractAbiFunction<A, N>['outputs']
> &
  NamedOutputs<ExtractAbiFunction<A, N>['outputs']>;
type ReturnValue<A extends Abi, N extends ExtractAbiFunctionNames<A>> =
  OutputTuple<ExtractAbiFunction<A, N>['outputs']> extends [infer Value]
    ? Value
    : AbiDecodedOutputs<A, N>;
type DirectReturnValue<A extends Abi, N extends ExtractAbiFunctionNames<A>> = ExtractAbiFunction<
  A,
  N
>['stateMutability'] extends 'view' | 'pure'
  ? ReturnValue<A, N>
  : ContractTransactionResponse;

/** Keep ethers' permissive arguments while deriving every decoded result from the selected ABI. */
export type AbiContract<
  A extends Abi,
  Names extends ExtractAbiFunctionNames<A> = ExtractAbiFunctionNames<A>,
> = Contract & {
  [N in Names]: ((...args: unknown[]) => Promise<DirectReturnValue<A, N>>) & {
    staticCall: (...args: unknown[]) => Promise<ReturnValue<A, N>>;
  };
};

/** This view retains the original ethers object, call dispatch, caches and runner identity. */
export function asAbiContract<
  A extends Abi,
  Names extends ExtractAbiFunctionNames<A> = ExtractAbiFunctionNames<A>,
>(contract: Contract, _abi: A): AbiContract<A, Names> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- The caller supplies the same verified ABI used to construct this ethers Contract.
  return contract as AbiContract<A, Names>;
}

export function decodeAbiResult<A extends Abi, N extends ExtractAbiFunctionNames<A>>(
  iface: Interface,
  _abi: A,
  name: N,
  data: string,
): AbiDecodedOutputs<A, N> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- ethers validates bytes against the selected ABI before its Result receives ABI-derived output types.
  return iface.decodeFunctionResult(name, data) as unknown as AbiDecodedOutputs<A, N>;
}
