import { Interface } from 'ethers';
import { decodeUserEmissionBreakdown as decode, type DecodedUserEmissionBreakdown } from '../index';
import { DUST, iface, LARGE, USER } from './__tests__/fixtures';

const legacy = new Interface([
  'function getUserEmissionBreakdown(address,address) view returns (address[] assets,uint256[] amounts)',
]);
const fourField = new Interface([
  'function getUserEmissionBreakdown(address,address) view returns (tuple(address asset,uint256 amount,string symbol,bool isDebt)[] breakdown)',
]);

describe('decodeUserEmissionBreakdown public API', () => {
  it.each([0, 1, 3])('decodes %i legacy parallel rows without inventing metadata', count => {
    const assets = [DUST, USER, DUST].slice(0, count);
    const amounts = [LARGE, 2n ** 256n - 1n, 0n].slice(0, count);
    expect(
      decode(legacy.encodeFunctionResult('getUserEmissionBreakdown', [assets, amounts])),
    ).toStrictEqual({
      assets,
      amounts,
      symbols: null,
      sides: null,
      resolved: null,
      enumerationResolved: null,
    });
  });

  it.each([0, 1, 3])('decodes %i four-field rows with unavailable resolution metadata', count => {
    const rows = [
      { asset: DUST, amount: LARGE, symbol: 'DUST', isDebt: false },
      { asset: USER, amount: 2n ** 256n - 1n, symbol: '', isDebt: true },
      { asset: DUST, amount: 0n, symbol: 'é', isDebt: false },
    ].slice(0, count);
    expect(
      decode(fourField.encodeFunctionResult('getUserEmissionBreakdown', [rows])),
    ).toStrictEqual({
      assets: rows.map(row => row.asset),
      amounts: rows.map(row => row.amount),
      symbols: rows.map(row => row.symbol),
      sides: rows.map(row => row.isDebt),
      resolved: null,
      enumerationResolved: null,
    });
  });

  it.each([0, 1, 3])('decodes %i current rows and preserves false resolution flags', count => {
    const rows = [
      { asset: DUST, amount: LARGE, symbol: 'DUST', isDebt: false, resolved: false },
      { asset: USER, amount: 2n ** 256n - 1n, symbol: '', isDebt: true, resolved: true },
      { asset: DUST, amount: 0n, symbol: 'é', isDebt: false, resolved: false },
    ].slice(0, count);
    expect(
      decode(iface.encodeFunctionResult('getUserEmissionBreakdown', [rows, false])),
    ).toStrictEqual({
      assets: rows.map(row => row.asset),
      amounts: rows.map(row => row.amount),
      symbols: rows.map(row => row.symbol),
      sides: rows.map(row => row.isDebt),
      resolved: rows.map(row => row.resolved),
      enumerationResolved: false,
    });
  });

  it('distinguishes all three empty layouts and preserves explicit current resolution', () => {
    const legacyResult: DecodedUserEmissionBreakdown = decode(
      legacy.encodeFunctionResult('getUserEmissionBreakdown', [[], []]),
    );
    expect(legacyResult).toMatchObject({
      resolved: null,
      enumerationResolved: null,
    });
    expect(decode(fourField.encodeFunctionResult('getUserEmissionBreakdown', [[]]))).toMatchObject({
      symbols: [],
      resolved: null,
      enumerationResolved: null,
    });
    expect(
      decode(iface.encodeFunctionResult('getUserEmissionBreakdown', [[], true])),
    ).toMatchObject({
      resolved: [],
      enumerationResolved: true,
    });
  });

  it('normalizes prefixless and uppercase hex without changing decoded scalars', () => {
    const canonical = iface.encodeFunctionResult('getUserEmissionBreakdown', [[], false]);
    expect(decode(canonical.slice(2).toUpperCase())).toStrictEqual(decode(canonical));
    expect(decode(`0X${canonical.slice(2).toUpperCase()}`)).toStrictEqual(decode(canonical));
  });

  it('rejects legacy arrays with different lengths', () => {
    expect(() =>
      decode(legacy.encodeFunctionResult('getUserEmissionBreakdown', [[DUST], []])),
    ).toThrow();
    expect(() =>
      decode(legacy.encodeFunctionResult('getUserEmissionBreakdown', [[], [1n]])),
    ).toThrow();
  });

  const currentEmpty = iface.encodeFunctionResult('getUserEmissionBreakdown', [[], false]);
  const word = (value: bigint) => value.toString(16).padStart(64, '0');
  it.each([
    ['empty', '0x'],
    ['odd hex', '0x0'],
    ['nonhex', '0xzz'],
    ['text', 'not ABI data'],
    ['truncated', currentEmpty.slice(0, -2)],
    ['trailing byte', `${currentEmpty}00`],
    ['trailing word', `${currentEmpty}${word(0n)}`],
    ['noncanonical boolean', `0x${word(64n)}${word(2n)}${word(0n)}`],
    ['noncanonical offset gap', `0x${word(96n)}${word(0n)}${word(0n)}${word(0n)}`],
    ['misleading legacy/current shared head', `0x${word(64n)}${word(1n)}${word(0n)}${word(0n)}`],
    ['misleading old-empty current head', `0x${word(32n)}${word(1n)}${word(0n)}`],
  ])('rejects %s payloads rather than choosing a layout from head words', (_label, payload) => {
    expect(() => decode(payload)).toThrow();
  });

  it('rejects an unknown extended tuple layout', () => {
    const future = new Interface([
      'function getUserEmissionBreakdown(address,address) view returns (tuple(address asset,uint256 amount,string symbol,bool isDebt,bool resolved,uint256 extra)[] breakdown,bool enumerationResolved)',
    ]);
    const payload = future.encodeFunctionResult('getUserEmissionBreakdown', [
      [{ asset: DUST, amount: 1n, symbol: 'DUST', isDebt: false, resolved: true, extra: 1n }],
      true,
    ]);
    expect(() => decode(payload)).toThrow();
  });
});
