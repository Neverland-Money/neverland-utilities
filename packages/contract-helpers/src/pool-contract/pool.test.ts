/* eslint-disable max-lines -- The inherited Pool regression cases share one mock lifecycle; retain their original suite and assertion set. */
import { AbiCoder, dataSlice, FeeData, MaxUint256 } from 'ethers';
import { OfflineProvider } from '../__tests__/offline-provider';
import {
  eEthereumTxType,
  type GasType,
  InterestRate,
  ProtocolAction,
  type transactionType,
} from '../commons/types';
import {
  API_ETH_MOCK_ADDRESS,
  DEFAULT_NULL_VALUE_ON_TX,
  gasLimitRecommendations,
  valueToWei,
} from '../commons/utils';
import { Pool } from './pool';

jest.mock('../commons/gas-station', () => {
  return {
    __esModule: true,
    estimateGasByNetwork: jest.fn().mockImplementation(async () => Promise.resolve(BigInt(1))),
    estimateGas: jest.fn(async () => Promise.resolve(BigInt(1))),
  };
});

describe('Pool', () => {
  const provider = new OfflineProvider();
  jest
    .spyOn(provider, 'getFeeData')
    .mockImplementation(async () => Promise.resolve(new FeeData(1n)));
  const POOL = '0x0000000000000000000000000000000000000001';
  const WETH_GATEWAY = '0x0000000000000000000000000000000000000002';
  describe('Initialization', () => {
    const config = {
      POOL,
      WETH_GATEWAY,
    };
    it('Expects to initialize correctly with all params', () => {
      const instance = new Pool(provider, config);
      expect(instance instanceof Pool).toEqual(true);
    });
    it('Expects ot initialize correctly without passing configuration', () => {
      const instance = new Pool(provider);
      expect(instance instanceof Pool).toEqual(true);
    });
  });
  describe('deposit', () => {
    const user = '0x0000000000000000000000000000000000000006';
    const reserve = '0x0000000000000000000000000000000000000007';
    const onBehalfOf = '0x0000000000000000000000000000000000000008';
    const amount = '123.456';
    const decimals = 18;
    const referralCode = '1';

    const config = { POOL };

    afterEach(() => {
      jest.clearAllMocks();
    });
    it('Expects the tx object passing all parameters with eth deposit', async () => {
      const reserve = API_ETH_MOCK_ADDRESS;
      const poolInstance = new Pool(provider, config);
      const depositEthSpy = jest
        .spyOn(poolInstance.wethGatewayService, 'depositETH')
        .mockReturnValue([]);
      await poolInstance.deposit({
        user,
        reserve,
        amount,
        onBehalfOf,
        referralCode,
      });
      expect(depositEthSpy).toHaveBeenCalled();
    });
    it('Expects the tx object passing all parameters without approval need', async () => {
      const poolInstance = new Pool(provider, config);
      const isApprovedSpy = jest
        .spyOn(poolInstance.erc20Service, 'isApproved')
        .mockImplementationOnce(async () => Promise.resolve(true));
      const decimalsSpy = jest
        .spyOn(poolInstance.erc20Service, 'decimalsOf')
        .mockReturnValueOnce(Promise.resolve(decimals));

      const depositTxObj = await poolInstance.deposit({
        user,
        reserve,
        amount,
        onBehalfOf,
        referralCode,
      });
      expect(isApprovedSpy).toHaveBeenCalled();
      expect(decimalsSpy).toHaveBeenCalled();

      expect(depositTxObj.length).toEqual(1);
      const txObj = depositTxObj[0];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(
        BigInt(gasLimitRecommendations[ProtocolAction.supply].recommended),
      );
      expect(tx.value).toEqual(DEFAULT_NULL_VALUE_ON_TX);

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'address', 'uint16'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, decimals)));
      expect(decoded[2]).toEqual(onBehalfOf);
      expect(decoded[3]).toEqual(BigInt(referralCode));

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual(
        gasLimitRecommendations[ProtocolAction.supply].recommended,
      );
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects the tx object passing all parameters but not onBehalfOf', async () => {
      const poolInstance = new Pool(provider, config);
      const isApprovedSpy = jest
        .spyOn(poolInstance.erc20Service, 'isApproved')
        .mockImplementationOnce(async () => true);
      const decimalsSpy = jest
        .spyOn(poolInstance.erc20Service, 'decimalsOf')
        .mockReturnValueOnce(Promise.resolve(decimals));

      const depositTxObj = await poolInstance.deposit({
        user,
        reserve,
        amount,
        referralCode,
      });
      expect(isApprovedSpy).toHaveBeenCalled();
      expect(decimalsSpy).toHaveBeenCalled();

      expect(depositTxObj.length).toEqual(1);
      const txObj = depositTxObj[0];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(
        BigInt(gasLimitRecommendations[ProtocolAction.supply].recommended),
      );
      expect(tx.value).toEqual(DEFAULT_NULL_VALUE_ON_TX);

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'address', 'uint16'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, decimals)));
      expect(decoded[2]).toEqual(user);
      expect(decoded[3]).toEqual(BigInt(referralCode));

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual(
        gasLimitRecommendations[ProtocolAction.supply].recommended,
      );
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects the tx object passing all parameters but not referral', async () => {
      const poolInstance = new Pool(provider, config);
      const isApprovedSpy = jest
        .spyOn(poolInstance.erc20Service, 'isApproved')
        .mockImplementationOnce(async () => true);
      const decimalsSpy = jest
        .spyOn(poolInstance.erc20Service, 'decimalsOf')
        .mockReturnValueOnce(Promise.resolve(decimals));

      const depositTxObj = await poolInstance.deposit({
        user,
        reserve,
        amount,
        onBehalfOf,
      });
      expect(isApprovedSpy).toHaveBeenCalled();
      expect(decimalsSpy).toHaveBeenCalled();

      expect(depositTxObj.length).toEqual(1);
      const txObj = depositTxObj[0];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(
        BigInt(gasLimitRecommendations[ProtocolAction.supply].recommended),
      );
      expect(tx.value).toEqual(DEFAULT_NULL_VALUE_ON_TX);

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'address', 'uint16'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, decimals)));
      expect(decoded[2]).toEqual(onBehalfOf);
      expect(decoded[3]).toEqual(0n);

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual(
        gasLimitRecommendations[ProtocolAction.supply].recommended,
      );
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects the tx object passing all parameters and needing approval', async () => {
      const poolInstance = new Pool(provider, config);
      const isApprovedSpy = jest
        .spyOn(poolInstance.erc20Service, 'isApproved')
        .mockImplementationOnce(async () => Promise.resolve(false));
      const decimalsSpy = jest
        .spyOn(poolInstance.erc20Service, 'decimalsOf')
        .mockReturnValueOnce(Promise.resolve(decimals));
      const approveSpy = jest.spyOn(poolInstance.erc20Service, 'approve').mockReturnValueOnce({
        txType: eEthereumTxType.ERC20_APPROVAL,
        tx: async () => ({}),
        gas: async () => ({
          gasLimit: '1',
          gasPrice: '1',
        }),
      });

      const depositTxObj = await poolInstance.deposit({
        user,
        reserve,
        amount,
        onBehalfOf,
        referralCode,
      });

      expect(approveSpy).toHaveBeenCalled();
      expect(isApprovedSpy).toHaveBeenCalled();
      expect(decimalsSpy).toHaveBeenCalled();

      expect(depositTxObj.length).toEqual(2);
      const txObj = depositTxObj[1];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(
        BigInt(gasLimitRecommendations[ProtocolAction.supply].recommended),
      );
      expect(tx.value).toEqual(DEFAULT_NULL_VALUE_ON_TX);

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'address', 'uint16'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, decimals)));
      expect(decoded[2]).toEqual(onBehalfOf);
      expect(decoded[3]).toEqual(BigInt(referralCode));

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual('300000');
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects to fail when PoolAddress not provided', async () => {
      const poolInstance = new Pool(provider);
      const txObj = await poolInstance.deposit({
        user,
        reserve,
        amount,
        onBehalfOf,
        referralCode,
      });
      expect(txObj).toEqual([]);
    });
    it('Expects to fail when user not and eth address', async () => {
      const poolInstance = new Pool(provider, config);
      const user = 'asdf';
      await expect(async () =>
        poolInstance.deposit({
          user,
          reserve,
          amount,
          onBehalfOf,
          referralCode,
        }),
      ).rejects.toThrow(`Address: ${user} is not a valid ethereum Address`);
    });
    it('Expects to fail when reserve not and eth address', async () => {
      const poolInstance = new Pool(provider, config);
      const reserve = 'asdf';
      await expect(async () =>
        poolInstance.deposit({
          user,
          reserve,
          amount,
          onBehalfOf,
          referralCode,
        }),
      ).rejects.toThrow(`Address: ${reserve} is not a valid ethereum Address`);
    });
    it('Expects to fail when onBehalfOf not and eth address', async () => {
      const poolInstance = new Pool(provider, config);
      const onBehalfOf = 'asdf';
      await expect(async () =>
        poolInstance.deposit({
          user,
          reserve,
          amount,
          onBehalfOf,
          referralCode,
        }),
      ).rejects.toThrow(`Address: ${onBehalfOf} is not a valid ethereum Address`);
    });
    it('Expects to fail when amount not positive', async () => {
      const poolInstance = new Pool(provider, config);
      const amount = '0';
      await expect(async () =>
        poolInstance.deposit({
          user,
          reserve,
          amount,
          onBehalfOf,
          referralCode,
        }),
      ).rejects.toThrow(`Amount: ${amount} needs to be greater than 0`);
    });
    it('Expects to fail when amount not number', async () => {
      const poolInstance = new Pool(provider, config);
      const amount = 'asdf';
      await expect(async () =>
        poolInstance.deposit({
          user,
          reserve,
          amount,
          onBehalfOf,
          referralCode,
        }),
      ).rejects.toThrow(`Amount: ${amount} needs to be greater than 0`);
    });
  });
  describe('supply', () => {
    const user = '0x0000000000000000000000000000000000000006';
    const reserve = '0x0000000000000000000000000000000000000007';
    const onBehalfOf = '0x0000000000000000000000000000000000000008';
    const amount = '123.456';
    const decimals = 18;
    const referralCode = '1';

    const config = { POOL };

    afterEach(() => {
      jest.clearAllMocks();
    });
    it('Expects the tx object passing all parameters with eth supply', async () => {
      const reserve = API_ETH_MOCK_ADDRESS;
      const poolInstance = new Pool(provider, config);
      const supplyEthSpy = jest
        .spyOn(poolInstance.wethGatewayService, 'depositETH')
        .mockReturnValue([]);
      await poolInstance.supply({
        user,
        reserve,
        amount,
        onBehalfOf,
        referralCode,
      });
      expect(supplyEthSpy).toHaveBeenCalled();
    });
    it('Expects the tx object passing all parameters without approval need', async () => {
      const poolInstance = new Pool(provider, config);
      const isApprovedSpy = jest
        .spyOn(poolInstance.erc20Service, 'isApproved')
        .mockImplementationOnce(async () => Promise.resolve(true));
      const decimalsSpy = jest
        .spyOn(poolInstance.erc20Service, 'decimalsOf')
        .mockReturnValueOnce(Promise.resolve(decimals));

      const supplyTxObj = await poolInstance.supply({
        user,
        reserve,
        amount,
        onBehalfOf,
        referralCode,
      });
      expect(isApprovedSpy).toHaveBeenCalled();
      expect(decimalsSpy).toHaveBeenCalled();

      expect(supplyTxObj.length).toEqual(1);
      const txObj = supplyTxObj[0];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(
        BigInt(gasLimitRecommendations[ProtocolAction.supply].recommended),
      );
      expect(tx.value).toEqual(DEFAULT_NULL_VALUE_ON_TX);

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'address', 'uint16'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, decimals)));
      expect(decoded[2]).toEqual(onBehalfOf);
      expect(decoded[3]).toEqual(BigInt(referralCode));

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual(
        gasLimitRecommendations[ProtocolAction.supply].recommended,
      );
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects the tx object passing all parameters but not onBehalfOf', async () => {
      const poolInstance = new Pool(provider, config);
      const isApprovedSpy = jest
        .spyOn(poolInstance.erc20Service, 'isApproved')
        .mockImplementationOnce(async () => true);
      const decimalsSpy = jest
        .spyOn(poolInstance.erc20Service, 'decimalsOf')
        .mockReturnValueOnce(Promise.resolve(decimals));

      const supplyTxObj = await poolInstance.supply({
        user,
        reserve,
        amount,
        referralCode,
      });
      expect(isApprovedSpy).toHaveBeenCalled();
      expect(decimalsSpy).toHaveBeenCalled();

      expect(supplyTxObj.length).toEqual(1);
      const txObj = supplyTxObj[0];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(
        BigInt(gasLimitRecommendations[ProtocolAction.supply].recommended),
      );
      expect(tx.value).toEqual(DEFAULT_NULL_VALUE_ON_TX);

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'address', 'uint16'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, decimals)));
      expect(decoded[2]).toEqual(user);
      expect(decoded[3]).toEqual(BigInt(referralCode));

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual(
        gasLimitRecommendations[ProtocolAction.supply].recommended,
      );
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects the tx object passing all parameters but not referral', async () => {
      const poolInstance = new Pool(provider, config);
      const isApprovedSpy = jest
        .spyOn(poolInstance.erc20Service, 'isApproved')
        .mockImplementationOnce(async () => true);
      const decimalsSpy = jest
        .spyOn(poolInstance.erc20Service, 'decimalsOf')
        .mockReturnValueOnce(Promise.resolve(decimals));

      const supplyTxObj = await poolInstance.supply({
        user,
        reserve,
        amount,
        onBehalfOf,
      });
      expect(isApprovedSpy).toHaveBeenCalled();
      expect(decimalsSpy).toHaveBeenCalled();

      expect(supplyTxObj.length).toEqual(1);
      const txObj = supplyTxObj[0];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(
        BigInt(gasLimitRecommendations[ProtocolAction.supply].recommended),
      );
      expect(tx.value).toEqual(DEFAULT_NULL_VALUE_ON_TX);

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'address', 'uint16'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, decimals)));
      expect(decoded[2]).toEqual(onBehalfOf);
      expect(decoded[3]).toEqual(0n);

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual(
        gasLimitRecommendations[ProtocolAction.supply].recommended,
      );
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects the tx object passing all parameters and needing approval', async () => {
      const poolInstance = new Pool(provider, config);
      const isApprovedSpy = jest
        .spyOn(poolInstance.erc20Service, 'isApproved')
        .mockImplementationOnce(async () => Promise.resolve(false));
      const decimalsSpy = jest
        .spyOn(poolInstance.erc20Service, 'decimalsOf')
        .mockReturnValueOnce(Promise.resolve(decimals));
      const approveSpy = jest.spyOn(poolInstance.erc20Service, 'approve').mockReturnValueOnce({
        txType: eEthereumTxType.ERC20_APPROVAL,
        tx: async () => ({}),
        gas: async () => ({
          gasLimit: '1',
          gasPrice: '1',
        }),
      });

      const supplyTxObj = await poolInstance.supply({
        user,
        reserve,
        amount,
        onBehalfOf,
        referralCode,
      });

      expect(approveSpy).toHaveBeenCalled();
      expect(isApprovedSpy).toHaveBeenCalled();
      expect(decimalsSpy).toHaveBeenCalled();

      expect(supplyTxObj.length).toEqual(2);
      const txObj = supplyTxObj[1];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(
        BigInt(gasLimitRecommendations[ProtocolAction.supply].recommended),
      );
      expect(tx.value).toEqual(DEFAULT_NULL_VALUE_ON_TX);

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'address', 'uint16'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, decimals)));
      expect(decoded[2]).toEqual(onBehalfOf);
      expect(decoded[3]).toEqual(BigInt(referralCode));

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual('300000');
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects to fail when PoolAddress not provided', async () => {
      const poolInstance = new Pool(provider);
      const txObj = await poolInstance.supply({
        user,
        reserve,
        amount,
        onBehalfOf,
        referralCode,
      });
      expect(txObj).toEqual([]);
    });
    it('Expects to fail when user not and eth address', async () => {
      const poolInstance = new Pool(provider, config);
      const user = 'asdf';
      await expect(async () =>
        poolInstance.supply({
          user,
          reserve,
          amount,
          onBehalfOf,
          referralCode,
        }),
      ).rejects.toThrow(`Address: ${user} is not a valid ethereum Address`);
    });
    it('Expects to fail when reserve not and eth address', async () => {
      const poolInstance = new Pool(provider, config);
      const reserve = 'asdf';
      await expect(async () =>
        poolInstance.supply({
          user,
          reserve,
          amount,
          onBehalfOf,
          referralCode,
        }),
      ).rejects.toThrow(`Address: ${reserve} is not a valid ethereum Address`);
    });
    it('Expects to fail when onBehalfOf not and eth address', async () => {
      const poolInstance = new Pool(provider, config);
      const onBehalfOf = 'asdf';
      await expect(async () =>
        poolInstance.supply({
          user,
          reserve,
          amount,
          onBehalfOf,
          referralCode,
        }),
      ).rejects.toThrow(`Address: ${onBehalfOf} is not a valid ethereum Address`);
    });
    it('Expects to fail when amount not positive', async () => {
      const poolInstance = new Pool(provider, config);
      const amount = '0';
      await expect(async () =>
        poolInstance.supply({
          user,
          reserve,
          amount,
          onBehalfOf,
          referralCode,
        }),
      ).rejects.toThrow(`Amount: ${amount} needs to be greater than 0`);
    });
    it('Expects to fail when amount not number', async () => {
      const poolInstance = new Pool(provider, config);
      const amount = 'asdf';
      await expect(async () =>
        poolInstance.deposit({
          user,
          reserve,
          amount,
          onBehalfOf,
          referralCode,
        }),
      ).rejects.toThrow(`Amount: ${amount} needs to be greater than 0`);
    });
  });
  describe('supplyWithPermit', () => {
    const user = '0x0000000000000000000000000000000000000006';
    const reserve = '0x0000000000000000000000000000000000000007';
    const onBehalfOf = '0x0000000000000000000000000000000000000008';
    const referralCode = '1';
    const deadline = Math.round(Date.now() / 1000 + 3600).toString();
    // const message = 'victor washington'
    const signature =
      '0x532f8df4e2502bd869fb35e9301156f9b307380afdcc25cfbc87b2e939f16f7e47c326dc26eb918d327358797ee67ad7415d871ef7eaf0d4f6352d3ad021fbb41c';

    const amount = '123.456';
    const decimals = 18;

    afterEach(() => {
      jest.clearAllMocks();
    });
    it('Expects the tx object if all params ok,', async () => {
      const poolInstance = new Pool(provider, { POOL });
      jest.spyOn(poolInstance.erc20Service, 'decimalsOf').mockResolvedValue(18);

      const supplyTxObj = await poolInstance.supplyWithPermit({
        user,
        reserve,
        amount,
        onBehalfOf,
        referralCode,
        signature,
        deadline,
      });

      expect(supplyTxObj.length).toEqual(1);
      const txObj = supplyTxObj[0];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(
        BigInt(gasLimitRecommendations[ProtocolAction.supplyWithPermit].recommended),
      );
      expect(tx.value).toEqual(DEFAULT_NULL_VALUE_ON_TX);

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'address', 'uint16', 'uint256', 'uint8', 'bytes32', 'bytes32'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, decimals)));
      expect(decoded[2]).toEqual(onBehalfOf);
      expect(decoded[3]).toEqual(BigInt(referralCode));
      expect(decoded[4]).toEqual(BigInt(deadline));
      expect(decoded[5]).toEqual(28n);
      expect(decoded[6]).toEqual(
        '0x532f8df4e2502bd869fb35e9301156f9b307380afdcc25cfbc87b2e939f16f7e',
      );
      expect(decoded[7]).toEqual(
        '0x47c326dc26eb918d327358797ee67ad7415d871ef7eaf0d4f6352d3ad021fbb4',
      );

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual(
        gasLimitRecommendations[ProtocolAction.supplyWithPermit].recommended,
      );
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects the tx object if all params ok, without onBehalf', async () => {
      const poolInstance = new Pool(provider, { POOL });
      jest.spyOn(poolInstance.erc20Service, 'decimalsOf').mockResolvedValue(18);

      const supplyTxObj = await poolInstance.supplyWithPermit({
        user,
        reserve,
        amount,
        // onBehalfOf,
        referralCode,
        signature,
        deadline,
      });

      expect(supplyTxObj.length).toEqual(1);
      const txObj = supplyTxObj[0];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(
        BigInt(gasLimitRecommendations[ProtocolAction.supplyWithPermit].recommended),
      );
      expect(tx.value).toEqual(DEFAULT_NULL_VALUE_ON_TX);

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'address', 'uint16', 'uint256', 'uint8', 'bytes32', 'bytes32'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, decimals)));
      expect(decoded[2]).toEqual(user);
      expect(decoded[3]).toEqual(BigInt(referralCode));
      expect(decoded[4]).toEqual(BigInt(deadline));
      expect(decoded[5]).toEqual(28n);
      expect(decoded[6]).toEqual(
        '0x532f8df4e2502bd869fb35e9301156f9b307380afdcc25cfbc87b2e939f16f7e',
      );
      expect(decoded[7]).toEqual(
        '0x47c326dc26eb918d327358797ee67ad7415d871ef7eaf0d4f6352d3ad021fbb4',
      );

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual(
        gasLimitRecommendations[ProtocolAction.supplyWithPermit].recommended,
      );
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects the tx object if all params ok, without referralCode', async () => {
      const poolInstance = new Pool(provider, { POOL });
      jest.spyOn(poolInstance.erc20Service, 'decimalsOf').mockResolvedValue(18);

      const supplyTxObj = await poolInstance.supplyWithPermit({
        user,
        reserve,
        amount,
        onBehalfOf,
        // referralCode,
        signature,
        deadline,
      });

      expect(supplyTxObj.length).toEqual(1);
      const txObj = supplyTxObj[0];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(
        BigInt(gasLimitRecommendations[ProtocolAction.supplyWithPermit].recommended),
      );
      expect(tx.value).toEqual(DEFAULT_NULL_VALUE_ON_TX);

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'address', 'uint16', 'uint256', 'uint8', 'bytes32', 'bytes32'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, decimals)));
      expect(decoded[2]).toEqual(onBehalfOf);
      expect(decoded[3]).toEqual(0n);
      expect(decoded[4]).toEqual(BigInt(deadline));
      expect(decoded[5]).toEqual(28n);
      expect(decoded[6]).toEqual(
        '0x532f8df4e2502bd869fb35e9301156f9b307380afdcc25cfbc87b2e939f16f7e',
      );
      expect(decoded[7]).toEqual(
        '0x47c326dc26eb918d327358797ee67ad7415d871ef7eaf0d4f6352d3ad021fbb4',
      );

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual(
        gasLimitRecommendations[ProtocolAction.supplyWithPermit].recommended,
      );
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects to fail if POOL not eth address', async () => {
      const poolInstance = new Pool(provider, { POOL: 'asdf' });
      const txObj = await poolInstance.supplyWithPermit({
        user,
        reserve,
        amount,
        onBehalfOf,
        referralCode,
        signature,
        deadline,
      });
      expect(txObj).toEqual([]);
    });
    it('Expects to fail if user not eth address', async () => {
      const poolInstance = new Pool(provider, { POOL });

      const user = 'asdf';
      await expect(async () =>
        poolInstance.supplyWithPermit({
          user,
          reserve,
          amount,
          onBehalfOf,
          referralCode,
          signature,
          deadline,
        }),
      ).rejects.toThrow(`Address: ${user} is not a valid ethereum Address`);
    });
    it('Expects to fail if reserve not eth address', async () => {
      const poolInstance = new Pool(provider, { POOL });

      const reserve = 'asdf';
      await expect(async () =>
        poolInstance.supplyWithPermit({
          user,
          reserve,
          amount,
          onBehalfOf,
          referralCode,
          signature,
          deadline,
        }),
      ).rejects.toThrow(`Address: ${reserve} is not a valid ethereum Address`);
    });
    it('Expects to fail if onBehalfOf not eth address', async () => {
      const poolInstance = new Pool(provider, { POOL });

      const onBehalfOf = 'asdf';
      await expect(async () =>
        poolInstance.supplyWithPermit({
          user,
          reserve,
          amount,
          onBehalfOf,
          referralCode,
          signature,
          deadline,
        }),
      ).rejects.toThrow(`Address: ${onBehalfOf} is not a valid ethereum Address`);
    });
    it('Expects to fail if amount not positive', async () => {
      const poolInstance = new Pool(provider, { POOL });

      const amount = '0';
      await expect(async () =>
        poolInstance.supplyWithPermit({
          user,
          reserve,
          amount,
          onBehalfOf,
          referralCode,
          signature,
          deadline,
        }),
      ).rejects.toThrow(`Amount: ${amount} needs to be greater than 0`);
    });
    it('Expects to fail if amount not number', async () => {
      const poolInstance = new Pool(provider, { POOL });

      const amount = 'asdf';
      await expect(async () =>
        poolInstance.supplyWithPermit({
          user,
          reserve,
          amount,
          onBehalfOf,
          referralCode,
          signature,
          deadline,
        }),
      ).rejects.toThrow(`Amount: ${amount} needs to be greater than 0`);
    });
    it('Expects to fail if referralCode not positive', async () => {
      const poolInstance = new Pool(provider, { POOL });

      const referralCode = '-1';
      await expect(async () =>
        poolInstance.supplyWithPermit({
          user,
          reserve,
          amount,
          onBehalfOf,
          referralCode,
          signature,
          deadline,
        }),
      ).rejects.toThrow(`Amount: ${referralCode} needs to be greater or equal than 0`);
    });
    it('Expects the default referral code 0 to be accepted', async () => {
      const poolInstance = new Pool(provider, { POOL });
      jest
        .spyOn(poolInstance.erc20Service, 'decimalsOf')
        .mockReturnValueOnce(Promise.resolve(decimals));

      const txs = await poolInstance.supplyWithPermit({
        user,
        reserve,
        amount,
        onBehalfOf,
        referralCode: '0',
        signature,
        deadline,
      });
      const tx: transactionType = await txs[0].tx();
      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'address', 'uint16', 'uint256', 'uint8', 'bytes32', 'bytes32'],
        dataSlice(tx.data ?? '', 4),
      );
      expect(decoded[3]).toEqual(0n);
    });
    it('Expects the native sentinel to be rejected', async () => {
      const poolInstance = new Pool(provider, { POOL });
      await expect(async () =>
        poolInstance.supplyWithPermit({
          user,
          reserve: API_ETH_MOCK_ADDRESS,
          amount,
          onBehalfOf,
          signature,
          deadline,
        }),
      ).rejects.toThrow('supplyWithPermit requires the wrapped token');
    });
  });
  describe('withdraw', () => {
    const user = '0x0000000000000000000000000000000000000006';
    const reserve = '0x0000000000000000000000000000000000000007';
    const onBehalfOf = '0x0000000000000000000000000000000000000008';
    const aTokenAddress = '0x0000000000000000000000000000000000000009';
    const amount = '123.456';
    const decimals = 18;

    const config = { POOL };

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('Expects the tx object passing all parameters for eth withdraw', async () => {
      const reserve = API_ETH_MOCK_ADDRESS;
      const poolInstance = new Pool(provider, config);
      const withdrawEthSpy = jest
        .spyOn(poolInstance.wethGatewayService, 'withdrawETH')
        .mockReturnValue(Promise.resolve([]));
      await poolInstance.withdraw({
        user,
        reserve,
        amount,
        onBehalfOf,
        aTokenAddress,
      });
      expect(withdrawEthSpy).toHaveBeenCalled();
    });
    it('Expects the tx object passing all parameters but not onBehalfOf', async () => {
      const poolInstance = new Pool(provider, config);
      const decimalsSpy = jest
        .spyOn(poolInstance.erc20Service, 'decimalsOf')
        .mockReturnValueOnce(Promise.resolve(decimals));

      const depositTxObj = await poolInstance.withdraw({
        user,
        reserve,
        amount,
        aTokenAddress,
      });

      expect(decimalsSpy).toHaveBeenCalled();

      expect(depositTxObj.length).toEqual(1);
      const txObj = depositTxObj[0];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(
        BigInt(gasLimitRecommendations[ProtocolAction.withdraw].recommended),
      );

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'address'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, decimals)));
      expect(decoded[2]).toEqual(user);

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual(
        gasLimitRecommendations[ProtocolAction.withdraw].recommended,
      );
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects the tx object passing all params and -1 amount', async () => {
      const poolInstance = new Pool(provider, config);
      const decimalsSpy = jest
        .spyOn(poolInstance.erc20Service, 'decimalsOf')
        .mockReturnValueOnce(Promise.resolve(decimals));
      const amount = '-1';
      const depositTxObj = await poolInstance.withdraw({
        user,
        reserve,
        amount,
        onBehalfOf,
        aTokenAddress,
      });

      expect(decimalsSpy).toHaveBeenCalled();

      expect(depositTxObj.length).toEqual(1);
      const txObj = depositTxObj[0];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(
        BigInt(gasLimitRecommendations[ProtocolAction.withdraw].recommended),
      );

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'address'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(MaxUint256);
      expect(decoded[2]).toEqual(onBehalfOf);

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual(
        gasLimitRecommendations[ProtocolAction.withdraw].recommended,
      );
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects to fail for eth withdraw if not aTokenAddress is passed', async () => {
      const reserve = API_ETH_MOCK_ADDRESS;
      const poolInstance = new Pool(provider, config);

      await expect(async () =>
        poolInstance.withdraw({
          user,
          reserve,
          amount,
          onBehalfOf,
        }),
      ).rejects.toThrow('To withdraw ETH you need to pass the aWETH token address');
    });
    it('Expects to fail when PoolAddress not provided', async () => {
      const poolInstance = new Pool(provider);
      const txObj = await poolInstance.withdraw({
        user,
        reserve,
        amount,
        onBehalfOf,
        aTokenAddress,
      });
      expect(txObj).toEqual([]);
    });
    it('Expects to fail when user not and eth address', async () => {
      const poolInstance = new Pool(provider, config);
      const user = 'asdf';
      await expect(async () =>
        poolInstance.withdraw({
          user,
          reserve,
          amount,
          onBehalfOf,
          aTokenAddress,
        }),
      ).rejects.toThrow(`Address: ${user} is not a valid ethereum Address`);
    });
    it('Expects to fail when reserve not and eth address', async () => {
      const poolInstance = new Pool(provider, config);
      const reserve = 'asdf';
      await expect(async () =>
        poolInstance.withdraw({
          user,
          reserve,
          amount,
          onBehalfOf,
          aTokenAddress,
        }),
      ).rejects.toThrow(`Address: ${reserve} is not a valid ethereum Address`);
    });
    it('Expects to fail when onBehalfOf not and eth address', async () => {
      const poolInstance = new Pool(provider, config);
      const onBehalfOf = 'asdf';
      await expect(async () =>
        poolInstance.withdraw({
          user,
          reserve,
          amount,
          onBehalfOf,
          aTokenAddress,
        }),
      ).rejects.toThrow(`Address: ${onBehalfOf} is not a valid ethereum Address`);
    });
    it('Expects to fail when aTokenAddress not and eth address', async () => {
      const poolInstance = new Pool(provider, config);
      const aTokenAddress = 'asdf';
      await expect(async () =>
        poolInstance.withdraw({
          user,
          reserve,
          amount,
          onBehalfOf,
          aTokenAddress,
        }),
      ).rejects.toThrow(`Address: ${aTokenAddress} is not a valid ethereum Address`);
    });
    it('Expects to fail when amount not positive', async () => {
      const poolInstance = new Pool(provider, config);
      const amount = '0';
      await expect(async () =>
        poolInstance.withdraw({
          user,
          reserve,
          amount,
          onBehalfOf,
          aTokenAddress,
        }),
      ).rejects.toThrow(`Amount: ${amount} needs to be greater than 0`);
    });
    it('Expects to fail when amount not number', async () => {
      const poolInstance = new Pool(provider, config);
      const amount = 'asdf';
      await expect(async () =>
        poolInstance.withdraw({
          user,
          reserve,
          amount,
          onBehalfOf,
          aTokenAddress,
        }),
      ).rejects.toThrow(`Amount: ${amount} needs to be greater than 0`);
    });
  });
  describe('borrow', () => {
    const user = '0x0000000000000000000000000000000000000006';
    const reserve = '0x0000000000000000000000000000000000000007';
    const onBehalfOf = '0x0000000000000000000000000000000000000008';
    const debtTokenAddress = '0x0000000000000000000000000000000000000009';
    const amount = '123.456';
    const decimals = 18;
    const referralCode = '1';
    const interestRateMode = InterestRate.None;

    const config = { POOL };

    afterEach(() => {
      jest.clearAllMocks();
    });
    it('Expects the tx object passing all parameters with borrow eth', async () => {
      const reserve = API_ETH_MOCK_ADDRESS;
      const poolInstance = new Pool(provider, config);
      const borrowEthSpy = jest
        .spyOn(poolInstance.wethGatewayService, 'borrowETH')
        .mockReturnValue(Promise.resolve([]));
      await poolInstance.borrow({
        user,
        reserve,
        amount,
        interestRateMode,
        debtTokenAddress,
        onBehalfOf,
        referralCode,
      });
      expect(borrowEthSpy).toHaveBeenCalled();
    });
    it('Expects the tx object passing all parameters but not onBehalfOf and rate none', async () => {
      const poolInstance = new Pool(provider, config);
      const decimalsSpy = jest
        .spyOn(poolInstance.erc20Service, 'decimalsOf')
        .mockReturnValueOnce(Promise.resolve(decimals));

      const borrowTxObj = await poolInstance.borrow({
        user,
        reserve,
        amount,
        interestRateMode,
        debtTokenAddress,
        referralCode,
      });

      expect(decimalsSpy).toHaveBeenCalled();

      expect(borrowTxObj.length).toEqual(1);
      const txObj = borrowTxObj[0];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(
        BigInt(gasLimitRecommendations[ProtocolAction.borrow].recommended),
      );

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'uint256', 'uint16', 'address'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, decimals)));
      // InterestRate.None selects variable debt on Neverland, matching the gateway.
      expect(decoded[2]).toEqual(BigInt(2));
      expect(decoded[3]).toEqual(BigInt(referralCode));
      expect(decoded[4]).toEqual(user);

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual(
        gasLimitRecommendations[ProtocolAction.borrow].recommended,
      );
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects the tx object passing all parameters but not referralCode and rate stable', async () => {
      const poolInstance = new Pool(provider, config);
      const decimalsSpy = jest
        .spyOn(poolInstance.erc20Service, 'decimalsOf')
        .mockReturnValueOnce(Promise.resolve(decimals));

      const interestRateMode = InterestRate.Stable;
      const borrowTxObj = await poolInstance.borrow({
        user,
        reserve,
        amount,
        interestRateMode,
        debtTokenAddress,
        onBehalfOf,
      });

      expect(decimalsSpy).toHaveBeenCalled();

      expect(borrowTxObj.length).toEqual(1);
      const txObj = borrowTxObj[0];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(
        BigInt(gasLimitRecommendations[ProtocolAction.borrow].recommended),
      );

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'uint256', 'uint16', 'address'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, decimals)));
      expect(decoded[2]).toEqual(BigInt(1));
      expect(decoded[3]).toEqual(0n);
      expect(decoded[4]).toEqual(onBehalfOf);

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual(
        gasLimitRecommendations[ProtocolAction.borrow].recommended,
      );
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects the tx object passing all parameters with Interest rate Variable', async () => {
      const poolInstance = new Pool(provider, config);
      const decimalsSpy = jest
        .spyOn(poolInstance.erc20Service, 'decimalsOf')
        .mockReturnValueOnce(Promise.resolve(decimals));

      const interestRateMode = InterestRate.Variable;
      const borrowTxObj = await poolInstance.borrow({
        user,
        reserve,
        amount,
        interestRateMode,
        debtTokenAddress,
        onBehalfOf,
      });

      expect(decimalsSpy).toHaveBeenCalled();

      expect(borrowTxObj.length).toEqual(1);
      const txObj = borrowTxObj[0];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(
        BigInt(gasLimitRecommendations[ProtocolAction.borrow].recommended),
      );

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'uint256', 'uint16', 'address'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, decimals)));
      expect(decoded[2]).toEqual(BigInt(2));
      expect(decoded[3]).toEqual(0n);
      expect(decoded[4]).toEqual(onBehalfOf);

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual(
        gasLimitRecommendations[ProtocolAction.borrow].recommended,
      );
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects to fail when borrowing eth and not passing debtTokenAddress', async () => {
      const reserve = API_ETH_MOCK_ADDRESS;
      const poolInstance = new Pool(provider, config);

      await expect(async () =>
        poolInstance.borrow({
          user,
          reserve,
          amount,
          interestRateMode,
          onBehalfOf,
          referralCode,
        }),
      ).rejects.toThrow(
        `To borrow ETH you need to pass the stable or variable WETH debt Token Address corresponding the interestRateMode`,
      );
    });
    it('Expects to fail when PoolAddress not provided', async () => {
      const poolInstance = new Pool(provider);

      const txs = await poolInstance.borrow({
        user,
        reserve,
        amount,
        interestRateMode,
        debtTokenAddress,
        onBehalfOf,
        referralCode,
      });
      expect(txs).toEqual([]);
    });
    it('Expects to fail when user not and eth address', async () => {
      const poolInstance = new Pool(provider, config);
      const user = 'asdf';
      await expect(async () =>
        poolInstance.borrow({
          user,
          reserve,
          amount,
          interestRateMode,
          debtTokenAddress,
          onBehalfOf,
          referralCode,
        }),
      ).rejects.toThrow(`Address: ${user} is not a valid ethereum Address`);
    });
    it('Expects to fail when reserve not and eth address', async () => {
      const poolInstance = new Pool(provider, config);
      const reserve = 'asdf';
      await expect(async () =>
        poolInstance.borrow({
          user,
          reserve,
          amount,
          interestRateMode,
          debtTokenAddress,
          onBehalfOf,
          referralCode,
        }),
      ).rejects.toThrow(`Address: ${reserve} is not a valid ethereum Address`);
    });
    it('Expects to fail when onBehalfOf not and eth address', async () => {
      const poolInstance = new Pool(provider, config);
      const onBehalfOf = 'asdf';
      await expect(async () =>
        poolInstance.borrow({
          user,
          reserve,
          amount,
          interestRateMode,
          debtTokenAddress,
          onBehalfOf,
          referralCode,
        }),
      ).rejects.toThrow(`Address: ${onBehalfOf} is not a valid ethereum Address`);
    });
    it('Expects to fail when debtTokenAddress not and eth address', async () => {
      const poolInstance = new Pool(provider, config);
      const debtTokenAddress = 'asdf';
      await expect(async () =>
        poolInstance.borrow({
          user,
          reserve,
          amount,
          interestRateMode,
          debtTokenAddress,
          onBehalfOf,
          referralCode,
        }),
      ).rejects.toThrow(`Address: ${debtTokenAddress} is not a valid ethereum Address`);
    });
    it('Expects to fail when amount not positive', async () => {
      const poolInstance = new Pool(provider, config);
      const amount = '0';
      await expect(async () =>
        poolInstance.borrow({
          user,
          reserve,
          amount,
          interestRateMode,
          debtTokenAddress,
          onBehalfOf,
          referralCode,
        }),
      ).rejects.toThrow(`Amount: ${amount} needs to be greater than 0`);
    });
    it('Expects to fail when amount not number', async () => {
      const poolInstance = new Pool(provider, config);
      const amount = 'asfd';
      await expect(async () =>
        poolInstance.borrow({
          user,
          reserve,
          amount,
          interestRateMode,
          debtTokenAddress,
          onBehalfOf,
          referralCode,
        }),
      ).rejects.toThrow(`Amount: ${amount} needs to be greater than 0`);
    });
  });
  describe('repay', () => {
    const user = '0x0000000000000000000000000000000000000006';
    const reserve = '0x0000000000000000000000000000000000000007';
    const onBehalfOf = '0x0000000000000000000000000000000000000008';
    const amount = '123.456';
    const decimals = 18;
    const interestRateMode = InterestRate.None;

    const config = { POOL };

    afterEach(() => {
      jest.clearAllMocks();
    });
    it('Expects the tx object passing all params with repay eth', async () => {
      const reserve = API_ETH_MOCK_ADDRESS;
      const poolInstance = new Pool(provider, config);
      const repayEthSpy = jest
        .spyOn(poolInstance.wethGatewayService, 'repayETH')
        .mockReturnValue([]);
      await poolInstance.repay({
        user,
        reserve,
        amount,
        interestRateMode,
        onBehalfOf,
      });
      expect(repayEthSpy).toHaveBeenCalled();
    });
    it('Expects the tx object passing all params without onBehalfOf and no approval', async () => {
      const poolInstance = new Pool(provider, config);
      const isApprovedSpy = jest
        .spyOn(poolInstance.erc20Service, 'isApproved')
        .mockImplementationOnce(async () => Promise.resolve(true));
      const decimalsSpy = jest
        .spyOn(poolInstance.erc20Service, 'decimalsOf')
        .mockReturnValueOnce(Promise.resolve(decimals));

      const depositTxObj = await poolInstance.repay({
        user,
        reserve,
        amount,
        interestRateMode,
      });
      expect(isApprovedSpy).toHaveBeenCalled();
      expect(decimalsSpy).toHaveBeenCalled();

      expect(depositTxObj.length).toEqual(1);
      const txObj = depositTxObj[0];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(
        BigInt(gasLimitRecommendations[ProtocolAction.repay].recommended),
      );
      expect(tx.value).toEqual(DEFAULT_NULL_VALUE_ON_TX);

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'uint256', 'address'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, decimals)));
      // InterestRate.None selects variable debt on Neverland, matching the gateway.
      expect(decoded[2]).toEqual(BigInt(2));
      expect(decoded[3]).toEqual(user);

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual(gasLimitRecommendations[ProtocolAction.repay].recommended);
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects the tx object passing all params with amount -1 with approve needed and rate stable', async () => {
      const poolInstance = new Pool(provider, config);
      const isApprovedSpy = jest
        .spyOn(poolInstance.erc20Service, 'isApproved')
        .mockImplementationOnce(async () => Promise.resolve(false));
      const decimalsSpy = jest
        .spyOn(poolInstance.erc20Service, 'decimalsOf')
        .mockReturnValueOnce(Promise.resolve(decimals));
      const approveSpy = jest.spyOn(poolInstance.erc20Service, 'approve').mockReturnValueOnce({
        txType: eEthereumTxType.ERC20_APPROVAL,
        tx: async () => ({}),
        gas: async () => ({
          gasLimit: '1',
          gasPrice: '1',
        }),
      });

      const amount = '-1';
      const interestRateMode = InterestRate.Stable;
      const reapyTxObj = await poolInstance.repay({
        user,
        reserve,
        amount,
        interestRateMode,
        onBehalfOf,
      });
      expect(approveSpy).toHaveBeenCalled();
      expect(isApprovedSpy).toHaveBeenCalled();
      expect(decimalsSpy).toHaveBeenCalled();

      expect(reapyTxObj.length).toEqual(2);
      const txObj = reapyTxObj[1];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(
        BigInt(gasLimitRecommendations[ProtocolAction.repay].recommended),
      );
      expect(tx.value).toEqual(DEFAULT_NULL_VALUE_ON_TX);

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'uint256', 'address'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(MaxUint256);
      expect(decoded[2]).toEqual(BigInt(1));
      expect(decoded[3]).toEqual(onBehalfOf);

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual(gasLimitRecommendations[ProtocolAction.repay].limit);
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects the tx object passing all params with with specific amount and synthetix repayment with valid amount and rate variable', async () => {
      const poolInstance = new Pool(provider, config);
      const isApprovedSpy = jest
        .spyOn(poolInstance.erc20Service, 'isApproved')
        .mockImplementationOnce(async () => Promise.resolve(false));
      const decimalsSpy = jest
        .spyOn(poolInstance.erc20Service, 'decimalsOf')
        .mockReturnValueOnce(Promise.resolve(decimals));
      const approveSpy = jest.spyOn(poolInstance.erc20Service, 'approve').mockReturnValueOnce({
        txType: eEthereumTxType.ERC20_APPROVAL,
        tx: async () => ({}),
        gas: async () => ({
          gasLimit: '1',
          gasPrice: '1',
        }),
      });

      const interestRateMode = InterestRate.Variable;
      const reapyTxObj = await poolInstance.repay({
        user,
        reserve,
        amount,
        interestRateMode,
        onBehalfOf,
      });
      expect(approveSpy).toHaveBeenCalled();
      expect(isApprovedSpy).toHaveBeenCalled();
      expect(decimalsSpy).toHaveBeenCalled();

      expect(reapyTxObj.length).toEqual(2);
      const txObj = reapyTxObj[1];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(
        BigInt(gasLimitRecommendations[ProtocolAction.repay].recommended),
      );
      expect(tx.value).toEqual(DEFAULT_NULL_VALUE_ON_TX);

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'uint256', 'address'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, decimals)));
      expect(decoded[2]).toEqual(BigInt(2));
      expect(decoded[3]).toEqual(onBehalfOf);

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual(gasLimitRecommendations[ProtocolAction.repay].limit);
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects to fail when PoolAddress not provided', async () => {
      const poolInstance = new Pool(provider);
      const txObj = await poolInstance.repay({
        user,
        reserve,
        amount,
        interestRateMode,
        onBehalfOf,
      });
      expect(txObj).toEqual([]);
    });
    it('Expects to fail when user not and eth address', async () => {
      const poolInstance = new Pool(provider, config);
      const user = 'asdf';
      await expect(async () =>
        poolInstance.repay({
          user,
          reserve,
          amount,
          interestRateMode,
          onBehalfOf,
        }),
      ).rejects.toThrow(`Address: ${user} is not a valid ethereum Address`);
    });
    it('Expects to fail when reserve not and eth address', async () => {
      const poolInstance = new Pool(provider, config);
      const reserve = 'asdf';
      await expect(async () =>
        poolInstance.repay({
          user,
          reserve,
          amount,
          interestRateMode,
          onBehalfOf,
        }),
      ).rejects.toThrow(`Address: ${reserve} is not a valid ethereum Address`);
    });
    it('Expects to fail when onBehalfOf not and eth address', async () => {
      const poolInstance = new Pool(provider, config);
      const onBehalfOf = 'asdf';
      await expect(async () =>
        poolInstance.repay({
          user,
          reserve,
          amount,
          interestRateMode,
          onBehalfOf,
        }),
      ).rejects.toThrow(`Address: ${onBehalfOf} is not a valid ethereum Address`);
    });
    it('Expects to fail when amount 0', async () => {
      const poolInstance = new Pool(provider, config);
      const amount = '0';
      await expect(async () =>
        poolInstance.repay({
          user,
          reserve,
          amount,
          interestRateMode,
          onBehalfOf,
        }),
      ).rejects.toThrow(`Amount: ${amount} needs to be greater than 0`);
    });
    it('Expects to fail when amount not number', async () => {
      const poolInstance = new Pool(provider, config);
      const amount = 'asdf';
      await expect(async () =>
        poolInstance.repay({
          user,
          reserve,
          amount,
          interestRateMode,
          onBehalfOf,
        }),
      ).rejects.toThrow(`Amount: ${amount} needs to be greater than 0`);
    });
  });
  describe('repayWithPermit', () => {
    const user = '0x0000000000000000000000000000000000000006';
    const reserve = '0x0000000000000000000000000000000000000007';
    const onBehalfOf = '0x0000000000000000000000000000000000000008';
    const amount = '123.456';
    const decimals = 18;
    const interestRateMode = InterestRate.None;
    const deadline = Math.round(Date.now() / 1000 + 3600).toString();
    // const message = 'victor washington'
    const signature =
      '0x532f8df4e2502bd869fb35e9301156f9b307380afdcc25cfbc87b2e939f16f7e47c326dc26eb918d327358797ee67ad7415d871ef7eaf0d4f6352d3ad021fbb41c';

    const config = { POOL };

    afterEach(() => {
      jest.clearAllMocks();
    });
    it('Expects the tx object passing all params without onBehalfOf', async () => {
      const poolInstance = new Pool(provider, config);
      const decimalsSpy = jest
        .spyOn(poolInstance.erc20Service, 'decimalsOf')
        .mockReturnValueOnce(Promise.resolve(decimals));

      const depositTxObj = await poolInstance.repayWithPermit({
        user,
        reserve,
        amount,
        interestRateMode,
        signature,
        deadline,
      });
      expect(decimalsSpy).toHaveBeenCalled();

      expect(depositTxObj.length).toEqual(1);
      const txObj = depositTxObj[0];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(
        BigInt(gasLimitRecommendations[ProtocolAction.repayWithPermit].recommended),
      );
      expect(tx.value).toEqual(DEFAULT_NULL_VALUE_ON_TX);

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'uint256', 'address', 'uint256', 'uint8', 'bytes32', 'bytes32'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, decimals)));
      // InterestRate.None selects variable debt on Neverland, matching the gateway.
      expect(decoded[2]).toEqual(BigInt(2));
      expect(decoded[3]).toEqual(user);
      expect(decoded[4]).toEqual(BigInt(deadline));
      expect(decoded[5]).toEqual(28n);
      expect(decoded[6]).toEqual(
        '0x532f8df4e2502bd869fb35e9301156f9b307380afdcc25cfbc87b2e939f16f7e',
      );
      expect(decoded[7]).toEqual(
        '0x47c326dc26eb918d327358797ee67ad7415d871ef7eaf0d4f6352d3ad021fbb4',
      );

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual(
        gasLimitRecommendations[ProtocolAction.repayWithPermit].recommended,
      );
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects the tx object passing all params with amount -1 and rate stable', async () => {
      const poolInstance = new Pool(provider, config);
      const decimalsSpy = jest
        .spyOn(poolInstance.erc20Service, 'decimalsOf')
        .mockReturnValueOnce(Promise.resolve(decimals));

      const amount = '-1';
      const interestRateMode = InterestRate.Stable;
      const reapyTxObj = await poolInstance.repayWithPermit({
        user,
        reserve,
        amount,
        interestRateMode,
        onBehalfOf,
        signature,
        deadline,
      });
      expect(decimalsSpy).toHaveBeenCalled();

      expect(reapyTxObj.length).toEqual(1);
      const txObj = reapyTxObj[0];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(
        BigInt(gasLimitRecommendations[ProtocolAction.repayWithPermit].recommended),
      );
      expect(tx.value).toEqual(DEFAULT_NULL_VALUE_ON_TX);

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'uint256', 'address', 'uint256', 'uint8', 'bytes32', 'bytes32'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(MaxUint256);
      expect(decoded[2]).toEqual(BigInt(1));
      expect(decoded[3]).toEqual(onBehalfOf);
      expect(decoded[4]).toEqual(BigInt(deadline));
      expect(decoded[5]).toEqual(28n);
      expect(decoded[6]).toEqual(
        '0x532f8df4e2502bd869fb35e9301156f9b307380afdcc25cfbc87b2e939f16f7e',
      );
      expect(decoded[7]).toEqual(
        '0x47c326dc26eb918d327358797ee67ad7415d871ef7eaf0d4f6352d3ad021fbb4',
      );

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual(
        gasLimitRecommendations[ProtocolAction.repayWithPermit].recommended,
      );
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects the tx object passing all params with with specific amount and synthetix repayment with valid amount and rate variable', async () => {
      const poolInstance = new Pool(provider, config);
      const decimalsSpy = jest
        .spyOn(poolInstance.erc20Service, 'decimalsOf')
        .mockReturnValueOnce(Promise.resolve(decimals));

      const interestRateMode = InterestRate.Variable;
      const reapyTxObj = await poolInstance.repayWithPermit({
        user,
        reserve,
        amount,
        interestRateMode,
        onBehalfOf,
        signature,
        deadline,
      });
      expect(decimalsSpy).toHaveBeenCalled();

      expect(reapyTxObj.length).toEqual(1);
      const txObj = reapyTxObj[0];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(
        BigInt(gasLimitRecommendations[ProtocolAction.repayWithPermit].recommended),
      );
      expect(tx.value).toEqual(DEFAULT_NULL_VALUE_ON_TX);

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'uint256', 'address', 'uint256', 'uint8', 'bytes32', 'bytes32'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, decimals)));
      expect(decoded[2]).toEqual(BigInt(2));
      expect(decoded[3]).toEqual(onBehalfOf);
      expect(decoded[4]).toEqual(BigInt(deadline));
      expect(decoded[5]).toEqual(28n);
      expect(decoded[6]).toEqual(
        '0x532f8df4e2502bd869fb35e9301156f9b307380afdcc25cfbc87b2e939f16f7e',
      );
      expect(decoded[7]).toEqual(
        '0x47c326dc26eb918d327358797ee67ad7415d871ef7eaf0d4f6352d3ad021fbb4',
      );

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual(
        gasLimitRecommendations[ProtocolAction.repayWithPermit].recommended,
      );
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects to fail when PoolAddress not provided', async () => {
      const poolInstance = new Pool(provider);
      const txObj = await poolInstance.repayWithPermit({
        user,
        reserve,
        amount,
        interestRateMode,
        onBehalfOf,
        signature,
        deadline,
      });
      expect(txObj).toEqual([]);
    });
    it('Expects to fail when user not and eth address', async () => {
      const poolInstance = new Pool(provider, config);
      const user = 'asdf';
      await expect(async () =>
        poolInstance.repayWithPermit({
          user,
          reserve,
          amount,
          interestRateMode,
          onBehalfOf,
          signature,
          deadline,
        }),
      ).rejects.toThrow(`Address: ${user} is not a valid ethereum Address`);
    });
    it('Expects to fail when reserve not and eth address', async () => {
      const poolInstance = new Pool(provider, config);
      const reserve = 'asdf';
      await expect(async () =>
        poolInstance.repayWithPermit({
          user,
          reserve,
          amount,
          interestRateMode,
          onBehalfOf,
          signature,
          deadline,
        }),
      ).rejects.toThrow(`Address: ${reserve} is not a valid ethereum Address`);
    });
    it('Expects to fail when onBehalfOf not and eth address', async () => {
      const poolInstance = new Pool(provider, config);
      const onBehalfOf = 'asdf';
      await expect(async () =>
        poolInstance.repayWithPermit({
          user,
          reserve,
          amount,
          interestRateMode,
          onBehalfOf,
          signature,
          deadline,
        }),
      ).rejects.toThrow(`Address: ${onBehalfOf} is not a valid ethereum Address`);
    });
    it('Expects to fail when amount 0', async () => {
      const poolInstance = new Pool(provider, config);
      const amount = '0';
      await expect(async () =>
        poolInstance.repayWithPermit({
          user,
          reserve,
          amount,
          interestRateMode,
          onBehalfOf,
          signature,
          deadline,
        }),
      ).rejects.toThrow(`Amount: ${amount} needs to be greater than 0`);
    });
    it('Expects to fail when amount not number', async () => {
      const poolInstance = new Pool(provider, config);
      const amount = 'asdf';
      await expect(async () =>
        poolInstance.repayWithPermit({
          user,
          reserve,
          amount,
          interestRateMode,
          onBehalfOf,
          signature,
          deadline,
        }),
      ).rejects.toThrow(`Amount: ${amount} needs to be greater than 0`);
    });
  });
  describe('setUsageAsCollateral', () => {
    const user = '0x0000000000000000000000000000000000000006';
    const reserve = '0x0000000000000000000000000000000000000007';
    const usageAsCollateral = true;

    const config = { POOL };

    afterEach(() => {
      jest.clearAllMocks();
    });
    it('Expects the tx object passing all params with usage as collateral true', async () => {
      const poolInstance = new Pool(provider, config);

      const setUsageAsCollateralTxObj = await poolInstance.setUsageAsCollateral({
        user,
        reserve,
        usageAsCollateral,
      });

      expect(setUsageAsCollateralTxObj.length).toEqual(1);
      const txObj = setUsageAsCollateralTxObj[0];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(BigInt(1));
      expect(tx.value).toEqual(DEFAULT_NULL_VALUE_ON_TX);

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'bool'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(usageAsCollateral);

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual('1');
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects the tx object passing all params with usage as collateral false', async () => {
      const poolInstance = new Pool(provider, config);

      const usageAsCollateral = false;
      const setUsageAsCollateralTxObj = await poolInstance.setUsageAsCollateral({
        user,
        reserve,
        usageAsCollateral,
      });

      expect(setUsageAsCollateralTxObj.length).toEqual(1);
      const txObj = setUsageAsCollateralTxObj[0];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(BigInt(1));
      expect(tx.value).toEqual(DEFAULT_NULL_VALUE_ON_TX);

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'bool'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(usageAsCollateral);

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual('1');
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects to fail when PoolAddress not provided', async () => {
      const poolInstance = new Pool(provider);
      const txObj = await poolInstance.setUsageAsCollateral({
        user,
        reserve,
        usageAsCollateral,
      });
      expect(txObj).toEqual([]);
    });
    it('Expects to fail when user not and eth address', async () => {
      const poolInstance = new Pool(provider, config);
      const user = 'asdf';
      await expect(async () =>
        poolInstance.setUsageAsCollateral({
          user,
          reserve,
          usageAsCollateral,
        }),
      ).rejects.toThrow(`Address: ${user} is not a valid ethereum Address`);
    });
    it('Expects to fail when reserve not and eth address', async () => {
      const poolInstance = new Pool(provider, config);
      const reserve = 'asdf';
      await expect(async () =>
        poolInstance.setUsageAsCollateral({
          user,
          reserve,
          usageAsCollateral,
        }),
      ).rejects.toThrow(`Address: ${reserve} is not a valid ethereum Address`);
    });
  });
  describe('repayWithATokens', () => {
    const user = '0x0000000000000000000000000000000000000006';
    const reserve = '0x0000000000000000000000000000000000000007';
    const amount = '123.456';
    const decimals = 18;
    const rateMode = InterestRate.None;

    const config = { POOL };

    afterEach(() => {
      jest.clearAllMocks();
    });
    it('Expects to fail if passing all params with repay eth address', async () => {
      const reserve = API_ETH_MOCK_ADDRESS;
      const poolInstance = new Pool(provider, config);

      await expect(async () =>
        poolInstance.repayWithATokens({
          user,
          reserve,
          amount,
          rateMode,
        }),
      ).rejects.toThrow('Can not repay with aTokens with eth. Should be WETH instead');
    });
    it('Expects the tx object passing all params with amount -1 with rate stable', async () => {
      const poolInstance = new Pool(provider, config);
      const decimalsSpy = jest
        .spyOn(poolInstance.erc20Service, 'decimalsOf')
        .mockReturnValueOnce(Promise.resolve(decimals));

      const amount = '-1';
      const rateMode = InterestRate.Stable;
      const reapyTxObj = await poolInstance.repayWithATokens({
        user,
        reserve,
        amount,
        rateMode,
      });
      expect(decimalsSpy).toHaveBeenCalled();

      expect(reapyTxObj.length).toEqual(1);
      const txObj = reapyTxObj[0];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(BigInt(1));
      expect(tx.value).toEqual(DEFAULT_NULL_VALUE_ON_TX);

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'uint256'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(MaxUint256);
      expect(decoded[2]).toEqual(BigInt(1));

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual('1');
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects the tx object passing all params with with specific amount and rate variable', async () => {
      const poolInstance = new Pool(provider, config);
      const decimalsSpy = jest
        .spyOn(poolInstance.erc20Service, 'decimalsOf')
        .mockReturnValueOnce(Promise.resolve(decimals));

      const rateMode = InterestRate.Variable;
      const reapyTxObj = await poolInstance.repayWithATokens({
        user,
        reserve,
        amount,
        rateMode,
      });

      expect(decimalsSpy).toHaveBeenCalled();

      expect(reapyTxObj.length).toEqual(1);
      const txObj = reapyTxObj[0];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(BigInt(1));
      expect(tx.value).toEqual(DEFAULT_NULL_VALUE_ON_TX);

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'uint256'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(reserve);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, decimals)));
      expect(decoded[2]).toEqual(BigInt(2));

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual('1');
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects to fail when PoolAddress not provided', async () => {
      const poolInstance = new Pool(provider);
      const txObj = await poolInstance.repayWithATokens({
        user,
        reserve,
        amount,
        rateMode,
      });
      expect(txObj).toEqual([]);
    });
    it('Expects to fail when user not and eth address', async () => {
      const poolInstance = new Pool(provider, config);
      const user = 'asdf';
      await expect(async () =>
        poolInstance.repayWithATokens({
          user,
          reserve,
          amount,
          rateMode,
        }),
      ).rejects.toThrow(`Address: ${user} is not a valid ethereum Address`);
    });
    it('Expects to fail when reserve not and eth address', async () => {
      const poolInstance = new Pool(provider, config);
      const reserve = 'asdf';
      await expect(async () =>
        poolInstance.repayWithATokens({
          user,
          reserve,
          amount,
          rateMode,
        }),
      ).rejects.toThrow(`Address: ${reserve} is not a valid ethereum Address`);
    });
    it('Expects to fail when amount 0', async () => {
      const poolInstance = new Pool(provider, config);
      const amount = '0';
      await expect(async () =>
        poolInstance.repayWithATokens({
          user,
          reserve,
          amount,
          rateMode,
        }),
      ).rejects.toThrow(`Amount: ${amount} needs to be greater than 0`);
    });
    it('Expects to fail when amount not number', async () => {
      const poolInstance = new Pool(provider, config);
      const amount = 'asdf';
      await expect(async () =>
        poolInstance.repayWithATokens({
          user,
          reserve,
          amount,
          rateMode,
        }),
      ).rejects.toThrow(`Amount: ${amount} needs to be greater than 0`);
    });
  });
  describe('setUserEMode', () => {
    const user = '0x0000000000000000000000000000000000000006';
    const categoryId = 1;

    const config = { POOL };

    afterEach(() => {
      jest.clearAllMocks();
    });
    it('Expects the tx object when passing all params', async () => {
      const poolInstance = new Pool(provider, config);

      const setUserEModeTxObj = poolInstance.setUserEMode({
        user,
        categoryId,
      });

      expect(setUserEModeTxObj.length).toEqual(1);
      const txObj = setUserEModeTxObj[0];
      expect(txObj.txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(POOL);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(BigInt(1));
      expect(tx.value).toEqual(DEFAULT_NULL_VALUE_ON_TX);

      const decoded = AbiCoder.defaultAbiCoder().decode(['uint8'], dataSlice(tx.data ?? '', 4));

      expect(decoded[0]).toEqual(BigInt(categoryId));

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual('1');
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects to fail when PoolAddress not provided', () => {
      const poolInstance = new Pool(provider);
      const txObj = poolInstance.setUserEMode({
        user,
        categoryId,
      });
      expect(txObj).toEqual([]);
    });
    it('Expects to fail when user not and eth address', () => {
      const poolInstance = new Pool(provider, config);
      const user = 'asdf';
      expect(() =>
        poolInstance.setUserEMode({
          user,
          categoryId,
        }),
      ).toThrow(`Address: ${user} is not a valid ethereum Address`);
    });
    it('Expects to fail when categoryId not positive or 0', () => {
      const poolInstance = new Pool(provider, config);
      const categoryId = -1;
      expect(() =>
        poolInstance.setUserEMode({
          user,
          categoryId,
        }),
      ).toThrow(`Amount: ${categoryId} needs to be greater or equal than 0`);
    });
  });
  describe('getReserveData', () => {
    const config = { POOL };

    it('should fail when an invalid eth address is passed in', async () => {
      const poolInstance = new Pool(provider, config);
      await expect(async () => poolInstance.getReserveData('not an address')).rejects.toThrow();
    });
  });
  describe('getReserveData', () => {
    const config = { POOL };

    it('should fail when an invalid eth address is passed in', async () => {
      const poolInstance = new Pool(provider, config);
      await expect(async () => poolInstance.getReserveData('not an address')).rejects.toThrow();
    });
  });
});
