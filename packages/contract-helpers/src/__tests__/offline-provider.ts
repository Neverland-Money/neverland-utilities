import {
  erc20Abi,
  poolAbi,
  uiPoolDataProviderV3Abi,
  variableDebtTokenAbi,
  walletBalanceProviderAbi,
} from '@neverland-money/contract-types';
import type { PerformActionRequest, TransactionRequest } from 'ethers';
import { AbstractProvider, FeeData, Interface, Network } from 'ethers';

const iface = new Interface(
  JSON.stringify(
    [
      ...erc20Abi,
      ...poolAbi,
      ...variableDebtTokenAbi,
      ...walletBalanceProviderAbi,
      ...uiPoolDataProviderV3Abi,
    ].filter(item => item.type === 'function'),
  ),
);
type Handler = (...args: never[]) => unknown;
/** Real ethers ABI calls with no external transport. Unexpected operations fail closed. */
export class OfflineProvider extends AbstractProvider {
  gasEstimate = 1n;

  private handlers: Record<string, Handler> = {};
  private observed = jest.fn();
  constructor() {
    super(Network.from(143), { cacheTimeout: -1 });
  }

  async _detectNetwork(): Promise<Network> {
    return Network.from(143);
  }

  async getFeeData(): Promise<FeeData> {
    return new FeeData(1n);
  }

  async estimateGas(_tx: TransactionRequest): Promise<bigint> {
    return this.gasEstimate;
  }

  mockContract(handlers: Record<string, Handler>) {
    this.handlers = handlers;
    this.observed = jest.fn();
    return this.observed;
  }

  async _perform<T = unknown>(request: PerformActionRequest): Promise<T> {
    if (request.method !== 'call')
      throw new Error(`Unexpected offline operation ${request.method}`);
    const call = iface.parseTransaction({ data: request.transaction.data ?? '0x' });
    if (!call || !this.handlers[call.name])
      throw new Error(`Unexpected offline call ${call?.name}`);
    this.observed(...call.args);
    const value: unknown = await Reflect.apply(
      this.handlers[call.name],
      undefined,
      Array.from(call.args),
    );
    const { fragment } = call;
    if (!fragment) throw new Error('Missing ABI fragment');
    let values: readonly unknown[];
    if (fragment.outputs.length === 1) values = [value];
    else if (Array.isArray(value)) values = value;
    else if (value && typeof value === 'object' && '0' in value && '1' in value)
      values = [value[0], value[1]];
    else throw new Error('Expected encoded result tuple');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Ethers exposes a generic _perform; the only supported offline request returns encoded call bytes.
    return iface.encodeFunctionResult(fragment, values) as T;
  }
}
