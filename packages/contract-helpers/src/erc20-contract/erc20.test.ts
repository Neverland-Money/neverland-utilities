import { AbiCoder, dataSlice, FeeData, MaxUint256 } from 'ethers';
import { OfflineProvider } from '../__tests__/offline-provider';
import {
  eEthereumTxType,
  type EthereumTransactionTypeExtended,
  type GasType,
  type transactionType,
} from '../commons/types';
import { API_ETH_MOCK_ADDRESS } from '../commons/utils';
import { ERC20Service, type IERC20ServiceInterface } from '.';

jest.mock('../commons/gas-station', () => {
  return {
    __esModule: true,
    estimateGasByNetwork: jest.fn().mockImplementation(async () => Promise.resolve(BigInt(1))),
    estimateGas: jest.fn(async () => Promise.resolve(BigInt(1))),
  };
});

describe('ERC20Service', () => {
  const validApprovalAmounts = [
    ['zero', '0', 0n],
    ['one', '1', 1n],
    ['above the safe integer limit', '9007199254740993', 9007199254740993n],
    ['uint256 maximum', MaxUint256.toString(), MaxUint256],
    ['leading zeros', '0001', 1n],
    ['hexadecimal', '0x20000000000001', 9007199254740993n],
    ['explicit plus', '+1', 1n],
    ['surrounding whitespace', ' 1 ', 1n],
  ] as const;
  const invalidApprovalAmounts = [
    '-1',
    '-',
    '- ',
    '-\t',
    '-\n',
    '+',
    '+ ',
    '--0',
    '+-1',
    '-+1',
    '- 0',
    '- -1',
    '-\t-9007199254740993',
    '-0x0',
    '-0b0',
    (MaxUint256 + 1n).toString(),
    '1.5',
    '1.0',
    '1e3',
    'asdf',
    '',
    ' ',
    'NaN',
    'Infinity',
    '0x',
  ];
  const provider: OfflineProvider = new OfflineProvider();
  jest
    .spyOn(provider, 'getFeeData')
    .mockImplementation(async () => Promise.resolve(new FeeData(1n)));
  describe('Initialize', () => {
    it('Expects to be initialized correctly', () => {
      const instance: IERC20ServiceInterface = new ERC20Service(provider);
      expect(instance instanceof ERC20Service).toEqual(true);
    });
  });
  describe('approveTxData', () => {
    const provider: OfflineProvider = new OfflineProvider();
    jest
      .spyOn(provider, 'getFeeData')
      .mockImplementation(async () => Promise.resolve(new FeeData(1n)));
    const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);
    const user = '0x0000000000000000000000000000000000000001';
    const token = '0x0000000000000000000000000000000000000002';
    const spender = '0x0000000000000000000000000000000000000003';
    const amount = '1000000000000000000';

    it('Expects to get the approval txObj with correct params', () => {
      const txData = erc20Service.approveTxData({
        user,
        token,
        spender,
        amount,
      });
      expect(txData.to).toEqual(token);
      expect(txData.from).toEqual(user);

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256'],
        dataSlice(txData.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(spender);
      expect(decoded[1]).toEqual(BigInt(amount));
    });
    it('Expects to fail when user is not address', () => {
      const user = 'asdf';
      expect(() =>
        erc20Service.approveTxData({
          user,
          token,
          spender,
          amount,
        }),
      ).toThrow(new Error(`Address: ${user} is not a valid ethereum Address`));
    });
    it('Expects to fail when token is not address', () => {
      const token = 'asdf';
      expect(() =>
        erc20Service.approveTxData({
          user,
          token,
          spender,
          amount,
        }),
      ).toThrow(new Error(`Address: ${token} is not a valid ethereum Address`));
    });
    it('Expects to fail when spender is not address', () => {
      const spender = 'asdf';
      expect(() =>
        erc20Service.approveTxData({
          user,
          token,
          spender,
          amount,
        }),
      ).toThrow(new Error(`Address: ${spender} is not a valid ethereum Address`));
    });
    it.each(validApprovalAmounts)('encodes the exact %s approval', (_label, amount, expected) => {
      const tx = erc20Service.approveTxData({ user, token, spender, amount });
      expect(tx.to).toEqual(token);
      expect(tx.from).toEqual(user);
      expect(dataSlice(tx.data ?? '', 0, 4)).toEqual('0x095ea7b3');
      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256'],
        dataSlice(tx.data ?? '', 4),
      );
      expect(decoded[0]).toEqual(spender);
      expect(decoded[1]).toEqual(expected);
    });
    it.each(invalidApprovalAmounts)('rejects invalid amount %j synchronously', amount => {
      expect(() =>
        erc20Service.approveTxData({
          user,
          token,
          spender,
          amount,
        }),
      ).toThrow();
    });
  });

  describe('approve', () => {
    const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);
    const user = '0x0000000000000000000000000000000000000001';
    const token = '0x0000000000000000000000000000000000000002';
    const spender = '0x0000000000000000000000000000000000000003';
    const amount = '1000000000000000000';

    it('Expects to get the approval txObj with correct params', async () => {
      const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);
      const txObj: EthereumTransactionTypeExtended = erc20Service.approve({
        user,
        token,
        spender,
        amount,
      });

      expect(txObj.txType).toEqual(eEthereumTxType.ERC20_APPROVAL);

      const tx: transactionType = await txObj.tx();
      expect(tx.to).toEqual(token);
      expect(tx.from).toEqual(user);
      expect(tx.gasLimit).toEqual(BigInt(1));

      const decoded = AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256'],
        dataSlice(tx.data ?? '', 4),
      );

      expect(decoded[0]).toEqual(spender);
      expect(decoded[1]).toEqual(BigInt(amount));

      // gas price
      const gasPrice: GasType | null = await txObj.gas();
      expect(gasPrice).not.toBeNull();
      expect(gasPrice?.gasLimit).toEqual('1');
      expect(gasPrice?.gasPrice).toEqual('1');
    });
    it('Expects to fail when user is not address', () => {
      const user = 'asdf';
      expect(() =>
        erc20Service.approve({
          user,
          token,
          spender,
          amount,
        }),
      ).toThrow(new Error(`Address: ${user} is not a valid ethereum Address`));
    });
    it('Expects to fail when token is not address', () => {
      const token = 'asdf';
      expect(() =>
        erc20Service.approve({
          user,
          token,
          spender,
          amount,
        }),
      ).toThrow(new Error(`Address: ${token} is not a valid ethereum Address`));
    });
    it('Expects to fail when spender is not address', () => {
      const spender = 'asdf';
      expect(() =>
        erc20Service.approve({
          user,
          token,
          spender,
          amount,
        }),
      ).toThrow(new Error(`Address: ${spender} is not a valid ethereum Address`));
    });
    it.each(validApprovalAmounts)(
      'encodes the exact %s approval',
      async (_label, amount, expected) => {
        const wrapper = erc20Service.approve({ user, token, spender, amount });
        expect(wrapper.txType).toEqual(eEthereumTxType.ERC20_APPROVAL);
        const tx = await wrapper.tx();
        expect(tx.to).toEqual(token);
        expect(tx.from).toEqual(user);
        expect(dataSlice(tx.data ?? '', 0, 4)).toEqual('0x095ea7b3');
        const decoded = AbiCoder.defaultAbiCoder().decode(
          ['address', 'uint256'],
          dataSlice(tx.data ?? '', 4),
        );
        expect(decoded[0]).toEqual(spender);
        expect(decoded[1]).toEqual(expected);
      },
    );
    it.each(invalidApprovalAmounts)('rejects invalid amount %j synchronously', amount => {
      expect(() =>
        erc20Service.approve({
          user,
          token,
          spender,
          amount,
        }),
      ).toThrow();
    });
  });
  describe('isApproved', () => {
    const user = '0x0000000000000000000000000000000000000001';
    const token = '0x0000000000000000000000000000000000000002';
    const spender = '0x0000000000000000000000000000000000000003';
    const amount = '123.3';

    // mock erc20 service decimalsOf method
    afterEach(() => {
      jest.clearAllMocks();
    });
    it('Expects to return true if token is eth mock address', async () => {
      const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);
      const token = API_ETH_MOCK_ADDRESS;
      const isApproved: boolean = await erc20Service.isApproved({
        user,
        token,
        spender,
        amount,
      });
      expect(isApproved).toEqual(true);
    });
    it('Expects to be approved with correct params', async () => {
      provider.mockContract({
        allowance: async () => Promise.resolve(BigInt('100000000000000000')),
      });

      const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);
      const decimalsSpy = jest
        .spyOn(erc20Service, 'decimalsOf')
        .mockImplementation(async () => Promise.resolve(6));

      const isApproved: boolean = await erc20Service.isApproved({
        user,
        token,
        spender,
        amount,
      });

      expect(decimalsSpy).toHaveBeenCalled();
      expect(isApproved).toEqual(true);
    });
    it('Expects to return isApproved correctly with amounts in native decimals', async () => {
      provider.mockContract({
        allowance: async () => Promise.resolve(BigInt('200000000')),
      });

      const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);
      const decimalsSpy = jest
        .spyOn(erc20Service, 'decimalsOf')
        .mockImplementation(async () => Promise.resolve(6));

      const isApproved: boolean = await erc20Service.isApproved({
        user,
        token,
        spender,
        amount: '100000000',
        nativeDecimals: true,
      });

      expect(decimalsSpy).toHaveBeenCalled();
      expect(isApproved).toEqual(true);

      const isApprovedValidExact: boolean = await erc20Service.isApproved({
        user,
        token,
        spender,
        amount: '200000000',
        nativeDecimals: true,
      });

      expect(decimalsSpy).toHaveBeenCalled();
      expect(isApprovedValidExact).toEqual(true);

      const isApprovedInvalid: boolean = await erc20Service.isApproved({
        user,
        token,
        spender,
        amount: '300000000',
        nativeDecimals: true,
      });

      expect(isApprovedInvalid).toEqual(false);
    });
    it('Expects to not be approved with correct params', async () => {
      provider.mockContract({
        allowance: async () => Promise.resolve(BigInt('100000')),
      });

      const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);
      const decimalsSpy = jest
        .spyOn(erc20Service, 'decimalsOf')
        .mockImplementation(async () => Promise.resolve(6));

      const isApproved: boolean = await erc20Service.isApproved({
        user,
        token,
        spender,
        amount,
      });
      expect(decimalsSpy).toHaveBeenCalled();
      expect(isApproved).toEqual(false);
    });

    it('Expects to get the approval txObj with correct params and -1 amount and max allowance', async () => {
      provider.mockContract({
        allowance: async () => Promise.resolve(BigInt(MaxUint256)),
      });

      const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);
      const decimalsSpy = jest
        .spyOn(erc20Service, 'decimalsOf')
        .mockImplementation(async () => Promise.resolve(6));

      const amount = '-1';
      const isApproved: boolean = await erc20Service.isApproved({
        user,
        token,
        spender,
        amount,
      });
      expect(decimalsSpy).toHaveBeenCalled();
      expect(isApproved).toEqual(true);
    });
    it('Expects to fail when user is not address', async () => {
      const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);
      const user = 'asdf';
      await expect(async () =>
        erc20Service.isApproved({
          user,
          token,
          spender,
          amount,
        }),
      ).rejects.toThrow(new Error(`Address: ${user} is not a valid ethereum Address`));
    });
    it('Expects to fail when token is not address', async () => {
      const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);
      const token = 'asdf';
      await expect(async () =>
        erc20Service.isApproved({
          user,
          token,
          spender,
          amount,
        }),
      ).rejects.toThrow(new Error(`Address: ${token} is not a valid ethereum Address`));
    });
    it('Expects to fail when spender is not address', async () => {
      const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);
      const spender = 'asdf';
      await expect(async () =>
        erc20Service.isApproved({
          user,
          token,
          spender,
          amount,
        }),
      ).rejects.toThrow(new Error(`Address: ${spender} is not a valid ethereum Address`));
    });
    it('Expects to fail when amount is not positive > 0 or -1', async () => {
      const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);
      const amount = '0';
      await expect(async () =>
        erc20Service.isApproved({
          user,
          token,
          spender,
          amount,
        }),
      ).rejects.toThrow(new Error(`Amount: ${amount} needs to be greater than 0 or -1`));
    });
    it('Expects to fail when amount is not number', async () => {
      const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);
      const amount = 'asdf';
      await expect(async () =>
        erc20Service.isApproved({
          user,
          token,
          spender,
          amount,
        }),
      ).rejects.toThrow(new Error(`Amount: ${amount} needs to be greater than 0 or -1`));
    });
  });
  describe('decimalsOf', () => {
    const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);
    const address = '0x0000000000000000000000000000000000000001';
    afterEach(() => {
      jest.clearAllMocks();
    });
    it('Expects 18 if mocked eth address', async () => {
      const decimals = await erc20Service.decimalsOf(API_ETH_MOCK_ADDRESS);
      expect(decimals).toEqual(18);
    });
    it('Expect to get the decimals from the contract if not eth mock and not called previously with same address', async () => {
      provider.mockContract({
        decimals: async () => Promise.resolve(6),
      });

      const decimals = await erc20Service.decimalsOf(address);

      expect(decimals).toEqual(6);
    });
    it('Expects to return already saved decimals if not eth mock', async () => {
      const spy = provider.mockContract({
        decimals: async () => Promise.resolve(6),
      });
      const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);

      const decimals = await erc20Service.decimalsOf(address);
      const decimals2 = await erc20Service.decimalsOf(address);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(decimals).toEqual(6);
      expect(decimals2).toEqual(decimals);
    });
  });
  describe('getTokenData', () => {
    const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);
    const token = '0x0000000000000000000000000000000000000001';
    afterEach(() => {
      jest.clearAllMocks();
    });
    it('Expects to get ethereum data with mock address', async () => {
      const tokenData = await erc20Service.getTokenData(API_ETH_MOCK_ADDRESS);
      expect(tokenData.name).toEqual('Ethereum');
      expect(tokenData.symbol).toEqual('ETH');
      expect(tokenData.decimals).toEqual(18);
      expect(tokenData.address).toEqual(API_ETH_MOCK_ADDRESS);
    });
    it('Expects to get Maker data with maker address', async () => {
      const token = '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2';
      const tokenData = await erc20Service.getTokenData(token);
      expect(tokenData.name).toEqual('Maker');
      expect(tokenData.symbol).toEqual('MKR');
      expect(tokenData.decimals).toEqual(18);
      expect(tokenData.address).toEqual(token);
    });
    it('Expects to get data from contract when using other address', async () => {
      const spy = provider.mockContract({
        decimals: async () => Promise.resolve(18),
        symbol: async () => Promise.resolve('AMPL'),
        name: async () => Promise.resolve('Ampleforth'),
      });
      const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);

      const tokenData = await erc20Service.getTokenData(token);
      expect(spy).toHaveBeenCalled();
      expect(tokenData.name).toEqual('Ampleforth');
      expect(tokenData.symbol).toEqual('AMPL');
      expect(tokenData.decimals).toEqual(18);
      expect(tokenData.address).toEqual(token);
    });
    it('Expects to return saved data when using repeated address', async () => {
      const spy = provider.mockContract({
        decimals: async () => Promise.resolve(18),
        symbol: async () => Promise.resolve('AMPL'),
        name: async () => Promise.resolve('Ampleforth'),
      });
      const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);
      jest.spyOn(erc20Service, 'decimalsOf').mockImplementation(async () => Promise.resolve(18));

      const tokenData = await erc20Service.getTokenData(token);
      const tokenData2 = await erc20Service.getTokenData(token);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(tokenData2).toEqual(tokenData);
      expect(tokenData2.name).toEqual('Ampleforth');
      expect(tokenData2.symbol).toEqual('AMPL');
      expect(tokenData2.decimals).toEqual(18);
      expect(tokenData2.address).toEqual(token);
    });
  });
  describe('approvedAmount', () => {
    const user = '0x0000000000000000000000000000000000000001';
    const token = '0x0000000000000000000000000000000000000002';
    const spender = '0x0000000000000000000000000000000000000003';

    // mock erc20 service decimalsOf method
    afterEach(() => {
      jest.clearAllMocks();
    });
    it('Expects to return max uint256 if token is eth mock address', async () => {
      const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);
      const token = API_ETH_MOCK_ADDRESS;
      const approvedAmount: string = await erc20Service.approvedAmount({
        user,
        token,
        spender,
      });
      expect(approvedAmount).toEqual('-1');
    });
    it('Expects to return correct approval amount', async () => {
      provider.mockContract({
        allowance: async () => Promise.resolve(BigInt('100000000000000000')),
      });

      const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);
      const decimalsSpy = jest
        .spyOn(erc20Service, 'decimalsOf')
        .mockImplementation(async () => Promise.resolve(6));

      const approvedAmount: string = await erc20Service.approvedAmount({
        user,
        token,
        spender,
      });

      expect(decimalsSpy).toHaveBeenCalled();
      // 100000000000000000 / 10^6 = 100000000000
      expect(approvedAmount).toEqual('100000000000');
    });
    it('Expects to return correct approval with decimal amount', async () => {
      provider.mockContract({
        allowance: async () => Promise.resolve(BigInt('100000')),
      });

      const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);
      const decimalsSpy = jest
        .spyOn(erc20Service, 'decimalsOf')
        .mockImplementation(async () => Promise.resolve(6));

      const approvedAmount: string = await erc20Service.approvedAmount({
        user,
        token,
        spender,
      });
      expect(decimalsSpy).toHaveBeenCalled();
      // 100000 / 10^6 = 0.1
      expect(approvedAmount).toEqual('0.1');
    });

    it('Expects to get the approval txObj with correct params and max allowance', async () => {
      provider.mockContract({
        allowance: async () => Promise.resolve(BigInt(MaxUint256)),
      });

      const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);
      const decimalsSpy = jest
        .spyOn(erc20Service, 'decimalsOf')
        .mockImplementation(async () => Promise.resolve(6));

      const approvedAmount: string = await erc20Service.approvedAmount({
        user,
        token,
        spender,
      });
      // Skips decimals check and returns -1 with max allowance
      expect(decimalsSpy).toHaveBeenCalledTimes(0);
      expect(approvedAmount).toEqual('-1');
    });
    it('Expects to fail when user is not address', async () => {
      const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);
      const user = 'asdf';
      await expect(async () =>
        erc20Service.approvedAmount({
          user,
          token,
          spender,
        }),
      ).rejects.toThrow(new Error(`Address: ${user} is not a valid ethereum Address`));
    });
    it('Expects to fail when token is not address', async () => {
      const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);
      const token = 'asdf';
      await expect(async () =>
        erc20Service.approvedAmount({
          user,
          token,
          spender,
        }),
      ).rejects.toThrow(new Error(`Address: ${token} is not a valid ethereum Address`));
    });
    it('Expects to fail when spender is not address', async () => {
      const erc20Service: IERC20ServiceInterface = new ERC20Service(provider);
      const spender = 'asdf';
      await expect(async () =>
        erc20Service.approvedAmount({
          user,
          token,
          spender,
        }),
      ).rejects.toThrow(new Error(`Address: ${spender} is not a valid ethereum Address`));
    });
  });
});
