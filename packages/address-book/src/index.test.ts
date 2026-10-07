import { constants, utils } from 'ethers';
import * as addressBook from './index';
import { NeverlandMonadMainnet } from './index';

type Reserve = Record<string, string | number>;

// Per-reserve token addresses. INTEREST_RATE_STRATEGY is left out because reserves share them.
const RESERVE_TOKENS = [
  'UNDERLYING',
  'N_TOKEN',
  'STABLE_DEBT_TOKEN',
  'VARIABLE_DEBT_TOKEN',
  'WRAPPED_TOKEN',
];
const REQUIRED_RESERVE_FIELDS = [
  'UNDERLYING',
  'N_TOKEN',
  'VARIABLE_DEBT_TOKEN',
  'INTEREST_RATE_STRATEGY',
];

/** Every string under `value` that starts with 0x, with its path. */
const hexStrings = (value: unknown, path: string): Array<[string, string]> => {
  if (typeof value === 'string') return value.startsWith('0x') ? [[path, value]] : [];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => hexStrings(child, `${path}.${key}`));
  }
  return [];
};

const isChecksummedAddress = (value: string): boolean => {
  try {
    return utils.getAddress(value) === value;
  } catch {
    return false;
  }
};

const markets: Array<[string, Record<string, Reserve>]> = [
  ['ASSETS', NeverlandMonadMainnet.ASSETS],
  ...Object.entries(NeverlandMonadMainnet.ISOLATED_MARKETS).map(
    ([name, market]): [string, Record<string, Reserve>] => [
      `ISOLATED_MARKETS.${name}.ASSETS`,
      market.ASSETS,
    ],
  ),
];

describe('address-book exports', () => {
  it.each(Object.entries(addressBook))(
    '%s is a deployment namespace with a CHAIN_ID',
    (_name, deployment) => {
      expect(deployment).toEqual(expect.objectContaining({ CHAIN_ID: expect.any(Number) }));
    },
  );
});

describe('NeverlandMonadMainnet', () => {
  it('targets Monad mainnet', () => {
    expect(NeverlandMonadMainnet.CHAIN_ID).toBe(143);
  });

  it('holds only checksummed, nonzero addresses', () => {
    const entries = hexStrings(NeverlandMonadMainnet, 'NeverlandMonadMainnet');
    expect(entries.length).toBeGreaterThan(0);
    const invalid = entries
      .filter(([, value]) => !isChecksummedAddress(value) || value === constants.AddressZero)
      .map(([path, value]) => `${path} = ${value}`);
    expect(invalid).toEqual([]);
  });

  it('lists every main-market rate strategy in RATE_STRATEGIES', () => {
    const listed = new Set<string>(Object.values(NeverlandMonadMainnet.RATE_STRATEGIES));
    const unlisted = Object.entries(NeverlandMonadMainnet.ASSETS)
      .filter(([, reserve]) => !listed.has(reserve.INTEREST_RATE_STRATEGY))
      .map(([symbol]) => symbol);
    expect(unlisted).toEqual([]);
  });

  it('gives each market its own pool and pool address provider', () => {
    const isolated = Object.values(NeverlandMonadMainnet.ISOLATED_MARKETS);
    const providerIds = isolated.map(market => market.PROVIDER_ID);
    const pools = [NeverlandMonadMainnet.LENDING_POOL, ...isolated.map(m => m.LENDING_POOL)];
    const providers = [
      NeverlandMonadMainnet.LENDING_POOL_ADDRESS_PROVIDER,
      ...isolated.map(m => m.LENDING_POOL_ADDRESS_PROVIDER),
    ];
    expect(new Set(providerIds).size).toBe(providerIds.length);
    expect(new Set(pools).size).toBe(pools.length);
    expect(new Set(providers).size).toBe(providers.length);
  });
});

describe.each(markets)('%s', (_label, assets) => {
  const reserves = Object.entries(assets);

  it('keys reserves by upper-cased symbol', () => {
    expect(reserves.length).toBeGreaterThan(0);
    expect(reserves.map(([symbol]) => symbol).filter(s => !/^[A-Z0-9_]+$/.test(s))).toEqual([]);
  });

  it('numbers reserves contiguously from 0', () => {
    const ids = reserves.map(([, reserve]) => Number(reserve.id)).sort((a, b) => a - b);
    expect(ids).toEqual(reserves.map((_, index) => index));
  });

  it('gives every reserve integer decimals and its token and strategy addresses', () => {
    const incomplete = reserves
      .filter(
        ([, reserve]) =>
          !Number.isInteger(reserve.decimals) ||
          REQUIRED_RESERVE_FIELDS.some(field => typeof reserve[field] !== 'string'),
      )
      .map(([symbol]) => symbol);
    expect(incomplete).toEqual([]);
  });

  it.each(RESERVE_TOKENS)('never gives two reserves the same %s', field => {
    const values = reserves.map(([, reserve]) => reserve[field]).filter(v => v !== undefined);
    expect(values.filter((value, index) => values.indexOf(value) !== index)).toEqual([]);
  });
});
