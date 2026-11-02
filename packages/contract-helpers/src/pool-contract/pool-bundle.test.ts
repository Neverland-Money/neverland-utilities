import { FeeData } from 'ethers';
import { OfflineProvider } from '../__tests__/offline-provider';
import { InterestRate } from '../commons/types';
import { API_ETH_MOCK_ADDRESS } from '../commons/utils';
import { PoolBundle } from './pool-bundle';

jest.mock('../commons/gas-station', () => {
  return {
    __esModule: true,
    estimateGasByNetwork: jest.fn().mockImplementation(async () => Promise.resolve(BigInt(1))),
    estimateGas: jest.fn(async () => Promise.resolve(BigInt(1))),
  };
});

describe('PoolBundle', () => {
  const provider = new OfflineProvider();
  jest
    .spyOn(provider, 'getFeeData')
    .mockImplementation(async () => Promise.resolve(new FeeData(1n)));
  const POOL = '0x0000000000000000000000000000000000000001';
  const WETH_GATEWAY = '0x0000000000000000000000000000000000000002';
  const USER = '0x0000000000000000000000000000000000000003';
  const TOKEN = '0x0000000000000000000000000000000000000004';

  describe('Initialization', () => {
    const config = {
      POOL,
      WETH_GATEWAY,
    };
    it('Expects to initialize correctly with all params', () => {
      const instance = new PoolBundle(provider, config);
      expect(instance instanceof PoolBundle).toEqual(true);
    });
    it('Expects to initialize correctly without passing configuration', () => {
      const instance = new PoolBundle(provider);
      expect(instance instanceof PoolBundle).toEqual(true);
    });
  });

  describe('SupplyTxBuilder', () => {
    const config = {
      POOL,
      WETH_GATEWAY,
    };

    const instance = new PoolBundle(provider, config);

    it('gets approved amount for Pool', async () => {
      jest.spyOn(instance.erc20Service, 'approvedAmount').mockReturnValue(Promise.resolve('1'));

      const result = await instance.supplyTxBuilder.getApprovedAmount({
        user: USER,
        token: TOKEN,
      });
      expect(result.amount).toEqual('1');
      expect(result.spender).toEqual(POOL);
      expect(result.token).toEqual(TOKEN);
      expect(result.user).toEqual(USER);
    });

    it('gets approved amount for WETHGateway', async () => {
      jest.spyOn(instance.erc20Service, 'approvedAmount').mockReturnValue(Promise.resolve('1'));

      const result = await instance.supplyTxBuilder.getApprovedAmount({
        user: USER,
        token: API_ETH_MOCK_ADDRESS,
      });
      expect(result.amount).toEqual('1');
      expect(result.spender).toEqual(WETH_GATEWAY);
      expect(result.token).toEqual(API_ETH_MOCK_ADDRESS);
      expect(result.user).toEqual(USER);
    });

    it('generates supply tx data with generateTxData', () => {
      const result = instance.supplyTxBuilder.generateTxData({
        user: USER,
        reserve: TOKEN,
        amount: '1',
        onBehalfOf: USER,
        referralCode: '0',
      });

      const differentParamsSameResult = instance.supplyTxBuilder.generateTxData({
        user: USER,
        reserve: TOKEN,
        amount: '1',
      });

      expect(result.to).toEqual(POOL);
      expect(result.from).toEqual(USER);
      expect(result.data).toEqual(
        '0x617ba0370000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000000',
      );
      expect(differentParamsSameResult.to).toEqual(POOL);
      expect(differentParamsSameResult.from).toEqual(USER);
      expect(differentParamsSameResult.data).toEqual(
        '0x617ba0370000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000000',
      );
    });

    it('generates supply tx for WETHGateway data with generateTxData', () => {
      const result = instance.supplyTxBuilder.generateTxData({
        user: USER,
        reserve: API_ETH_MOCK_ADDRESS.toLowerCase(),
        amount: '1',
        onBehalfOf: USER,
        referralCode: '0',
      });

      const differentParamsSameResult = instance.supplyTxBuilder.generateTxData({
        user: USER,
        reserve: API_ETH_MOCK_ADDRESS.toLowerCase(),
        amount: '1',
      });
      expect(result.to).toEqual(WETH_GATEWAY);
      expect(result.from).toEqual(USER);
      expect(result.value).toEqual(BigInt('1'));
      expect(result.data).toEqual(
        '0x474cf53d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000000',
      );
      expect(differentParamsSameResult.to).toEqual(WETH_GATEWAY);
      expect(differentParamsSameResult.from).toEqual(USER);
      expect(differentParamsSameResult.data).toEqual(
        '0x474cf53d000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000000',
      );
    });

    it('generates signed tx with generateSignedTxData', () => {
      const result = instance.supplyTxBuilder.generateSignedTxData({
        user: USER,
        reserve: TOKEN,
        amount: '1',
        onBehalfOf: USER,
        referralCode: '0',
        signature:
          '0x532f8df4e2502bd869fb35e9301156f9b307380afdcc25cfbc87b2e939f16f7e47c326dc26eb918d327358797ee67ad7415d871ef7eaf0d4f6352d3ad021fbb41c',
        deadline: '10000',
      });

      const differentParamsSameResult = instance.supplyTxBuilder.generateSignedTxData({
        user: USER,
        reserve: TOKEN,
        amount: '1',

        signature:
          '0x532f8df4e2502bd869fb35e9301156f9b307380afdcc25cfbc87b2e939f16f7e47c326dc26eb918d327358797ee67ad7415d871ef7eaf0d4f6352d3ad021fbb41c',
        deadline: '10000',
      });

      expect(result.to).toEqual(POOL);
      expect(result.from).toEqual(USER);
      expect(result.data).toEqual(
        '0x02c205f000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002710000000000000000000000000000000000000000000000000000000000000001c532f8df4e2502bd869fb35e9301156f9b307380afdcc25cfbc87b2e939f16f7e47c326dc26eb918d327358797ee67ad7415d871ef7eaf0d4f6352d3ad021fbb4',
      );
      expect(differentParamsSameResult.to).toEqual(POOL);
      expect(differentParamsSameResult.from).toEqual(USER);
      expect(differentParamsSameResult.data).toEqual(
        '0x02c205f000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002710000000000000000000000000000000000000000000000000000000000000001c532f8df4e2502bd869fb35e9301156f9b307380afdcc25cfbc87b2e939f16f7e47c326dc26eb918d327358797ee67ad7415d871ef7eaf0d4f6352d3ad021fbb4',
      );
    });
  });

  describe('BorrowTxBuilder', () => {
    const config = {
      POOL,
      WETH_GATEWAY,
    };

    const instance = new PoolBundle(provider, config);

    it('generates borrow tx data with generateTxData', () => {
      const result = instance.borrowTxBuilder.generateTxData({
        user: USER,
        reserve: TOKEN,
        amount: '1',
        onBehalfOf: USER,
        referralCode: '0',
        interestRateMode: InterestRate.Variable,
      });

      const differentParamsSameResult = instance.borrowTxBuilder.generateTxData({
        user: USER,
        reserve: TOKEN,
        amount: '1',
        interestRateMode: InterestRate.Variable,
      });

      const stableBorrowResult = instance.borrowTxBuilder.generateTxData({
        user: USER,
        reserve: TOKEN,
        amount: '1',
        onBehalfOf: USER,
        referralCode: '0',
        interestRateMode: InterestRate.Stable,
      });

      const variableBorrowTxData =
        '0xa415bcad00000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003';

      const stableBorrowTxData =
        '0xa415bcad00000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003';
      expect(result.to).toEqual(POOL);
      expect(result.from).toEqual(USER);
      expect(result.data).toEqual(variableBorrowTxData);
      expect(differentParamsSameResult.to).toEqual(POOL);
      expect(differentParamsSameResult.from).toEqual(USER);
      expect(differentParamsSameResult.data).toEqual(variableBorrowTxData);
      expect(stableBorrowResult.to).toEqual(POOL);
      expect(stableBorrowResult.from).toEqual(USER);
      expect(stableBorrowResult.data).toEqual(stableBorrowTxData);
    });

    it('generates borrow tx for WETHGateway data with generateTxData', async () => {
      await expect(async () =>
        instance.borrowTxBuilder.generateTxData({
          user: USER,
          reserve: API_ETH_MOCK_ADDRESS.toLowerCase(),
          amount: '1',
          onBehalfOf: USER,
          interestRateMode: InterestRate.Variable,
          referralCode: '0',
        }),
      ).rejects.toThrow(
        `To borrow ETH you need to pass the stable or variable WETH debt Token Address corresponding the interestRateMode`,
      );

      const result = instance.borrowTxBuilder.generateTxData({
        user: USER,
        reserve: API_ETH_MOCK_ADDRESS.toLowerCase(),
        amount: '1',
        onBehalfOf: USER,
        interestRateMode: InterestRate.Variable,
        referralCode: '0',
        debtTokenAddress: API_ETH_MOCK_ADDRESS.toLowerCase(),
      });

      const differentParamsSameResult = instance.borrowTxBuilder.generateTxData({
        user: USER,
        reserve: API_ETH_MOCK_ADDRESS.toLowerCase(),
        interestRateMode: InterestRate.Variable,
        amount: '1',
        debtTokenAddress: API_ETH_MOCK_ADDRESS.toLowerCase(),
      });
      const variableTxData =
        '0x66514c970000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000';
      expect(result.to).toEqual(WETH_GATEWAY);
      expect(result.from).toEqual(USER);
      expect(result.value).toEqual(undefined);
      expect(result.data).toEqual(variableTxData);
      expect(differentParamsSameResult.to).toEqual(WETH_GATEWAY);
      expect(differentParamsSameResult.from).toEqual(USER);
      expect(differentParamsSameResult.data).toEqual(variableTxData);
    });
  });

  describe('RepayTxBuilder', () => {
    const config = {
      POOL,
      WETH_GATEWAY,
    };

    const instance = new PoolBundle(provider, config);

    it('generates repay tx data with generateTxData with variable debt', () => {
      const result = instance.repayTxBuilder.generateTxData({
        user: USER,
        reserve: TOKEN,
        amount: '1',
        interestRateMode: InterestRate.Variable,
        onBehalfOf: USER,
      });

      const differentParamsSameResult = instance.repayTxBuilder.generateTxData({
        user: USER,
        reserve: TOKEN,
        amount: '1',
        interestRateMode: InterestRate.Variable,
      });

      expect(result.to).toEqual(POOL);
      expect(result.from).toEqual(USER);
      expect(result.data).toEqual(
        '0x573ade810000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000003',
      );
      expect(differentParamsSameResult.to).toEqual(POOL);
      expect(differentParamsSameResult.from).toEqual(USER);
      expect(differentParamsSameResult.data).toEqual(
        '0x573ade810000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000003',
      );
    });

    it('generates repay tx data with generateTxData with variable debt and max input', () => {
      const result = instance.repayTxBuilder.generateTxData({
        user: USER,
        reserve: TOKEN,
        amount: '-1',
        interestRateMode: InterestRate.Variable,
        onBehalfOf: USER,
      });

      expect(result.to).toEqual(POOL);
      expect(result.from).toEqual(USER);
      expect(result.data).toEqual(
        '0x573ade810000000000000000000000000000000000000000000000000000000000000004ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000003',
      );
    });

    it('generates repay tx data with generateTxData with stable debt', () => {
      const result = instance.repayTxBuilder.generateTxData({
        user: USER,
        reserve: TOKEN,
        amount: '1',
        interestRateMode: InterestRate.Stable,
        onBehalfOf: USER,
      });

      expect(result.to).toEqual(POOL);
      expect(result.from).toEqual(USER);
      expect(result.data).toEqual(
        '0x573ade810000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000003',
      );
    });

    it('generates repay tx for WETHGateway data with generateTxData', () => {
      const result = instance.repayTxBuilder.generateTxData({
        user: USER,
        reserve: API_ETH_MOCK_ADDRESS.toLowerCase(),
        amount: '1',
        onBehalfOf: USER,
        interestRateMode: InterestRate.Variable,
      });

      const differentParamsSameResult = instance.repayTxBuilder.generateTxData({
        user: USER,
        reserve: API_ETH_MOCK_ADDRESS.toLowerCase(),
        amount: '1',
        interestRateMode: InterestRate.Variable,
      });
      expect(result.to).toEqual(WETH_GATEWAY);
      expect(result.from).toEqual(USER);
      expect(result.value).toEqual(BigInt('1'));
      expect(result.data).toEqual(
        '0x02c5fcf80000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000003',
      );
      expect(differentParamsSameResult.to).toEqual(WETH_GATEWAY);
      expect(differentParamsSameResult.from).toEqual(USER);
      expect(differentParamsSameResult.data).toEqual(
        '0x02c5fcf80000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000003',
      );
    });

    it('generates signed tx with generateSignedTxData with variable debt', () => {
      const result = instance.repayTxBuilder.generateSignedTxData({
        user: USER,
        reserve: TOKEN,
        amount: '1',
        onBehalfOf: USER,
        interestRateMode: InterestRate.Variable,
        signature:
          '0x532f8df4e2502bd869fb35e9301156f9b307380afdcc25cfbc87b2e939f16f7e47c326dc26eb918d327358797ee67ad7415d871ef7eaf0d4f6352d3ad021fbb41c',
        deadline: '10000',
      });

      const differentParamsSameResult = instance.repayTxBuilder.generateSignedTxData({
        user: USER,
        reserve: TOKEN,
        amount: '1',
        interestRateMode: InterestRate.Variable,
        signature:
          '0x532f8df4e2502bd869fb35e9301156f9b307380afdcc25cfbc87b2e939f16f7e47c326dc26eb918d327358797ee67ad7415d871ef7eaf0d4f6352d3ad021fbb41c',
        deadline: '10000',
      });

      expect(result.to).toEqual(POOL);
      expect(result.from).toEqual(USER);
      expect(result.data).toEqual(
        '0xee3e210b00000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000002710000000000000000000000000000000000000000000000000000000000000001c532f8df4e2502bd869fb35e9301156f9b307380afdcc25cfbc87b2e939f16f7e47c326dc26eb918d327358797ee67ad7415d871ef7eaf0d4f6352d3ad021fbb4',
      );
      expect(differentParamsSameResult.to).toEqual(POOL);
      expect(differentParamsSameResult.from).toEqual(USER);
      expect(differentParamsSameResult.data).toEqual(
        '0xee3e210b00000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000002710000000000000000000000000000000000000000000000000000000000000001c532f8df4e2502bd869fb35e9301156f9b307380afdcc25cfbc87b2e939f16f7e47c326dc26eb918d327358797ee67ad7415d871ef7eaf0d4f6352d3ad021fbb4',
      );
    });

    it('generates signed tx with generateSignedTxData with variable debt and max input', () => {
      const result = instance.repayTxBuilder.generateSignedTxData({
        user: USER,
        reserve: TOKEN,
        amount: '-1',
        onBehalfOf: USER,
        interestRateMode: InterestRate.Variable,
        signature:
          '0x532f8df4e2502bd869fb35e9301156f9b307380afdcc25cfbc87b2e939f16f7e47c326dc26eb918d327358797ee67ad7415d871ef7eaf0d4f6352d3ad021fbb41c',
        deadline: '10000',
      });
      expect(result.to).toEqual(POOL);
      expect(result.from).toEqual(USER);
      expect(result.data).toEqual(
        '0xee3e210b0000000000000000000000000000000000000000000000000000000000000004ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000002710000000000000000000000000000000000000000000000000000000000000001c532f8df4e2502bd869fb35e9301156f9b307380afdcc25cfbc87b2e939f16f7e47c326dc26eb918d327358797ee67ad7415d871ef7eaf0d4f6352d3ad021fbb4',
      );
    });

    it('generates signed tx with generateSignedTxData with stable debt', () => {
      const result = instance.repayTxBuilder.generateSignedTxData({
        user: USER,
        reserve: TOKEN,
        amount: '1',
        onBehalfOf: USER,
        interestRateMode: InterestRate.Stable,
        signature:
          '0x532f8df4e2502bd869fb35e9301156f9b307380afdcc25cfbc87b2e939f16f7e47c326dc26eb918d327358797ee67ad7415d871ef7eaf0d4f6352d3ad021fbb41c',
        deadline: '10000',
      });

      expect(result.to).toEqual(POOL);
      expect(result.from).toEqual(USER);
      expect(result.data).toEqual(
        '0xee3e210b00000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000002710000000000000000000000000000000000000000000000000000000000000001c532f8df4e2502bd869fb35e9301156f9b307380afdcc25cfbc87b2e939f16f7e47c326dc26eb918d327358797ee67ad7415d871ef7eaf0d4f6352d3ad021fbb4',
      );
    });
  });

  describe('RepayWithATokenTxBuilder', () => {
    const config = {
      POOL,
      WETH_GATEWAY,
    };

    const instance = new PoolBundle(provider, config);

    it('generates repayWithAToken tx data with generateTxData with variable rate', () => {
      const result = instance.repayWithATokensTxBuilder.generateTxData({
        user: USER,
        reserve: TOKEN,
        amount: '1',
        rateMode: InterestRate.Variable,
      });

      expect(result.to).toEqual(POOL);
      expect(result.from).toEqual(USER);
      expect(result.data).toEqual(
        '0x2dad97d4000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002',
      );
    });

    it('generates repayWithAToken tx data with generateTxData with variable rate and max input', () => {
      const result = instance.repayWithATokensTxBuilder.generateTxData({
        user: USER,
        reserve: TOKEN,
        amount: '-1',
        rateMode: InterestRate.Variable,
      });

      expect(result.to).toEqual(POOL);
      expect(result.from).toEqual(USER);
      expect(result.data).toEqual(
        '0x2dad97d40000000000000000000000000000000000000000000000000000000000000004ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000000000000000000000000000000000000000000000000000000000000002',
      );
    });

    it('generates repayWithAToken tx data with generateTxData with stable debt', () => {
      const result = instance.repayWithATokensTxBuilder.generateTxData({
        user: USER,
        reserve: TOKEN,
        amount: '1',
        rateMode: InterestRate.Stable,
      });

      expect(result.to).toEqual(POOL);
      expect(result.from).toEqual(USER);
      expect(result.data).toEqual(
        '0x2dad97d4000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001',
      );
    });

    it('should throw error if ETH mock address is passed', () => {
      const generateData = () =>
        instance.repayWithATokensTxBuilder.generateTxData({
          user: USER,
          reserve: API_ETH_MOCK_ADDRESS,
          amount: '1',
          rateMode: InterestRate.Variable,
        });

      expect(generateData).toThrow();
    });
  });
});
