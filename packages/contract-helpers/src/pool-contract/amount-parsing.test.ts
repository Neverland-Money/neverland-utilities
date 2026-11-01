import { poolAbi, wethGatewayLegacyAbi } from '@neverland-money/contract-types';
import { BigNumber } from 'bignumber.js';
import type { TransactionRequest } from 'ethers';
import { Interface, MaxUint256 } from 'ethers';
import { OfflineProvider } from '../__tests__/offline-provider';
import { InterestRate } from '../commons/types';
import { API_ETH_MOCK_ADDRESS, decimalsToCurrencyUnits, valueToWei } from '../commons/utils';
import { BaseDebtToken } from '../debt-token-contract';
import { ERC20Service } from '../erc20-contract';
import { WETHGatewayService } from '../wrapped-native-gateway-contract';
import { Pool } from './pool';
import { PoolBundle } from './pool-bundle';

const POOL = '0x0000000000000000000000000000000000000001';
const GATEWAY = '0x0000000000000000000000000000000000000002';
const USER = '0x0000000000000000000000000000000000000003';
const RESERVE = '0x0000000000000000000000000000000000000004';
const A_TOKEN = '0x0000000000000000000000000000000000000005';
const DEBT_TOKEN = '0x0000000000000000000000000000000000000006';
const SIGNATURE =
  '0x532f8df4e2502bd869fb35e9301156f9b307380afdcc25cfbc87b2e939f16f7e47c326dc26eb918d327358797ee67ad7415d871ef7eaf0d4f6352d3ad021fbb41c';

const poolInterface = new Interface(poolAbi);
const gatewayInterface = new Interface(wethGatewayLegacyAbi);

function decodedArgs(iface: Interface, data: string | null | undefined): unknown[] {
  const parsed = iface.parseTransaction({ data: data ?? '0x' });
  if (!parsed) throw new Error('Undecodable calldata');
  return parsed.args.toArray();
}

/** The message of the RangeError a synchronous or asynchronous call fails with. */
async function rangeError(run: () => unknown): Promise<string> {
  try {
    await run();
  } catch (error: unknown) {
    if (error instanceof RangeError) return error.message;
    throw error;
  }

  throw new Error('Expected a RangeError');
}

describe('valueToWei', () => {
  // Each spelling passes the decorated Number(amount) > 0 gate today and is exact in base 10.
  it.each([
    ['1', 6, '1000000'],
    [' 1 ', 6, '1000000'],
    ['\t1.5\n', 6, '1500000'],
    ['+2', 6, '2000000'],
    ['1.', 6, '1000000'],
    ['.5', 6, '500000'],
    ['1e3', 0, '1000'],
    ['1E-6', 6, '1'],
    ['+1.5e+3', 2, '150000'],
    ['0001.100000000000000000000', 6, '1100000'],
    ['1.0', 6, '1000000'],
  ])('converts the decorated-method spelling %p at %p decimals', (value, decimals, expected) => {
    expect(Number(value)).toBeGreaterThan(0);
    expect(valueToWei(value, decimals)).toBe(expected);
  });

  it('parses long malformed digit runs in linear time', () => {
    for (const value of ['1'.repeat(100_000) + 'x', '1' + ' '.repeat(100_000) + 'x']) {
      const started = performance.now();
      expect(() => valueToWei(value, 18)).toThrow(RangeError);
      expect(performance.now() - started).toBeLessThan(2000);
    }
  });

  // Expected results were recorded from the previous pattern, so any change in accepted spellings,
  // values or messages fails here.
  it.each<readonly [string, { wei: string } | { error: string }]>([
    ['1', { wei: '1000000000000000000' }],
    ['+1', { wei: '1000000000000000000' }],
    ['-1', { error: 'Amount -1 must not be negative' }],
    ['-0', { wei: '0' }],
    ['+0', { wei: '0' }],
    ['0', { wei: '0' }],
    ['00', { wei: '0' }],
    ['1.', { wei: '1000000000000000000' }],
    ['1.5', { wei: '1500000000000000000' }],
    ['.5', { wei: '500000000000000000' }],
    ['+.5', { wei: '500000000000000000' }],
    ['-.5', { error: 'Amount -.5 must not be negative' }],
    ['.', { error: 'Amount . must be a base-10 decimal number' }],
    ['+', { error: 'Amount + must be a base-10 decimal number' }],
    ['-', { error: 'Amount - must be a base-10 decimal number' }],
    ['', { error: 'Amount  must be a base-10 decimal number' }],
    ['  ', { error: 'Amount    must be a base-10 decimal number' }],
    ['1e3', { wei: '1000000000000000000000' }],
    ['1E3', { wei: '1000000000000000000000' }],
    ['1e+3', { wei: '1000000000000000000000' }],
    ['1e-3', { wei: '1000000000000000' }],
    ['1.5e1', { wei: '15000000000000000000' }],
    ['.5e1', { wei: '5000000000000000000' }],
    ['1.e1', { wei: '10000000000000000000' }],
    ['1e', { error: 'Amount 1e must be a base-10 decimal number' }],
    ['e1', { error: 'Amount e1 must be a base-10 decimal number' }],
    ['1e+', { error: 'Amount 1e+ must be a base-10 decimal number' }],
    ['1.2.3', { error: 'Amount 1.2.3 must be a base-10 decimal number' }],
    ['0x10', { error: 'Amount 0x10 must be a base-10 decimal number' }],
    ['0x', { error: 'Amount 0x must be a base-10 decimal number' }],
    ['1_000', { error: 'Amount 1_000 must be a base-10 decimal number' }],
    ['1,5', { error: 'Amount 1,5 must be a base-10 decimal number' }],
    [' 1 ', { wei: '1000000000000000000' }],
    ['\t1\n', { wei: '1000000000000000000' }],
    ['1 2', { error: 'Amount 1 2 must be a base-10 decimal number' }],
    ['- 1', { error: 'Amount - 1 must be a base-10 decimal number' }],
    ['+-1', { error: 'Amount +-1 must be a base-10 decimal number' }],
    ['--1', { error: 'Amount --1 must be a base-10 decimal number' }],
    ['1e1.5', { error: 'Amount 1e1.5 must be a base-10 decimal number' }],
    [
      '1.0000000000000000001',
      { error: 'Amount 1.0000000000000000001 cannot be represented with 18 decimals' },
    ],
    ['0.000000000000000001', { wei: '1' }],
    [
      '115792089237316195423570985008687907853269984665640564039457584007913129639936',
      {
        error:
          'Amount 115792089237316195423570985008687907853269984665640564039457584007913129639936 exceeds the uint256 range with 18 decimals',
      },
    ],
    ['1e78', { error: 'Amount 1e78 exceeds the uint256 range with 18 decimals' }],
    ['1e-30', { error: 'Amount 1e-30 cannot be represented with 18 decimals' }],
    ['-1e-30', { error: 'Amount -1e-30 must not be negative' }],
    ['0e999', { wei: '0' }],
    ['00.100', { wei: '100000000000000000' }],
    ['\u0661\u0662', { error: 'Amount \u0661\u0662 must be a base-10 decimal number' }],
    ['1f', { error: 'Amount 1f must be a base-10 decimal number' }],
    ['Infinity', { error: 'Amount Infinity must be a base-10 decimal number' }],
    ['NaN', { error: 'Amount NaN must be a base-10 decimal number' }],
    ['1e0', { wei: '1000000000000000000' }],
    ['0.0e5', { wei: '0' }],
    ['+0.0', { wei: '0' }],
    ['\u00a01', { wei: '1000000000000000000' }],
    ['1\u2003', { wei: '1000000000000000000' }],
  ])('keeps the recorded result for %j at 18 decimals', (value, expected) => {
    if ('wei' in expected) {
      expect(valueToWei(value, 18)).toBe(expected.wei);
    } else {
      expect(() => valueToWei(value, 18)).toThrow(new RangeError(expected.error));
    }
  });

  it('keeps zero, including negative zero, at zero', () => {
    expect(valueToWei('0', 18)).toBe('0');
    expect(valueToWei('-0', 18)).toBe('0');
    expect(valueToWei('0.000', 6)).toBe('0');
  });

  it.each([
    '0x10',
    '0X10',
    '0b11',
    '0o17',
    '0x0.ffffffffffffffffff',
    '',
    '   ',
    'abc',
    'Infinity',
    '-Infinity',
    'NaN',
    '1_000',
    '1 000',
    '1e',
    '--1',
    '+-1',
  ])('rejects %p, which is not a base-10 decimal, with a RangeError', async value => {
    expect(await rangeError(() => valueToWei(value, 6))).toBe(
      `Amount ${value} must be a base-10 decimal number`,
    );
  });

  it('rejects negative, non-integral, oversized and underflowing base-unit results', async () => {
    expect(await rangeError(() => valueToWei('-1', 18))).toBe('Amount -1 must not be negative');
    expect(await rangeError(() => valueToWei('-0.000001', 6))).toContain('must not be negative');
    expect(await rangeError(() => valueToWei('0.6', 0))).toContain(
      'cannot be represented with 0 decimals',
    );
    expect(await rangeError(() => valueToWei('1.0000001', 6))).toContain(
      'cannot be represented with 6 decimals',
    );
    expect(valueToWei(MaxUint256.toString(), 0)).toBe(MaxUint256.toString());
    expect(await rangeError(() => valueToWei((MaxUint256 + 1n).toString(), 0))).toContain(
      'exceeds the uint256 range',
    );
    expect(await rangeError(() => valueToWei('1e80', 6))).toContain('exceeds the uint256 range');
    // Beyond the exponent range the parse overflows to Infinity or underflows to zero.
    expect(await rangeError(() => valueToWei('1e10000001', 0))).toContain(
      'exceeds the uint256 range',
    );
    expect(await rangeError(() => valueToWei('1e-10000001', 18))).toContain(
      'cannot be represented with 18 decimals',
    );
  });

  it("ignores a consumer's global BigNumber configuration", async () => {
    const saved = BigNumber.config();
    try {
      BigNumber.config({
        DECIMAL_PLACES: 0,
        ROUNDING_MODE: BigNumber.ROUND_UP,
        RANGE: [-20, 40],
        EXPONENTIAL_AT: 1,
      });
      // The consumer's constructor would underflow this amount to zero.
      expect(new BigNumber('1e-21').isZero()).toBe(true);
      expect(await rangeError(() => valueToWei('1e-21', 6))).toContain(
        'cannot be represented with 6 decimals',
      );
      expect(valueToWei('1.000001', 6)).toBe('1000001');
      expect(decimalsToCurrencyUnits('1', 30)).toBe(`0.${'0'.repeat(29)}1`);
    } finally {
      BigNumber.config(saved);
    }
  });
});

describe('decimal Pool, gateway and approval amounts', () => {
  function decimalPool(decimals: number) {
    const pool = new Pool(new OfflineProvider(), { POOL, WETH_GATEWAY: GATEWAY });
    jest.spyOn(pool.erc20Service, 'decimalsOf').mockResolvedValue(decimals);
    const isApproved = jest.spyOn(pool.erc20Service, 'isApproved').mockResolvedValue(true);
    return { pool, isApproved };
  }

  it.each([
    [0, '0.6'],
    [6, '1.0000001'],
  ])(
    'rejects with a RangeError every decimal Pool method given %p decimals and %p',
    async (decimals, amount) => {
      const { pool, isApproved } = decimalPool(decimals);
      const message = `Amount ${amount} cannot be represented with ${decimals} decimals`;
      const request = { user: USER, reserve: RESERVE, amount };
      const debt = { ...request, interestRateMode: InterestRate.Variable };
      const permit = { signature: SIGNATURE, deadline: '1' };
      expect(await rangeError(async () => pool.supply(request))).toBe(message);
      expect(await rangeError(async () => pool.deposit(request))).toBe(message);
      expect(await rangeError(async () => pool.withdraw(request))).toBe(message);
      expect(await rangeError(async () => pool.borrow(debt))).toBe(message);
      expect(await rangeError(async () => pool.repay(debt))).toBe(message);
      expect(await rangeError(async () => pool.supplyWithPermit({ ...request, ...permit }))).toBe(
        message,
      );
      expect(await rangeError(async () => pool.repayWithPermit({ ...debt, ...permit }))).toBe(
        message,
      );
      expect(
        await rangeError(async () =>
          pool.repayWithATokens({ ...request, rateMode: InterestRate.Variable }),
        ),
      ).toBe(message);
      expect(isApproved).not.toHaveBeenCalled();
    },
  );

  it('rejects hex and oversized decimal amounts before any allowance read', async () => {
    const { pool, isApproved } = decimalPool(6);
    const request = { user: USER, reserve: RESERVE, interestRateMode: InterestRate.Variable };
    // A raw hex amount would otherwise be read as whole tokens: 0xf4240 is 1,000,000 USDC.
    expect(await rangeError(async () => pool.repay({ ...request, amount: '0xf4240' }))).toContain(
      'must be a base-10 decimal number',
    );
    expect(await rangeError(async () => pool.supply({ ...request, amount: '1e80' }))).toContain(
      'exceeds the uint256 range',
    );
    expect(await rangeError(async () => pool.repay({ ...request, amount: '1e80' }))).toContain(
      'exceeds the uint256 range',
    );
    expect(isApproved).not.toHaveBeenCalled();
  });

  it('keeps exact decimal spellings and the -1 maximum working', async () => {
    const { pool } = decimalPool(6);
    const [supplied] = await pool.supply({ user: USER, reserve: RESERVE, amount: ' +1.5e0 ' });
    expect(decodedArgs(poolInterface, (await supplied.tx()).data)).toEqual([
      RESERVE,
      1_500_000n,
      USER,
      0n,
    ]);
    const [withdrawn] = await pool.withdraw({ user: USER, reserve: RESERVE, amount: '-1' });
    expect(decodedArgs(poolInterface, (await withdrawn.tx()).data)[1]).toBe(MaxUint256);
    const [repaid] = await pool.repay({
      user: USER,
      reserve: RESERVE,
      amount: '-1',
      interestRateMode: InterestRate.Variable,
    });
    expect(decodedArgs(poolInterface, (await repaid.tx()).data)[1]).toBe(MaxUint256);
  });

  it('rejects with a RangeError every native gateway method given excess 18-decimal precision', async () => {
    const provider = new OfflineProvider();
    const gateway = new WETHGatewayService(provider, new ERC20Service(provider), GATEWAY);
    const pool = new Pool(provider, { POOL, WETH_GATEWAY: GATEWAY });
    const amount = '1.0000000000000000001';
    const message = `Amount ${amount} cannot be represented with 18 decimals`;
    const request = { lendingPool: POOL, user: USER, amount };
    const debt = { ...request, interestRateMode: InterestRate.Variable };
    expect(await rangeError(() => gateway.depositETH(request))).toBe(message);
    expect(await rangeError(() => gateway.repayETH(debt))).toBe(message);
    expect(
      await rangeError(async () => gateway.withdrawETH({ ...request, aTokenAddress: A_TOKEN })),
    ).toBe(message);
    expect(
      await rangeError(async () => gateway.borrowETH({ ...debt, debtTokenAddress: DEBT_TOKEN })),
    ).toBe(message);
    expect(
      await rangeError(async () =>
        pool.supply({ user: USER, reserve: API_ETH_MOCK_ADDRESS, amount }),
      ),
    ).toBe(message);
  });

  /** Approval readers whose allowance and delegation both hold 16 base units of a 6-decimal token. */
  function approvalReaders() {
    const provider = new OfflineProvider();
    provider.mockContract({
      allowance: async () => 16n,
      borrowAllowance: async () => 16n,
      decimals: async () => 6n,
    });
    const token = new ERC20Service(provider);
    return { token, debt: new BaseDebtToken(provider, token) };
  }

  const approval = { user: USER, token: RESERVE, spender: POOL };
  const delegation = { debtTokenAddress: RESERVE, allowanceGiver: USER, allowanceReceiver: POOL };

  it.each(['16', ' 16 ', '0x10'])(
    'keeps the raw nativeDecimals approval amount %p working',
    async amount => {
      const { token, debt } = approvalReaders();
      await expect(token.isApproved({ ...approval, amount, nativeDecimals: true })).resolves.toBe(
        true,
      );
      await expect(
        debt.isDelegationApproved({ ...delegation, amount, nativeDecimals: true }),
      ).resolves.toBe(true);
    },
  );

  it('rejects excess precision in approval checks and keeps raw nativeDecimals inputs', async () => {
    const { token, debt } = approvalReaders();
    const message = 'Amount 1.0000001 cannot be represented with 6 decimals';
    expect(
      await rangeError(async () => token.isApproved({ ...approval, amount: '1.0000001' })),
    ).toBe(message);
    expect(
      await rangeError(async () =>
        debt.isDelegationApproved({ ...delegation, amount: '1.0000001' }),
      ),
    ).toBe(message);
    expect(
      await rangeError(async () => token.isApproved({ ...approval, amount: '0x10' })),
    ).toContain('must be a base-10 decimal number');
    await expect(token.isApproved({ ...approval, amount: '0.000016' })).resolves.toBe(true);
    await expect(token.isApproved({ ...approval, amount: '-1' })).resolves.toBe(false);
    await expect(
      token.isApproved({ ...approval, amount: '0x11', nativeDecimals: true }),
    ).resolves.toBe(false);
    await expect(
      debt.isDelegationApproved({ ...delegation, amount: '0x11', nativeDecimals: true }),
    ).resolves.toBe(false);
  });
});

type Build = (bundle: PoolBundle, amount: string) => TransactionRequest;

const BUILDERS: Array<[string, Build]> = [
  [
    'supply',
    (bundle, amount) =>
      bundle.supplyTxBuilder.generateTxData({ user: USER, reserve: RESERVE, amount }),
  ],
  [
    'native supply',
    (bundle, amount) =>
      bundle.supplyTxBuilder.generateTxData({ user: USER, reserve: API_ETH_MOCK_ADDRESS, amount }),
  ],
  [
    'signed supply',
    (bundle, amount) =>
      bundle.supplyTxBuilder.generateSignedTxData({
        user: USER,
        reserve: RESERVE,
        amount,
        signature: SIGNATURE,
        deadline: '1',
      }),
  ],
  [
    'borrow',
    (bundle, amount) =>
      bundle.borrowTxBuilder.generateTxData({
        user: USER,
        reserve: RESERVE,
        amount,
        interestRateMode: InterestRate.Variable,
      }),
  ],
  [
    'native borrow',
    (bundle, amount) =>
      bundle.borrowTxBuilder.generateTxData({
        user: USER,
        reserve: API_ETH_MOCK_ADDRESS,
        amount,
        interestRateMode: InterestRate.Variable,
        debtTokenAddress: DEBT_TOKEN,
      }),
  ],
  [
    'repay',
    (bundle, amount) =>
      bundle.repayTxBuilder.generateTxData({
        user: USER,
        reserve: RESERVE,
        amount,
        interestRateMode: InterestRate.Variable,
      }),
  ],
  [
    'native repay',
    (bundle, amount) =>
      bundle.repayTxBuilder.generateTxData({
        user: USER,
        reserve: API_ETH_MOCK_ADDRESS,
        amount,
        interestRateMode: InterestRate.Variable,
      }),
  ],
  [
    'signed repay',
    (bundle, amount) =>
      bundle.repayTxBuilder.generateSignedTxData({
        user: USER,
        reserve: RESERVE,
        amount,
        interestRateMode: InterestRate.Variable,
        signature: SIGNATURE,
        deadline: '1',
      }),
  ],
  [
    'repay with aTokens',
    (bundle, amount) =>
      bundle.repayWithATokensTxBuilder.generateTxData({
        user: USER,
        reserve: RESERVE,
        amount,
        rateMode: InterestRate.Variable,
      }),
  ],
];

describe('PoolBundle raw amounts', () => {
  const bundle = () => new PoolBundle(new OfflineProvider(), { POOL, WETH_GATEWAY: GATEWAY });

  it.each(BUILDERS)(
    '%s rejects blank, padded, prefixed, signed and non-integer amounts',
    (_, build) => {
      const instance = bundle();
      for (const amount of ['', '   ', ' 1', '1 ', '+1', '0x1', '0b1', '0o1', '-5', '1.5', '1e3']) {
        expect(() => build(instance, amount)).toThrow(TypeError);
        expect(() => build(instance, amount)).toThrow(
          'amount must be an unsigned decimal integer string',
        );
      }
    },
  );

  it.each(BUILDERS)('%s rejects zero and amounts above uint256', (_, build) => {
    const instance = bundle();
    expect(() => build(instance, '0')).toThrow(RangeError);
    expect(() => build(instance, '000')).toThrow('amount must be positive');
    expect(() => build(instance, (MaxUint256 + 1n).toString())).toThrow('amount is out of range');
  });

  it('keeps the -1 maximum only where a builder supported it', () => {
    const instance = bundle();
    const max = new Map(BUILDERS);
    for (const name of ['repay', 'signed repay', 'repay with aTokens']) {
      expect(decodedArgs(poolInterface, max.get(name)?.(instance, '-1').data)[1]).toBe(MaxUint256);
    }

    for (const name of ['supply', 'native supply', 'borrow', 'native borrow', 'native repay']) {
      expect(() => max.get(name)?.(instance, '-1')).toThrow(TypeError);
    }
  });

  it('encodes plain decimal-digit amounts exactly and uses one parsed value for calldata and value', () => {
    const instance = bundle();
    const signature = { signature: SIGNATURE, deadline: '1' };
    for (const amount of ['1', '1234567', '0001234567', MaxUint256.toString()]) {
      const raw = BigInt(amount);
      expect(
        instance.supplyTxBuilder.generateTxData({ user: USER, reserve: RESERVE, amount }).data,
      ).toBe(poolInterface.encodeFunctionData('supply', [RESERVE, raw, USER, 0]));
      expect(
        instance.supplyTxBuilder.generateSignedTxData({
          user: USER,
          reserve: RESERVE,
          amount,
          ...signature,
        }).data,
      ).toBe(
        instance.supplyTxBuilder.generateSignedTxData({
          user: USER,
          reserve: RESERVE,
          amount: raw.toString(),
          ...signature,
        }).data,
      );
      expect(
        instance.repayTxBuilder.generateTxData({
          user: USER,
          reserve: RESERVE,
          amount,
          interestRateMode: InterestRate.Variable,
        }).data,
      ).toBe(poolInterface.encodeFunctionData('repay', [RESERVE, raw, 2, USER]));
      const supplied = instance.supplyTxBuilder.generateTxData({
        user: USER,
        reserve: API_ETH_MOCK_ADDRESS,
        amount,
      });
      expect(supplied.value).toBe(raw);
      const repaid = instance.repayTxBuilder.generateTxData({
        user: USER,
        reserve: API_ETH_MOCK_ADDRESS,
        amount,
        interestRateMode: InterestRate.Variable,
      });
      expect(repaid.value).toBe(raw);
      expect(decodedArgs(gatewayInterface, repaid.data)).toEqual([POOL, raw, 2n, USER]);
    }
  });

  it('applies the same parser to the synchronous gateway builders', () => {
    const provider = new OfflineProvider();
    const gateway = new WETHGatewayService(provider, new ERC20Service(provider), GATEWAY);
    const request = { lendingPool: POOL, user: USER, interestRateMode: InterestRate.Variable };
    const builders = [
      (amount: string) => gateway.generateDepositEthTxData({ ...request, amount }),
      (amount: string) => gateway.generateBorrowEthTxData({ ...request, amount }),
      (amount: string) => gateway.generateRepayEthTxData({ ...request, amount }),
    ];
    for (const build of builders) {
      for (const amount of ['', '   ', '+1', '0x1', '0b11', '-1', '1.5']) {
        expect(() => build(amount)).toThrow(TypeError);
      }

      expect(() => build('0')).toThrow(RangeError);
    }

    expect(gateway.generateDepositEthTxData({ ...request, amount: '01000' }).value).toBe(1000n);
    const borrowed = gateway.generateBorrowEthTxData({ ...request, amount: '1000' });
    expect(decodedArgs(gatewayInterface, borrowed.data)).toEqual([POOL, 1000n, 2n, 0n]);
    const repaid = gateway.generateRepayEthTxData({ ...request, amount: '1000' });
    expect(repaid.value).toBe(1000n);
    expect(decodedArgs(gatewayInterface, repaid.data)).toEqual([POOL, 1000n, 2n, USER]);
  });
});
