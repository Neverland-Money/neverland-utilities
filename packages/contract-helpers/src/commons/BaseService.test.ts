import { FeeData, JsonRpcProvider } from 'ethers';
import { erc20Abi } from '@neverland-money/contract-types';
import { AbiBaseService, ProtocolAction, eEthereumTxType } from './BaseService';

const USER = '0x00000000000000000000000000000000000000a1';
const TOKEN = '0x00000000000000000000000000000000000000b1';
const provider = new JsonRpcProvider('http://127.0.0.1:1', 143, { staticNetwork: true });
const service = new AbiBaseService(provider, erc20Abi, TOKEN);

describe('ethers v6 transaction generation', () => {
  it('preserves populated fields and applies the bigint gas recommendation', async () => {
    const estimateGas = jest.spyOn(provider, 'estimateGas').mockResolvedValue(20000n);
    const rawTxMethod = jest.fn(async () => ({ to: TOKEN, data: '0x1234', chainId: 143n }));
    const tx = await service.generateTxCallback({
      rawTxMethod,
      from: USER,
      value: '7',
      action: ProtocolAction.default,
    })();
    expect(tx).toEqual({
      to: TOKEN,
      data: '0x1234',
      chainId: 143n,
      from: USER,
      value: '7',
      gasLimit: 210000n,
    });
    expect(estimateGas).toHaveBeenCalledWith(expect.objectContaining({ from: USER, value: '7' }));
  });

  it('retains a gas estimate above the recommendation threshold', async () => {
    jest.spyOn(provider, 'estimateGas').mockResolvedValue(250000n);
    const tx = await service.generateTxCallback({
      rawTxMethod: async () => ({ to: TOKEN }),
      from: USER,
      action: ProtocolAction.default,
    })();
    expect(tx.gasLimit).toBe(250000n);
    expect(tx.value).toBe('0x00');
  });

  it('reads fee data and retains an explicit zero transaction gas price', async () => {
    jest.spyOn(provider, 'getFeeData').mockResolvedValue(new FeeData(99n));
    const callback = jest.fn(async () => ({ gasLimit: 25000n, gasPrice: 0n }));
    await expect(service.generateTxPriceEstimation([], callback)()).resolves.toEqual({
      gasLimit: '25000',
      gasPrice: '0',
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('defers the callback for a pending approval and runs it when forced', async () => {
    jest.spyOn(provider, 'getFeeData').mockResolvedValue(new FeeData(99n));
    const callback = jest.fn(async () => ({ gasLimit: 25000n }));
    const estimate = service.generateTxPriceEstimation(
      [{ txType: eEthereumTxType.ERC20_APPROVAL }],
      callback,
    );
    await expect(estimate()).resolves.toEqual({ gasLimit: '210000', gasPrice: '99' });
    expect(callback).not.toHaveBeenCalled();
    await expect(estimate(true)).resolves.toEqual({ gasLimit: '25000', gasPrice: '99' });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('rejects unavailable gas prices', async () => {
    jest.spyOn(provider, 'getFeeData').mockResolvedValue(new FeeData(null));
    await expect(
      service.generateTxPriceEstimation([], async () => ({ gasLimit: 1n }))(),
    ).rejects.toThrow('Gas price is unavailable');
  });
});
