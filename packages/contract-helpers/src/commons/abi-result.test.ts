import { Interface, Result } from 'ethers';
import { materializeContractResult as materialize } from '../index';

describe('materializeContractResult public API', () => {
  const iface = new Interface([
    'function rows() view returns (tuple(uint256 amount,bool resolved,string symbol)[] rows)',
    'function nested() view returns (tuple(tuple(uint256 amount)[] rows,bool resolved) bundle)',
    'function unnamed() view returns (tuple(uint256,bool)[])',
    'function multiple() view returns (uint256,bool)',
    'function named() view returns (uint256 amount,bool resolved)',
    'function scalar() view returns (uint256)',
  ]);
  const directResult = (method: string, values: unknown[]): unknown => {
    const result = iface.decodeFunctionResult(method, iface.encodeFunctionResult(method, values));
    return iface.getFunction(method)!.outputs.length === 1 ? result[0] : result;
  };

  it.each([0, 1, 3])('copies %i tuple rows into mutable arrays and records', count => {
    const rows = Array.from({ length: count }, () => ({
      amount: 2n ** 255n + 19n,
      resolved: false,
      symbol: 'DUST',
    }));
    const native = directResult('rows', [rows]);
    expect(native).toBeInstanceOf(Result);
    const result = materialize(iface, 'rows', native);
    expect(result).toStrictEqual(rows);
    expect(Object.isFrozen(result)).toBe(false);
    expect(() => Reflect.apply(Array.prototype.push, result, [rows[0]])).not.toThrow();
  });

  it('preserves singleton nested tuple arrays and false scalars', () => {
    const expected = { rows: [{ amount: 2n ** 256n - 1n }], resolved: false };
    expect(materialize(iface, 'nested', directResult('nested', [expected]))).toStrictEqual(
      expected,
    );
  });

  it('keeps unnamed tuples and unnamed multiple outputs as plain arrays', () => {
    expect(materialize(iface, 'unnamed', directResult('unnamed', [[[9n, false]]]))).toStrictEqual([
      [9n, false],
    ]);
    expect(materialize(iface, 'multiple', directResult('multiple', [9n, false]))).toStrictEqual([
      9n,
      false,
    ]);
  });

  it('materializes named multiple outputs and leaves a single bigint unwrapped', () => {
    expect(materialize(iface, 'named', directResult('named', [9n, false]))).toStrictEqual({
      amount: 9n,
      resolved: false,
    });
    expect(materialize(iface, 'scalar', directResult('scalar', [2n ** 255n]))).toBe(2n ** 255n);
  });

  it('rejects unknown methods and malformed tuple/array shapes', () => {
    expect(() => materialize(iface, 'missing', [])).toThrow();
    expect(() => materialize(iface, 'rows', {})).toThrow();
    expect(() => materialize(iface, 'nested', [])).toThrow();
    expect(() => materialize(iface, 'multiple', {})).toThrow();
  });
});
