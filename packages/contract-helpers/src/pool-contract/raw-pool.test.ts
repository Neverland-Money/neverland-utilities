import { poolAbi } from '@neverland-money/contract-types';
import type { PerformActionRequest } from 'ethers';
import {
  Interface,
  Signature,
  Wallet,
  ZeroAddress,
  ZeroHash,
  getNumber,
  verifyTypedData,
} from 'ethers';
import * as helpers from '..';
import { OfflineProvider } from '../__tests__/offline-provider';
import type { EthereumTransactionTypeExtended, transactionType } from '../commons/types';

const USER = '0x0000000000000000000000000000000000000001';
const TOKEN = '0x0000000000000000000000000000000000000002';
const POOL = '0x0000000000000000000000000000000000000003';
const BENEFICIARY = '0x0000000000000000000000000000000000000004';
const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const UINT256_MAX = (2n ** 256n - 1n).toString();
const poolInterface = new Interface(JSON.stringify(poolAbi));
const tokenInterface = new Interface([
  'function allowance(address owner,address spender) view returns (uint256)',
  'function approve(address spender,uint256 value) returns (bool)',
  'function decimals() view returns (uint8)',
]);

// Real ethers6 Contract/AbstractProvider calls and ABI encoding, with only the
// external transport replaced. Any unexpected network/read path fails closed.
class RawOfflineProvider extends OfflineProvider {
  allowanceRaw = '0';
  allowanceGate?: Promise<void>;
  constructor() {
    super();
    this.gasEstimate = 21000n;
    this.mockContract({
      allowance: async (owner: string, spender: string) => {
        expect(owner).toBe(USER);
        expect(spender).toBe(POOL);
        await this.allowanceGate;
        return BigInt(this.allowanceRaw);
      },
      decimals: async () => 6n,
    });
  }

  async _perform<T = unknown>(request: PerformActionRequest): Promise<T> {
    if (request.method === 'call') expect(request.transaction.to).toBe(TOKEN);
    return super._perform<T>(request);
  }
}

type SupplyParams = helpers.PoolSupplyRawParams;
type RepayParams = helpers.PoolRepayRawParams;

function finitePool(provider = new RawOfflineProvider(), pool = POOL) {
  return new helpers.Pool(provider, { POOL: pool });
}

const supplyParams = (): SupplyParams => ({ user: USER, reserve: TOKEN, amountRaw: '1234567' });
const repayParams = (): RepayParams => ({
  ...supplyParams(),
  interestRateMode: helpers.InterestRate.Variable,
});

async function transactions(
  builders: EthereumTransactionTypeExtended[],
): Promise<transactionType[]> {
  const result: transactionType[] = [];
  for (const builder of builders) {
    // eslint-disable-next-line no-await-in-loop -- Exercise the required transaction order.
    result.push(await builder.tx());
  }

  return result;
}

function calldata(tx: transactionType): string {
  if (!tx.data) throw new Error('Missing transaction calldata');
  return tx.data;
}

describe('Pool finite raw transaction policy', () => {
  it.each([
    ['token', BENEFICIARY, USER, POOL],
    ['owner', TOKEN, BENEFICIARY, POOL],
    ['spender', TOKEN, USER, BENEFICIARY],
  ])(
    'rejects an allowance read with the wrong %s in the raw harness',
    async (_field, token, user, spender) => {
      const service = new helpers.ERC20Service(new RawOfflineProvider());
      await expect(service.allowanceRaw({ token, user, spender })).rejects.toThrow();
    },
  );

  it('encodes exact approval and raw supply with the ethers6 callback shape', async () => {
    const pool = finitePool();
    const builders = await pool.supplyRaw({
      ...supplyParams(),
      onBehalfOf: BENEFICIARY,
      referralCode: '65535',
    });
    expect(builders.map(builder => builder.txType)).toEqual([
      helpers.eEthereumTxType.ERC20_APPROVAL,
      helpers.eEthereumTxType.DLP_ACTION,
    ]);
    const [approval, action] = await transactions(builders);
    expect(approval.to).toBe(TOKEN);
    expect(
      tokenInterface.decodeFunctionData('approve', calldata(approval)).toObject(),
    ).toMatchObject({
      spender: POOL,
      value: BigInt('1234567'),
    });
    expect(action).toMatchObject({ from: USER, to: POOL });
    expect(BigInt(action.value ?? '0') === 0n).toBe(true);
    expect(poolInterface.decodeFunctionData('supply', calldata(action)).toObject()).toMatchObject({
      asset: TOKEN,
      amount: BigInt('1234567'),
      onBehalfOf: BENEFICIARY,
      referralCode: 65535n,
    });
    expect(await builders[1].gas()).toMatchObject({ gasPrice: '1' });
    action.from = BENEFICIARY;
    action.data = '0x';
    const repeated = await builders[1].tx();
    expect(repeated.from).toBe(USER);
    expect(poolInterface.decodeFunctionData('supply', calldata(repeated)).toObject()).toMatchObject(
      {
        amount: BigInt('1234567'),
      },
    );
  });

  it.each([
    ['0', false, ['1234567']],
    ['0', true, ['1234567']],
    ['1', false, ['1234567']],
    ['1', true, ['0', '1234567']],
    ['1234567', true, []],
    [UINT256_MAX, true, []],
  ] as const)(
    'sequences exact approvals for allowance %s and zeroFirst %s',
    async (allowance, zeroFirst, expected) => {
      const provider = new RawOfflineProvider();
      provider.allowanceRaw = allowance;
      const built = await transactions(
        await finitePool(provider).supplyRaw({ ...supplyParams(), zeroFirst }),
      );
      expect(
        built.slice(0, -1).map(tx => {
          const decoded = tokenInterface.decodeFunctionData('approve', calldata(tx));
          if (!(typeof decoded.value === 'bigint'))
            throw new Error('Expected uint256 approval amount');
          return decoded.value.toString();
        }),
      ).toEqual(expected);
      expect(
        poolInterface.decodeFunctionData('supply', calldata(built[built.length - 1])).toObject(),
      ).toMatchObject({ amount: BigInt('1234567'), onBehalfOf: USER, referralCode: 0n });
    },
  );

  it('uses one prepared buffered amount for exact repayment approval and calldata', async () => {
    const amountRaw = helpers.calculateBufferedRepayAmount({
      debtRaw: '1000000000000000000000000',
      variableBorrowRateRay: '50000000000000000000000000',
    });
    expect(amountRaw).toBe('1000000951294211238855626');
    const [approval, action] = await transactions(
      await finitePool().repayRaw({ ...repayParams(), amountRaw }),
    );
    expect(
      tokenInterface.decodeFunctionData('approve', calldata(approval)).toObject(),
    ).toMatchObject({
      value: BigInt('1000000951294211238855626'),
    });
    expect(poolInterface.decodeFunctionData('repay', calldata(action)).toObject()).toMatchObject({
      asset: TOKEN,
      amount: BigInt('1000000951294211238855626'),
      interestRateMode: BigInt(2),
      onBehalfOf: USER,
    });
  });

  it('accepts the explicit stable mode and skips approval when allowance already suffices', async () => {
    const provider = new RawOfflineProvider();
    provider.allowanceRaw = '1234567';
    const built = await transactions(
      await finitePool(provider).repayRaw({
        ...repayParams(),
        interestRateMode: helpers.InterestRate.Stable,
        onBehalfOf: BENEFICIARY,
      }),
    );
    expect(built).toHaveLength(1);
    expect(poolInterface.decodeFunctionData('repay', calldata(built[0])).toObject()).toMatchObject({
      interestRateMode: BigInt(1),
      onBehalfOf: BENEFICIARY,
    });
  });

  it('captures raw amount, sender, reserve, beneficiary and referral before awaiting allowance', async () => {
    const provider = new RawOfflineProvider();
    let release: (() => void) | undefined;
    provider.allowanceGate = new Promise<void>(resolve => {
      release = resolve;
    });
    const pool = finitePool(provider);
    const params = {
      ...supplyParams(),
      onBehalfOf: BENEFICIARY,
      referralCode: '42',
      zeroFirst: false,
    };
    const pending = pool.supplyRaw(params);
    params.amountRaw = UINT256_MAX;
    params.user = BENEFICIARY;
    params.reserve = NATIVE;
    params.onBehalfOf = USER;
    params.referralCode = '65536';
    params.zeroFirst = true;
    release?.();
    const [approval, action] = await transactions(await pending);
    expect(approval).toMatchObject({ from: USER, to: TOKEN });
    expect(
      tokenInterface.decodeFunctionData('approve', calldata(approval)).toObject(),
    ).toMatchObject({
      value: BigInt('1234567'),
    });
    expect(action.from).toBe(USER);
    expect(poolInterface.decodeFunctionData('supply', calldata(action)).toObject()).toMatchObject({
      asset: TOKEN,
      amount: BigInt('1234567'),
      onBehalfOf: BENEFICIARY,
      referralCode: 42n,
    });
  });

  it('reuses a real signed permit buffer unchanged in decoded repayment calldata', async () => {
    const wallet = new Wallet(`0x${'11'.repeat(32)}`);
    const amountRaw = helpers.calculateBufferedRepayAmount({
      debtRaw: '1000000000000000000',
      variableBorrowRateRay: '50000000000000000000000000',
    });
    const data = helpers.buildErc2612PermitTypedData({
      domain: { name: 'Agora Dollar', version: '1', chainId: 143, verifyingContract: TOKEN },
      owner: wallet.address,
      spender: POOL,
      valueRaw: amountRaw,
      nonceRaw: '9007199254740993',
      deadline: 1792916073,
    });
    const signature = await wallet.signTypedData(data.domain, data.types, data.message);
    const split = Signature.from(signature);
    const params = {
      ...repayParams(),
      user: wallet.address,
      amountRaw,
      deadline: '1792916073',
      signature: { r: split.r, s: split.s, v: split.v },
    };
    const pending = finitePool().repayWithPermitRaw(params);
    params.amountRaw = '2';
    params.deadline = '0';
    params.signature.r = ZeroHash;
    params.signature.s = ZeroHash;
    params.signature.v = 28;
    params.user = USER;
    params.interestRateMode = helpers.InterestRate.Stable;
    const built = await transactions(await pending);
    expect(built).toHaveLength(1);
    expect(built[0].from).toBe(wallet.address);
    const decoded = poolInterface.decodeFunctionData('repayWithPermit', calldata(built[0]));
    expect(decoded.toObject()).toMatchObject({
      asset: TOKEN,
      amount: BigInt('1000000951294211240'),
      interestRateMode: BigInt(2),
      onBehalfOf: wallet.address,
      deadline: BigInt('1792916073'),
      permitV: BigInt(split.v),
      permitR: split.r,
      permitS: split.s,
    });
    if (
      !(typeof decoded.amount === 'bigint') ||
      typeof decoded.permitR !== 'string' ||
      typeof decoded.permitS !== 'string' ||
      typeof decoded.permitV !== 'bigint'
    ) {
      throw new Error('Expected permit transaction fields');
    }

    expect(decoded.amount.toString()).toBe(data.message.value);
    expect(
      verifyTypedData(data.domain, data.types, data.message, {
        r: decoded.permitR,
        s: decoded.permitS,
        v: getNumber(decoded.permitV),
      }),
    ).toBe(wallet.address);
  });

  it('supplies with an exact finite permit and no allowance query', async () => {
    const wallet = new Wallet(`0x${'22'.repeat(32)}`);
    const signature = await wallet.signMessage('offline SDK fixture');
    const built = await transactions(
      await finitePool().supplyWithPermitRaw({
        ...supplyParams(),
        deadline: 1792916073,
        signature,
        onBehalfOf: BENEFICIARY,
        referralCode: '7',
      }),
    );
    expect(built).toHaveLength(1);
    expect(
      poolInterface.decodeFunctionData('supplyWithPermit', calldata(built[0])).toObject(),
    ).toMatchObject({
      asset: TOKEN,
      amount: BigInt('1234567'),
      onBehalfOf: BENEFICIARY,
      referralCode: 7n,
      deadline: BigInt('1792916073'),
    });
  });

  it.each([
    '0',
    '-1',
    UINT256_MAX,
    (2n ** 256n).toString(),
    '1.5',
    'NaN',
    'Infinity',
    '1e18',
    '',
    ' 1',
    '0x1',
  ])('rejects invalid finite transaction amount %s across all methods', async amountRaw => {
    const pool = finitePool();
    const signature = `0x${'00'.repeat(64)}1b`;
    await expect(pool.supplyRaw({ ...supplyParams(), amountRaw })).rejects.toThrow();
    await expect(pool.repayRaw({ ...repayParams(), amountRaw })).rejects.toThrow();
    await expect(
      pool.supplyWithPermitRaw({ ...supplyParams(), amountRaw, deadline: 1, signature }),
    ).rejects.toThrow();
    await expect(
      pool.repayWithPermitRaw({ ...repayParams(), amountRaw, deadline: 1, signature }),
    ).rejects.toThrow();
  });

  it.each([helpers.InterestRate.None, '2', 2, '', undefined])(
    'rejects unsupported rate mode %s',
    async interestRateMode => {
      const params = repayParams();
      Reflect.set(params, 'interestRateMode', interestRateMode);
      await expect(finitePool().repayRaw(params)).rejects.toThrow();
    },
  );

  it.each(['-1', '65536', '0.5', 'NaN', 'Infinity', '1e3'])(
    'rejects invalid uint16 referral %s',
    async referralCode => {
      await expect(finitePool().supplyRaw({ ...supplyParams(), referralCode })).rejects.toThrow();
    },
  );

  it.each([NATIVE, ZeroAddress, 'invalid'])(
    'rejects native/zero/invalid reserve or pool %s',
    async reserve => {
      await expect(finitePool().supplyRaw({ ...supplyParams(), reserve })).rejects.toThrow();
      await expect(finitePool().repayRaw({ ...repayParams(), reserve })).rejects.toThrow();
      await expect(
        finitePool(new RawOfflineProvider(), reserve).supplyRaw(supplyParams()),
      ).rejects.toThrow();
    },
  );

  it('rejects invalid user/beneficiary, zeroFirst flags, unsafe deadlines and malformed signatures', async () => {
    const pool = finitePool();
    await expect(pool.supplyRaw({ ...supplyParams(), user: ZeroAddress })).rejects.toThrow();
    await expect(pool.repayRaw({ ...repayParams(), onBehalfOf: ZeroAddress })).rejects.toThrow();
    const params = supplyParams();
    Reflect.set(params, 'zeroFirst', 'true');
    await expect(pool.supplyRaw(params)).rejects.toThrow();
    await expect(
      pool.supplyWithPermitRaw({
        ...supplyParams(),
        deadline: Number.MAX_SAFE_INTEGER + 1,
        signature: '0x',
      }),
    ).rejects.toThrow();
    await expect(
      pool.repayWithPermitRaw({ ...repayParams(), deadline: '1', signature: 'invalid' }),
    ).rejects.toThrow();
  });
});

describe('Pool decimal and raw compatibility', () => {
  it('uses the same Pool for decimal supply/repay and exact raw supply/repay', async () => {
    const provider = new RawOfflineProvider();
    provider.allowanceRaw = UINT256_MAX;
    const pool = finitePool(provider);
    await Promise.all(
      (['supply', 'repay'] as const).map(async operation => {
        const decimal = await pool[operation]({
          user: USER,
          reserve: TOKEN,
          amount: '1.234567',
          interestRateMode: helpers.InterestRate.Variable,
        });
        const raw =
          operation === 'supply'
            ? await pool.supplyRaw(supplyParams())
            : await pool.repayRaw(repayParams());
        const [decimalTx] = await transactions(decimal);
        const [rawTx] = await transactions(raw);
        expect(decimalTx.to).toBe(rawTx.to);
        expect(calldata(decimalTx)).toBe(calldata(rawTx));
        expect(pool).toBeInstanceOf(helpers.Pool);
      }),
    );
  });

  it.each(['', NATIVE, ZeroAddress, 'invalid'])(
    'validates pool address %s at every raw boundary while keeping optional decimal construction',
    async poolAddress => {
      const pool = finitePool(new RawOfflineProvider(), poolAddress);
      const signature = `0x${'00'.repeat(64)}1b`;
      await expect(pool.supplyRaw(supplyParams())).rejects.toThrow();
      await expect(pool.repayRaw(repayParams())).rejects.toThrow();
      await expect(
        pool.supplyWithPermitRaw({ ...supplyParams(), deadline: 1, signature }),
      ).rejects.toThrow();
      await expect(
        pool.repayWithPermitRaw({ ...repayParams(), deadline: 1, signature }),
      ).rejects.toThrow();
    },
  );

  it('keeps optional Pool construction and preserves decimal empty-address handling', async () => {
    const pool = new helpers.Pool(new RawOfflineProvider());
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(await pool.supply({ user: USER, reserve: TOKEN, amount: '1' })).toEqual([]);
      await expect(pool.supplyRaw(supplyParams())).rejects.toThrow('POOL');
    } finally {
      error.mockRestore();
    }
  });

  it.each(['supplyWithPermit', 'repayWithPermit'] as const)(
    'preserves %s finite decimal amounts and ethers6 SignatureLike objects',
    async method => {
      const wallet = new Wallet(`0x${'33'.repeat(32)}`);
      const signature = Signature.from(await wallet.signMessage('offline legacy fixture'));
      const pool = new helpers.Pool(new RawOfflineProvider(), { POOL });
      const built = await transactions(
        await pool[method]({
          user: USER,
          reserve: TOKEN,
          amount: '1.234567',
          interestRateMode: helpers.InterestRate.Variable,
          deadline: '1792916073',
          signature,
        }),
      );
      expect(built).toHaveLength(1);
      expect(poolInterface.decodeFunctionData(method, calldata(built[0])).toObject()).toMatchObject(
        {
          amount: BigInt('1234567'),
          deadline: BigInt('1792916073'),
          permitV: BigInt(signature.v),
          permitR: signature.r,
          permitS: signature.s,
        },
      );
    },
  );
});
