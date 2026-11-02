import { erc20Abi } from '@neverland-money/contract-types';
import { Contract, FeeData } from 'ethers';
import { OfflineProvider } from '../__tests__/offline-provider';
import { AbiBaseService } from './base-service';
import { estimateGasByNetwork } from './gas-station';
import { eEthereumTxType, ProtocolAction } from './types';
import { DEFAULT_NULL_VALUE_ON_TX } from './utils';

jest.mock('./gas-station', () => {
  return {
    __esModule: true,
    estimateGasByNetwork: jest.fn().mockImplementation(async () => Promise.resolve(BigInt(1))),
  };
});
describe('BaseService', () => {
  const provider = new OfflineProvider();
  jest
    .spyOn(provider, 'getFeeData')
    .mockImplementation(async () => Promise.resolve(new FeeData(1n)));

  describe('Initialize', () => {
    it('Expects to initialize the class correctly', () => {
      expect(
        () => new AbiBaseService(provider, erc20Abi, undefined, estimateGasByNetwork),
      ).not.toThrow();
    });
  });
  describe('getContractInstance', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });
    it('Expects to initialize new instance', () => {
      const baseService = new AbiBaseService(provider, erc20Abi, undefined, estimateGasByNetwork);
      const address = '0x0000000000000000000000000000000000000001';
      const instance = baseService.getContractInstance(address);

      expect(instance instanceof Contract).toEqual(true);
    });
    it('Expects to use an already initialized instance', () => {
      const baseService = new AbiBaseService(provider, erc20Abi, undefined, estimateGasByNetwork);
      const address = '0x0000000000000000000000000000000000000001';
      const instance = baseService.getContractInstance(address);
      const instance2 = baseService.getContractInstance(address);

      expect(instance instanceof Contract).toEqual(true);
      expect(instance2).toEqual(instance);
    });
  });
  describe('generateTxCallback', () => {
    const baseService = new AbiBaseService(provider, erc20Abi, undefined, estimateGasByNetwork);
    const from = '0x0000000000000000000000000000000000000001';
    const value = '1';
    const gasSurplus = 10;
    const action = ProtocolAction.supply;
    const rawTxMethod = async () => ({});

    it('Expects a tx object with specified value', async () => {
      const txCallback = baseService.generateTxCallback({
        rawTxMethod,
        from,
        value,
        gasSurplus,
      });
      const tx = await txCallback();
      expect(tx.from).toEqual(from);
      expect(tx.value).toEqual(value);
      expect(tx.gasLimit).toEqual(BigInt(1));
    });
    it('Expects a tx object with default value', async () => {
      const txCallback = baseService.generateTxCallback({
        rawTxMethod,
        from,
      });
      const tx = await txCallback();
      expect(tx.from).toEqual(from);
      expect(tx.value).toEqual(DEFAULT_NULL_VALUE_ON_TX);
      expect(tx.gasLimit).toEqual(BigInt(1));
    });
    it('Expects a tx object with recommended gas limit', async () => {
      const txCallback = baseService.generateTxCallback({
        rawTxMethod,
        from,
        action,
      });
      const tx = await txCallback();
      expect(tx.from).toEqual(from);
      expect(tx.value).toEqual(DEFAULT_NULL_VALUE_ON_TX);
      expect(tx.gasLimit).toEqual(BigInt(300000));
    });
  });
  describe('generateTxPriceEstimation', () => {
    const baseService = new AbiBaseService(provider, erc20Abi, undefined, estimateGasByNetwork);
    const action = ProtocolAction.supply;
    const txCallback = async () => ({
      gasLimit: BigInt(1),
      gasPrice: BigInt(2),
    });
    // const txs = [
    //   {
    //     txType: eEthereumTxType.DLP_ACTION,
    //     tx: txCallback,
    //     gas: async () => null,
    //   },
    // ];
    it('Expects to get gasPrice when pending approvals', async () => {
      const txs = [
        {
          txType: eEthereumTxType.ERC20_APPROVAL,
          tx: txCallback,
          gas: async () => null,
        },
        {
          txType: eEthereumTxType.DLP_ACTION,
          tx: txCallback,
          gas: async () => null,
        },
      ];
      const gasObj = baseService.generateTxPriceEstimation(txs, txCallback, action);
      const gas = await gasObj();
      expect(gas?.gasLimit).toEqual('300000');
      expect(gas?.gasPrice).toEqual('1');
    });
    it('Expects to get gasPrice when no pending txs', async () => {
      const txs = [
        {
          txType: eEthereumTxType.DLP_ACTION,
          tx: txCallback,
          gas: async () => null,
        },
      ];
      const gasObj = baseService.generateTxPriceEstimation(txs, txCallback, action);
      const gas = await gasObj();
      expect(gas?.gasLimit).toEqual('1');
      expect(gas?.gasPrice).toEqual('2');
    });
    it('Expects to get gasPrice when no pending txs and no gas price passed', async () => {
      const txCallback = async () => ({
        gasLimit: BigInt(1),
      });
      const txs = [
        {
          txType: eEthereumTxType.DLP_ACTION,
          tx: txCallback,
          gas: async () => null,
        },
      ];
      const gasObj = baseService.generateTxPriceEstimation(txs, txCallback, action);
      const gas = await gasObj();
      expect(gas?.gasLimit).toEqual('1');
      expect(gas?.gasPrice).toEqual('1');
    });
    it('Expects to get gasPrice when forcing', async () => {
      const txs = [
        {
          txType: eEthereumTxType.ERC20_APPROVAL,
          tx: txCallback,
          gas: async () => null,
        },
        {
          txType: eEthereumTxType.DLP_ACTION,
          tx: txCallback,
          gas: async () => null,
        },
      ];
      const gasObj = baseService.generateTxPriceEstimation(txs, txCallback, action);
      const gas = await gasObj(true);
      expect(gas?.gasLimit).toEqual('1');
      expect(gas?.gasPrice).toEqual('2');
    });
    it.skip('Expects null when no gas limit', async () => {
      const txCallback = async () => ({});
      const txs = [
        {
          txType: eEthereumTxType.DLP_ACTION,
          tx: txCallback,
          gas: async () => null,
        },
      ];
      const gasObj = baseService.generateTxPriceEstimation(txs, txCallback, action);
      const gas = await gasObj();
      expect(gas).toEqual(null);
    });
    it('Expects to fail when no gas limit', async () => {
      const txCallback = async () => ({});
      const txs = [
        {
          txType: eEthereumTxType.DLP_ACTION,
          tx: txCallback,
          gas: async () => Promise.reject(new Error('Some error')),
        },
      ];
      const gasObj = baseService.generateTxPriceEstimation(txs, txCallback, action);
      await expect(async () => gasObj()).rejects.toThrow('Transaction calculation error');
    });
  });
  describe('estimateGasLimit', () => {
    const baseService = new AbiBaseService(provider, erc20Abi, undefined, estimateGasByNetwork);

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('Estimate gas limit with default tx', async () => {
      const tx = await baseService.estimateGasLimit({
        tx: {},
        skipGasEstimation: true,
      });
      expect(tx.gasLimit).toEqual(BigInt('210000'));
    });
    it('Estimate gas limit with surplus', async () => {
      const gasSurplus = 10;
      const tx = await baseService.estimateGasLimit({
        tx: {},
        gasSurplus,
        skipGasEstimation: true,
      });
      expect(tx.gasLimit).toEqual(BigInt('210000'));
    });
    it('Estimate gas limit with defined value', async () => {
      const tx = await baseService.estimateGasLimit({
        tx: { value: BigInt('1') },
      });
      expect(tx.gasLimit).toEqual(BigInt('210000'));
    });
    it('Estimate gas limit with action', async () => {
      const tx = await baseService.estimateGasLimit({
        tx: { value: undefined },
        action: ProtocolAction.supply,
      });
      expect(tx.gasLimit).toEqual(BigInt('300000'));
    });
    it('Skips gas limit estimation with action', async () => {
      const tx = await baseService.estimateGasLimit({
        tx: { value: undefined },
        action: ProtocolAction.supply,
        skipGasEstimation: true,
      });
      expect(tx.gasLimit).toEqual(BigInt('300000'));
    });
    it('Skips gas limit estimation without action', async () => {
      const tx = await baseService.estimateGasLimit({
        tx: { value: undefined },
        skipGasEstimation: true,
      });
      expect(tx.gasLimit).toEqual(BigInt('210000'));
    });
    it('Uses estimation if > default for action', async () => {
      const mockedEstimateGasByNetwork = jest.fn().mockResolvedValue(BigInt('400000'));
      jest.mocked(estimateGasByNetwork).mockImplementationOnce(mockedEstimateGasByNetwork);
      const tx = await baseService.estimateGasLimit({
        tx: { value: undefined },
      });
      expect(tx.gasLimit?.toString()).toEqual('400000');
    });
    it('Throws error if gas estimation fails', async () => {
      const mockedEstimateGasByNetwork = jest.fn().mockRejectedValue('Gas estimation error');
      jest.mocked(estimateGasByNetwork).mockImplementationOnce(mockedEstimateGasByNetwork);
      const tx = await baseService.estimateGasLimit({
        tx: { value: undefined },
      });
      expect(tx.gasLimit?.toString()).toEqual('210000');
    });
  });
});
