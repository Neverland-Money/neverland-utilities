import { AbiCoder, dataSlice, FeeData, MaxUint256 } from 'ethers';
import { OfflineProvider } from '../__tests__/offline-provider';
import { eEthereumTxType, type GasType, type transactionType } from '../commons/types';
import { valueToWei } from '../commons/utils';
import { ERC20Service } from '../erc20-contract';
import { InterestRate } from '../interest-rate';
import { WETHGatewayService } from '.';

jest.mock('../commons/gas-station', () => {
  return {
    __esModule: true,
    estimateGasByNetwork: jest.fn().mockImplementation(async () => Promise.resolve(BigInt(1))),
    estimateGas: jest.fn(async () => Promise.resolve(BigInt(1))),
  };
});

describe('WethGatewayService', () => {
  const wethGatewayAddress = '0x0000000000000000000000000000000000000001';
  const lendingPool = '0x0000000000000000000000000000000000000002';
  describe('Initialization', () => {
    const provider: OfflineProvider = new OfflineProvider();
    const erc20Service = new ERC20Service(provider);
    it('Expects to be initialized', () => {
      expect(
        () => new WETHGatewayService(provider, erc20Service, wethGatewayAddress),
      ).not.toThrow();
    });
    it('Expects to initialize without wethgateway address', () => {
      expect(() => new WETHGatewayService(provider, erc20Service)).not.toThrow();
    });
  });
  describe('generateDepositEthTxData', () => {
    it('generates depositETH tx data', () => {
      const provider: OfflineProvider = new OfflineProvider();
      const erc20Service = new ERC20Service(provider);
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const user = '0x0000000000000000000000000000000000000003';
      const txData = weth.generateDepositEthTxData({
        lendingPool,
        user,
        amount: '1',
      });

      expect(txData.to).toEqual(wethGatewayAddress);
      expect(txData.from).toEqual(user);
      expect(txData.data).toEqual(
        '0x474cf53d000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000000',
      );

      const onBehalfOf = '0x0000000000000000000000000000000000000004';

      const txDataUpdatedParams = weth.generateDepositEthTxData({
        lendingPool,
        user,
        amount: '1',
        onBehalfOf,
        referralCode: '0',
      });

      expect(txDataUpdatedParams.to).toEqual(wethGatewayAddress);
      expect(txDataUpdatedParams.from).toEqual(user);
      expect(txDataUpdatedParams.data).toEqual(
        '0x474cf53d000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000',
      );
    });
  });
  describe('generateBorrowEthTxData', () => {
    it('generates borrowETH tx data', async () => {
      const provider: OfflineProvider = new OfflineProvider();
      const erc20Service = new ERC20Service(provider);
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const user = '0x0000000000000000000000000000000000000003';
      const txData = weth.generateBorrowEthTxData({
        interestRateMode: InterestRate.Variable,
        lendingPool,
        user,
        amount: '1',
        referralCode: '0',
      });

      expect(txData.to).toEqual(wethGatewayAddress);
      expect(txData.from).toEqual(user);
      expect(txData.data).toEqual(
        '0x66514c970000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000',
      );

      const txDataStable = weth.generateBorrowEthTxData({
        interestRateMode: InterestRate.Variable,
        lendingPool,
        user,
        amount: '1',
        debtTokenAddress: '',
      });

      expect(txDataStable.data).toEqual(
        '0x66514c970000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000',
      );
    });
  });
  describe('generateRepayEthTxData', () => {
    it('generates repayETH tx data with variable debt', () => {
      const provider: OfflineProvider = new OfflineProvider();
      const erc20Service = new ERC20Service(provider);
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const user = '0x0000000000000000000000000000000000000003';
      const txData = weth.generateRepayEthTxData({
        interestRateMode: InterestRate.Variable,
        lendingPool,
        user,
        amount: '1',
      });

      expect(txData.to).toEqual(wethGatewayAddress);
      expect(txData.from).toEqual(user);
      expect(txData.data).toEqual(
        '0x02c5fcf80000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000003',
      );

      const onBehalfOf = '0x0000000000000000000000000000000000000004';

      const txDataUpdatedParams = weth.generateRepayEthTxData({
        interestRateMode: InterestRate.Variable,
        lendingPool,
        user,
        amount: '1',
        onBehalfOf,
      });

      expect(txDataUpdatedParams.to).toEqual(wethGatewayAddress);
      expect(txDataUpdatedParams.from).toEqual(user);
      expect(txDataUpdatedParams.data).toEqual(
        '0x02c5fcf80000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000004',
      );
    });
  });
  describe('depositETH', () => {
    const user = '0x0000000000000000000000000000000000000003';
    const onBehalfOf = '0x0000000000000000000000000000000000000004';
    const amount = '123.456';
    const referralCode = '0';
    const provider: OfflineProvider = new OfflineProvider();
    jest
      .spyOn(provider, 'getFeeData')
      .mockImplementation(async () => Promise.resolve(new FeeData(1n)));
    const erc20Service = new ERC20Service(provider);
    afterEach(() => {
      jest.clearAllMocks();
    });

    it('Expects the deposit tx object to be correct with all params', async () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const txObj = weth.depositETH({
        lendingPool,
        user,
        amount,
        onBehalfOf,
        referralCode,
      });
      expect(txObj.length).toEqual(1);
      expect(txObj[0].txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj[0].tx();
      expect(tx.to).toEqual(wethGatewayAddress);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(BigInt(1));

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'address', 'uint16'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(lendingPool);
      expect(decoded[1]).toEqual(onBehalfOf);
      expect(decoded[2]).toEqual(BigInt(referralCode));

      // gas price
      const gasPrice: GasType | null = await txObj[0].gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual('1');
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects the deposit tx object to be correct without onBehalfOf', async () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const txObj = weth.depositETH({
        lendingPool,
        user,
        amount,
        referralCode,
      });
      expect(txObj.length).toEqual(1);
      expect(txObj[0].txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj[0].tx();
      expect(tx.to).toEqual(wethGatewayAddress);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(BigInt(1));

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'address', 'uint16'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(lendingPool);
      expect(decoded[1]).toEqual(user);
      expect(decoded[2]).toEqual(BigInt(referralCode));

      // gas price
      const gasPrice: GasType | null = await txObj[0].gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual('1');
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects the deposit tx object to be correct without referralCode', async () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const txObj = weth.depositETH({
        lendingPool,
        user,
        amount,
      });
      expect(txObj.length).toEqual(1);
      expect(txObj[0].txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj[0].tx();
      expect(tx.to).toEqual(wethGatewayAddress);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(BigInt(1));

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'address', 'uint16'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(lendingPool);
      expect(decoded[1]).toEqual(user);
      expect(decoded[2]).toEqual(0n);

      // gas price
      const gasPrice: GasType | null = await txObj[0].gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual('1');
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects to fail when initialized without gateway address', () => {
      const weth = new WETHGatewayService(provider, erc20Service);

      const txObj = weth.depositETH({
        lendingPool,
        user,
        amount,
      });

      expect(txObj.length).toEqual(0);
    });
    it('Expects to fail when user is not address', () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const user = 'asdf';
      expect(() =>
        weth.depositETH({
          lendingPool,
          user,
          amount,
          onBehalfOf,
          referralCode,
        }),
      ).toThrow(`Address: ${user} is not a valid ethereum Address`);
    });
    it('Expects to fail when lendingPool is not address', () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const lendingPool = 'asdf';
      expect(() =>
        weth.depositETH({
          lendingPool,
          user,
          amount,
          onBehalfOf,
          referralCode,
        }),
      ).toThrow(`Address: ${lendingPool} is not a valid ethereum Address`);
    });
    it('Expects to fail when amount is not positive', () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const amount = '0';
      expect(() =>
        weth.depositETH({
          lendingPool,
          user,
          amount,
          onBehalfOf,
          referralCode,
        }),
      ).toThrow(`Amount: ${amount} needs to be greater than 0`);
    });
    it('Expects to fail when amount is not number', () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const amount = 'asdf';
      expect(() =>
        weth.depositETH({
          lendingPool,
          user,
          amount,
          onBehalfOf,
          referralCode,
        }),
      ).toThrow(`Amount: ${amount} needs to be greater than 0`);
    });
    it('Expects to fail when onBehalfOf is not address', () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const onBehalfOf = 'asdf';
      expect(() =>
        weth.depositETH({
          lendingPool,
          user,
          amount,
          onBehalfOf,
          referralCode,
        }),
      ).toThrow(`Address: ${onBehalfOf} is not a valid ethereum Address`);
    });
    it('Expects to fail when referral is not number', () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const referralCode = 'asdf';
      expect(() =>
        weth.depositETH({
          lendingPool,
          user,
          amount,
          onBehalfOf,
          referralCode,
        }),
      ).toThrow(`Amount: ${referralCode} needs to be greater or equal than 0`);
    });
  });
  describe('borrowETH', () => {
    const user = '0x0000000000000000000000000000000000000003';
    const debtTokenAddress = '0x0000000000000000000000000000000000000005';
    const amount = '123.456';
    const referralCode = '0';
    const provider: OfflineProvider = new OfflineProvider();
    jest
      .spyOn(provider, 'getFeeData')
      .mockImplementation(async () => Promise.resolve(new FeeData(1n)));
    const erc20Service = new ERC20Service(provider);

    afterEach(() => {
      jest.clearAllMocks();
    });
    it('Expects the borrow tx object to be correct with all params and variable rate without approval', async () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);

      const isApprovedSpy = jest
        .spyOn(weth.baseDebtTokenService, 'isDelegationApproved')
        .mockImplementation(async () => Promise.resolve(false));

      const approveSpy = jest
        .spyOn(weth.baseDebtTokenService, 'approveDelegation')
        .mockImplementation(() => ({
          txType: eEthereumTxType.ERC20_APPROVAL,
          tx: async () => ({}),
          gas: async () => ({
            gasLimit: '1',
            gasPrice: '1',
          }),
        }));
      const txObj = await weth.borrowETH({
        interestRateMode: InterestRate.Variable,
        lendingPool,
        user,
        amount,
        debtTokenAddress,
        referralCode,
      });

      await expect(async () =>
        weth.borrowETH({
          interestRateMode: InterestRate.Variable,
          lendingPool,
          user,
          amount,
          referralCode,
        }),
      ).rejects.toThrow(`To borrow ETH you need to pass the variable WETH debt Token Address`);

      expect(isApprovedSpy).toHaveBeenCalled();
      expect(approveSpy).toHaveBeenCalled();
      expect(txObj.length).toEqual(2);
      expect(txObj[1].txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj[1].tx();
      expect(tx.to).toEqual(wethGatewayAddress);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(BigInt(1));

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'uint256', 'uint16'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(lendingPool);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, 18)));
      expect(decoded[2]).toEqual(2n);
      expect(decoded[3]).toEqual(BigInt(referralCode));

      // gas price
      const gasPrice: GasType | null = await txObj[1].gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual('450000');
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects the borrow tx object to be correct with all params and variable rate already approved', async () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);

      const isApprovedSpy = jest
        .spyOn(weth.baseDebtTokenService, 'isDelegationApproved')
        .mockImplementation(async () => Promise.resolve(true));

      const txObj = await weth.borrowETH({
        interestRateMode: InterestRate.Variable,
        lendingPool,
        user,
        amount,
        debtTokenAddress,
        referralCode,
      });

      expect(isApprovedSpy).toHaveBeenCalled();
      expect(txObj.length).toEqual(1);
      expect(txObj[0].txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj[0].tx();
      expect(tx.to).toEqual(wethGatewayAddress);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(BigInt(1));

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'uint256', 'uint16'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(lendingPool);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, 18)));
      expect(decoded[2]).toEqual(2n);
      expect(decoded[3]).toEqual(BigInt(referralCode));

      // gas price
      const gasPrice: GasType | null = await txObj[0].gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual('1');
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects the borrow tx object to be correct without referralCode', async () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);

      const isApprovedSpy = jest
        .spyOn(weth.baseDebtTokenService, 'isDelegationApproved')
        .mockImplementation(async () => Promise.resolve(true));

      const txObj = await weth.borrowETH({
        interestRateMode: InterestRate.Variable,
        lendingPool,
        user,
        amount,
        debtTokenAddress,
      });

      expect(isApprovedSpy).toHaveBeenCalled();
      expect(txObj.length).toEqual(1);
      expect(txObj[0].txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj[0].tx();
      expect(tx.to).toEqual(wethGatewayAddress);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(BigInt(1));

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'uint256', 'uint16'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(lendingPool);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, 18)));
      expect(decoded[2]).toEqual(2n);
      expect(decoded[3]).toEqual(0n);

      // gas price
      const gasPrice: GasType | null = await txObj[0].gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual('1');
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects to fail when initialized without gateway address', async () => {
      const weth = new WETHGatewayService(provider, erc20Service);

      const txObj = await weth.borrowETH({
        interestRateMode: InterestRate.Variable,
        lendingPool,
        user,
        amount,
        debtTokenAddress,
        referralCode,
      });

      expect(txObj.length).toEqual(0);
    });
    it('Expects to fail when user is not address', async () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const user = 'asdf';
      await expect(async () =>
        weth.borrowETH({
          interestRateMode: InterestRate.Variable,
          lendingPool,
          user,
          amount,
          debtTokenAddress,
          referralCode,
        }),
      ).rejects.toThrow(`Address: ${user} is not a valid ethereum Address`);
    });
    it('Expects to fail when lendingPool is not address', async () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const lendingPool = 'asdf';
      await expect(async () =>
        weth.borrowETH({
          interestRateMode: InterestRate.Variable,
          lendingPool,
          user,
          amount,
          debtTokenAddress,
          referralCode,
        }),
      ).rejects.toThrow(`Address: ${lendingPool} is not a valid ethereum Address`);
    });
    it('Expects to fail when amount is not positive', async () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const amount = '0';
      await expect(async () =>
        weth.borrowETH({
          interestRateMode: InterestRate.Variable,
          lendingPool,
          user,
          amount,
          debtTokenAddress,
          referralCode,
        }),
      ).rejects.toThrow(`Amount: ${amount} needs to be greater than 0`);
    });
    it('Expects to fail when amount is not number', async () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const amount = 'asdf';
      await expect(async () =>
        weth.borrowETH({
          interestRateMode: InterestRate.Variable,
          lendingPool,
          user,
          amount,
          debtTokenAddress,
          referralCode,
        }),
      ).rejects.toThrow(`Amount: ${amount} needs to be greater than 0`);
    });
    it('Expects to fail when debtTokenAddress is not address', async () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const debtTokenAddress = 'asdf';
      await expect(async () =>
        weth.borrowETH({
          interestRateMode: InterestRate.Variable,
          lendingPool,
          user,
          amount,
          debtTokenAddress,
          referralCode,
        }),
      ).rejects.toThrow(`Address: ${debtTokenAddress} is not a valid ethereum Address`);
    });
    it('Expects to fail when referral is not number', async () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const referralCode = 'asdf';
      await expect(async () =>
        weth.borrowETH({
          interestRateMode: InterestRate.Variable,
          lendingPool,
          user,
          amount,
          debtTokenAddress,
          referralCode,
        }),
      ).rejects.toThrow(`Amount: ${referralCode} needs to be greater or equal than 0`);
    });
  });
  describe('withdrawETH', () => {
    const user = '0x0000000000000000000000000000000000000003';
    const onBehalfOf = '0x0000000000000000000000000000000000000004';
    const aTokenAddress = '0x0000000000000000000000000000000000000005';
    const amount = '123.456';
    const provider: OfflineProvider = new OfflineProvider();
    jest
      .spyOn(provider, 'getFeeData')
      .mockImplementation(async () => Promise.resolve(new FeeData(1n)));
    const erc20Service = new ERC20Service(provider);

    afterEach(() => {
      jest.clearAllMocks();
    });
    it('Expects the withdraw tx object to be correct with all params and not approved', async () => {
      const isApprovedSpy = jest
        .spyOn(erc20Service, 'isApproved')
        .mockImplementation(async () => Promise.resolve(false));
      const approveSpy = jest.spyOn(erc20Service, 'approve').mockImplementation(() => ({
        txType: eEthereumTxType.ERC20_APPROVAL,
        tx: async () => ({}),
        gas: async () => ({
          gasLimit: '1',
          gasPrice: '1',
        }),
      }));

      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const txObj = await weth.withdrawETH({
        lendingPool,
        user,
        amount,
        onBehalfOf,
        aTokenAddress,
      });

      expect(isApprovedSpy).toHaveBeenCalled();
      expect(approveSpy).toHaveBeenCalled();
      expect(txObj.length).toEqual(2);
      expect(txObj[1].txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj[1].tx();
      expect(tx.to).toEqual(wethGatewayAddress);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(BigInt(1));

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'address'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(lendingPool);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, 18)));
      expect(decoded[2]).toEqual(onBehalfOf);

      // gas price
      const gasPrice: GasType | null = await txObj[1].gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual('640000');
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects the withdraw tx object to be correct with all params and amount -1 and approved', async () => {
      const isApprovedSpy = jest
        .spyOn(erc20Service, 'isApproved')
        .mockImplementation(async () => Promise.resolve(true));

      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const amount = '-1';
      const txObj = await weth.withdrawETH({
        lendingPool,
        user,
        amount,
        onBehalfOf,
        aTokenAddress,
      });

      expect(isApprovedSpy).toHaveBeenCalled();
      expect(txObj.length).toEqual(1);
      expect(txObj[0].txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj[0].tx();
      expect(tx.to).toEqual(wethGatewayAddress);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(BigInt(1));

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'address'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(lendingPool);
      expect(decoded[1]).toEqual(MaxUint256);
      expect(decoded[2]).toEqual(onBehalfOf);

      // gas price
      const gasPrice: GasType | null = await txObj[0].gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual('1');
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects the withdraw tx object to be correct without onBehalfOf', async () => {
      const isApprovedSpy = jest
        .spyOn(erc20Service, 'isApproved')
        .mockImplementation(async () => Promise.resolve(true));

      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);

      const txObj = await weth.withdrawETH({
        lendingPool,
        user,
        amount,
        aTokenAddress,
      });

      expect(isApprovedSpy).toHaveBeenCalled();
      expect(txObj.length).toEqual(1);
      expect(txObj[0].txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj[0].tx();
      expect(tx.to).toEqual(wethGatewayAddress);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(BigInt(1));

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'address'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(lendingPool);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, 18)));
      expect(decoded[2]).toEqual(user);

      // gas price
      const gasPrice: GasType | null = await txObj[0].gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual('1');
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects to fail when initialized without gateway address', async () => {
      const weth = new WETHGatewayService(provider, erc20Service);

      const txObj = await weth.withdrawETH({
        lendingPool,
        user,
        amount,
        aTokenAddress,
      });

      expect(txObj.length).toEqual(0);
    });
    it('Expects to fail when user is not address', async () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const user = 'asdf';
      await expect(async () =>
        weth.withdrawETH({
          lendingPool,
          user,
          amount,
          aTokenAddress,
        }),
      ).rejects.toThrow(`Address: ${user} is not a valid ethereum Address`);
    });
    it('Expects to fail when lendingPool is not address', async () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const lendingPool = 'asdf';
      await expect(async () =>
        weth.withdrawETH({
          lendingPool,
          user,
          amount,
          aTokenAddress,
        }),
      ).rejects.toThrow(`Address: ${lendingPool} is not a valid ethereum Address`);
    });
    it('Expects to fail when amount is not positive', async () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const amount = '0';
      await expect(async () =>
        weth.withdrawETH({
          lendingPool,
          user,
          amount,
          aTokenAddress,
        }),
      ).rejects.toThrow(`Amount: ${amount} needs to be greater than 0`);
    });
    it('Expects to fail when amount is not number', async () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const amount = 'asdf';
      await expect(async () =>
        weth.withdrawETH({
          lendingPool,
          user,
          amount,
          aTokenAddress,
        }),
      ).rejects.toThrow(`Amount: ${amount} needs to be greater than 0`);
    });
    it('Expects to fail when aTokenAddress is not address', async () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const aTokenAddress = 'asdf';
      await expect(async () =>
        weth.withdrawETH({
          lendingPool,
          user,
          amount,
          aTokenAddress,
        }),
      ).rejects.toThrow(`Address: ${aTokenAddress} is not a valid ethereum Address`);
    });
    it('Expects to fail when onBehalfOf is not address', async () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const onBehalfOf = 'asdf';
      await expect(async () =>
        weth.withdrawETH({
          lendingPool,
          user,
          amount,
          aTokenAddress,
          onBehalfOf,
        }),
      ).rejects.toThrow(`Address: ${onBehalfOf} is not a valid ethereum Address`);
    });
  });
  describe('repayETH', () => {
    const user = '0x0000000000000000000000000000000000000003';
    const onBehalfOf = '0x0000000000000000000000000000000000000004';
    const amount = '123.456';
    const provider: OfflineProvider = new OfflineProvider();
    jest
      .spyOn(provider, 'getFeeData')
      .mockImplementation(async () => Promise.resolve(new FeeData(1n)));
    const erc20Service = new ERC20Service(provider);

    afterEach(() => {
      jest.clearAllMocks();
    });
    it('Expects the repay tx object to be correct with all params', async () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const txObj = weth.repayETH({
        interestRateMode: InterestRate.Variable,
        lendingPool,
        user,
        amount,
        onBehalfOf,
      });

      expect(txObj.length).toEqual(1);
      expect(txObj[0].txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj[0].tx();
      expect(tx.to).toEqual(wethGatewayAddress);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(BigInt(1));

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'uint256', 'address'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(lendingPool);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, 18)));
      expect(decoded[2]).toEqual(2n);
      expect(decoded[3]).toEqual(onBehalfOf);

      // gas price
      const gasPrice: GasType | null = await txObj[0].gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual('1');
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects the repay tx object to be correct without onBehalfOf', async () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);

      const txObj = weth.repayETH({
        interestRateMode: InterestRate.Variable,
        lendingPool,
        user,
        amount,
      });

      expect(txObj.length).toEqual(1);
      expect(txObj[0].txType).toEqual(eEthereumTxType.DLP_ACTION);

      const tx: transactionType = await txObj[0].tx();
      expect(tx.to).toEqual(wethGatewayAddress);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(BigInt(1));

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256', 'uint256', 'address'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(lendingPool);
      expect(decoded[1]).toEqual(BigInt(valueToWei(amount, 18)));
      expect(decoded[2]).toEqual(2n);
      expect(decoded[3]).toEqual(user);

      // gas price
      const gasPrice: GasType | null = await txObj[0].gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual('1');
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects to fail when initialized without gateway address', () => {
      const weth = new WETHGatewayService(provider, erc20Service);

      const txObj = weth.repayETH({
        interestRateMode: InterestRate.Variable,
        lendingPool,
        user,
        amount,
      });

      expect(txObj.length).toEqual(0);
    });
    it('Expects to fail when user is not address', () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const user = 'asdf';
      expect(() =>
        weth.repayETH({
          interestRateMode: InterestRate.Variable,
          lendingPool,
          user,
          amount,
        }),
      ).toThrow(`Address: ${user} is not a valid ethereum Address`);
    });
    it('Expects to fail when lendingPool is not address', () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const lendingPool = 'asdf';
      expect(() =>
        weth.repayETH({
          interestRateMode: InterestRate.Variable,
          lendingPool,
          user,
          amount,
        }),
      ).toThrow(`Address: ${lendingPool} is not a valid ethereum Address`);
    });
    it('Expects to fail when amount is not positive', () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const amount = '0';
      expect(() =>
        weth.repayETH({
          interestRateMode: InterestRate.Variable,
          lendingPool,
          user,
          amount,
        }),
      ).toThrow(`Amount: ${amount} needs to be greater than 0`);
    });
    it('Expects to fail when amount is not number', () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const amount = 'asdf';
      expect(() =>
        weth.repayETH({
          interestRateMode: InterestRate.Variable,
          lendingPool,
          user,
          amount,
        }),
      ).toThrow(`Amount: ${amount} needs to be greater than 0`);
    });
    it('Expects to fail when onBehalfOf is not address', () => {
      const weth = new WETHGatewayService(provider, erc20Service, wethGatewayAddress);
      const onBehalfOf = 'asdf';
      expect(() =>
        weth.repayETH({
          interestRateMode: InterestRate.Variable,
          lendingPool,
          user,
          amount,
          onBehalfOf,
        }),
      ).toThrow(`Address: ${onBehalfOf} is not a valid ethereum Address`);
    });
  });
});
