import { AbiCoder } from 'ethers';
import vectors from './__fixtures__/transaction-regression-vectors.json';
import { OfflineProvider } from './__tests__/offline-provider';
import { InterestRate as DeepInterestRate } from './commons/types';
import type { LPBorrowParamsType, LPSupplyParamsType } from './pool-contract/pool-types';
import { DustLockHelper, ERC20Service, InterestRate, Pool, PoolBundle, expectToBeDefined } from '.';

const serialize = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (_key, field: unknown) =>
      typeof field === 'bigint'
        ? {
            type: 'BigNumber',
            hex:
              field === 0n
                ? '0x00'
                : '0x' +
                  field.toString(16).padStart(Math.ceil(field.toString(16).length / 2) * 2, '0'),
          }
        : field,
    ),
  );

function isOperation(value: unknown): value is (args: unknown) => unknown {
  return typeof value === 'function';
}

function getBuilder(bundle: PoolBundle, name: string): object {
  const builder: unknown = Reflect.get(bundle, name);
  if (typeof builder !== 'object' || builder === null) throw new Error(`Missing builder ${name}`);
  return builder;
}

describe('public helper transaction compatibility', () => {
  it('keeps the same upstream constructors and one canonical InterestRate', () => {
    const bundle = new PoolBundle(new OfflineProvider(), { POOL: vectors.pool });
    expect(bundle).toBeInstanceOf(PoolBundle);
    expect(bundle.poolService).toBeInstanceOf(Pool);
    expect(InterestRate).toBe(DeepInterestRate);
    const supply: Pick<LPSupplyParamsType, 'amount'> = { amount: '1' };
    const borrow: Pick<LPBorrowParamsType, 'interestRateMode'> = {
      interestRateMode: InterestRate.Variable,
    };
    expect(supply.amount).toBe('1');
    expect(borrow.interestRateMode).toBe(InterestRate.Variable);
  });

  it('retains native and lending helpers on ethers 6', () => {
    expect(typeof DustLockHelper).toBe('function');
    expect(AbiCoder.defaultAbiCoder().encode(['uint256'], [1n])).toBe(`0x${'1'.padStart(64, '0')}`);
    expect(typeof ERC20Service).toBe('function');
  });

  for (const fixture of vectors.cases) {
    it(`preserves original ${fixture.builder}.${fixture.method} calldata`, () => {
      const provider = new OfflineProvider();
      const bundle = new PoolBundle(provider, { POOL: vectors.pool });
      const target: object =
        fixture.builder === 'erc20Service'
          ? new ERC20Service(provider)
          : getBuilder(bundle, fixture.builder);
      const operation: unknown = Reflect.get(target, fixture.method);
      if (!isOperation(operation)) throw new Error(`Missing builder method ${fixture.method}`);
      // The vectors record upstream's Ethereum gas recommendation. Monad bills the full gas limit,
      // so the synchronous builders deliberately omit it and leave estimation to the sender.
      const { gasLimit: upstreamGasLimit, ...upstreamRequest } = fixture.expected;
      expect(upstreamGasLimit.type).toBe('BigNumber');
      const request = serialize(operation(fixture.args));
      expect(request).toEqual(upstreamRequest);
      expect(request).not.toHaveProperty('gasLimit');
    });
  }

  it('offers a standalone defined-value assertion outside a Jest environment', () => {
    const originalExpect = expect;
    try {
      Reflect.set(globalThis, 'expect', undefined);
      expectToBeDefined('defined');
      let error: unknown;
      try {
        expectToBeDefined(undefined);
      } catch (caught) {
        error = caught;
      }

      originalExpect(error).toBeInstanceOf(Error);
    } finally {
      Reflect.set(globalThis, 'expect', originalExpect);
    }
  });
});
