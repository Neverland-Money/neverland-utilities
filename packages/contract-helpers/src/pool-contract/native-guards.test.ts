import { poolAbi, wethGatewayLegacyAbi } from '@neverland-money/contract-types';
import { getAddress, getIcapAddress, Interface, isAddress, MaxUint256, ZeroAddress } from 'ethers';
import { OfflineProvider } from '../__tests__/offline-provider';
import { InterestRate } from '../commons/types';
import { API_ETH_MOCK_ADDRESS } from '../commons/utils';
import { ERC20Service } from '../erc20-contract';
import { WETHGatewayLegacyAdapter } from '../weth-gateway-legacy-contract';
import { WETHGatewayService } from '../wrapped-native-gateway-contract';
import { Pool } from './pool';
import { PoolBundle } from './pool-bundle';

const POOL = '0x0000000000000000000000000000000000000001';
// Hex letters make case and checksum handling observable.
const GATEWAY = getAddress('0x800409dbd7157813bb76501c30e04596cc478f25');
const USER = '0x0000000000000000000000000000000000000003';
const RESERVE = '0x0000000000000000000000000000000000000004';
const A_TOKEN = '0x0000000000000000000000000000000000000005';
const DEBT_TOKEN = '0x0000000000000000000000000000000000000006';
const SIGNATURE =
  '0x532f8df4e2502bd869fb35e9301156f9b307380afdcc25cfbc87b2e939f16f7e47c326dc26eb918d327358797ee67ad7415d871ef7eaf0d4f6352d3ad021fbb41c';
const BAD_CHECKSUM = GATEWAY.replace('dB', 'DB');

const gatewayInterface = new Interface(wethGatewayLegacyAbi);
const poolInterface = new Interface(poolAbi);

/** Every spelling ethers accepts for address(0); there are no hex letters to vary in case. */
const ZERO_SPELLINGS = [
  ['0x-prefixed', ZeroAddress],
  ['unprefixed', ZeroAddress.slice(2)],
  ['ICAP', getIcapAddress(ZeroAddress)],
] as const;

const SENTINEL_SPELLINGS = [
  ['checksummed', API_ETH_MOCK_ADDRESS],
  ['lowercase', API_ETH_MOCK_ADDRESS.toLowerCase()],
  ['uppercase', `0x${API_ETH_MOCK_ADDRESS.slice(2).toUpperCase()}`],
  ['unprefixed', API_ETH_MOCK_ADDRESS.slice(2).toLowerCase()],
  ['ICAP', getIcapAddress(API_ETH_MOCK_ADDRESS)],
] as const;

/** Gateways that are not addresses: decorated methods return [], everything else throws. */
const UNUSABLE_GATEWAYS = [
  ['unset', undefined],
  ['empty', ''],
  ['whitespace-only', '   '],
  ['space-padded', ` ${GATEWAY}`],
  ['newline-terminated', `${GATEWAY}\n`],
  ['short zero', '0x0'],
  ['bad-checksum', BAD_CHECKSUM],
  ['non-hex', 'not-an-address'],
] as const;

function decodedArgs(iface: Interface, data: string | null | undefined): unknown[] {
  const parsed = iface.parseTransaction({ data: data ?? '0x' });
  if (!parsed) throw new Error('Undecodable calldata');
  return parsed.args.toArray();
}

function lending(gateway: string | undefined) {
  const provider = new OfflineProvider();
  return {
    provider,
    service: new WETHGatewayService(provider, new ERC20Service(provider), gateway),
    pool: new Pool(provider, { POOL, WETH_GATEWAY: gateway }),
    bundle: new PoolBundle(provider, { POOL, WETH_GATEWAY: gateway }),
    adapter: new WETHGatewayLegacyAdapter(provider, undefined, gateway ?? ''),
  };
}

const deposit = { lendingPool: POOL, user: USER, amount: '1' };
const repay = { ...deposit, interestRateMode: InterestRate.Variable };
const withdraw = { ...deposit, aTokenAddress: A_TOKEN };
const borrow = { ...repay, debtTokenAddress: DEBT_TOKEN };
const nativeRequest = { user: USER, reserve: API_ETH_MOCK_ADDRESS, amount: '1' };
const nativeBorrow = { ...nativeRequest, ...borrow };

describe('native gateway destination', () => {
  it('uses fixtures that ethers classifies as intended', () => {
    for (const [, value] of [...ZERO_SPELLINGS, ...SENTINEL_SPELLINGS]) {
      expect(isAddress(value)).toBe(true);
    }

    for (const [, value] of UNUSABLE_GATEWAYS) expect(isAddress(value)).toBe(false);
    expect(GATEWAY).not.toBe(GATEWAY.toLowerCase());
  });

  describe.each(ZERO_SPELLINGS)('zero gateway (%s)', (_spelling, gateway) => {
    it('throws from every decorated native method instead of returning a transaction', async () => {
      const { service, pool } = lending(gateway);
      const message = 'WETH_GATEWAY must not be the zero address';
      expect(() => service.depositETH(deposit)).toThrow(message);
      expect(() => service.repayETH(repay)).toThrow(message);
      await expect(async () => service.withdrawETH(withdraw)).rejects.toThrow(message);
      await expect(async () => service.borrowETH(borrow)).rejects.toThrow(message);
      await expect(async () => pool.supply(nativeRequest)).rejects.toThrow(message);
      await expect(async () => pool.deposit(nativeRequest)).rejects.toThrow(message);
      await expect(async () => pool.borrow(nativeBorrow)).rejects.toThrow(message);
      await expect(async () => pool.repay(nativeBorrow)).rejects.toThrow(message);
      await expect(async () =>
        pool.withdraw({ ...nativeRequest, aTokenAddress: A_TOKEN }),
      ).rejects.toThrow(message);
    });

    it('throws from every synchronous builder, native bundle builder and adapter method', async () => {
      const { service, bundle, adapter } = lending(gateway);
      const message = 'WETH_GATEWAY must be a nonzero Ethereum address';
      expect(() => service.generateDepositEthTxData(deposit)).toThrow(message);
      expect(() => service.generateBorrowEthTxData(borrow)).toThrow(message);
      expect(() => service.generateRepayEthTxData(repay)).toThrow(message);
      expect(() => bundle.supplyTxBuilder.generateTxData(nativeRequest)).toThrow(message);
      expect(() => bundle.borrowTxBuilder.generateTxData(nativeBorrow)).toThrow(message);
      expect(() => bundle.repayTxBuilder.generateTxData(nativeBorrow)).toThrow(message);
      await expect(adapter.depositETH(deposit)).rejects.toThrow(message);
      await expect(adapter.borrowETH(borrow)).rejects.toThrow(message);
      await expect(adapter.repayETH(repay)).rejects.toThrow(message);
      await expect(adapter.withdrawETH(withdraw)).rejects.toThrow(message);
    });
  });

  describe.each(UNUSABLE_GATEWAYS)('unusable gateway (%s)', (_spelling, gateway) => {
    it('keeps the upstream empty result and diagnostic from decorated native methods', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const { service, pool } = lending(gateway);
      expect(service.depositETH(deposit)).toEqual([]);
      expect(service.repayETH(repay)).toEqual([]);
      expect(await service.withdrawETH(withdraw)).toEqual([]);
      expect(await service.borrowETH(borrow)).toEqual([]);
      expect(await pool.supply(nativeRequest)).toEqual([]);
      expect(error).toHaveBeenCalledWith('[WethGatewayValidator] You need to pass valid addresses');
    });

    it('throws from every synchronous builder, native bundle builder and adapter method', async () => {
      const { service, bundle, adapter } = lending(gateway);
      const message = 'WETH_GATEWAY must be a nonzero Ethereum address';
      expect(() => service.generateDepositEthTxData(deposit)).toThrow(message);
      expect(() => service.generateBorrowEthTxData(borrow)).toThrow(message);
      expect(() => service.generateRepayEthTxData(repay)).toThrow(message);
      expect(() => bundle.supplyTxBuilder.generateTxData(nativeRequest)).toThrow(message);
      expect(() => bundle.borrowTxBuilder.generateTxData(nativeBorrow)).toThrow(message);
      expect(() => bundle.repayTxBuilder.generateTxData(nativeBorrow)).toThrow(message);
      await expect(adapter.depositETH(deposit)).rejects.toThrow(message);
      await expect(adapter.borrowETH(borrow)).rejects.toThrow(message);
      await expect(adapter.repayETH(repay)).rejects.toThrow(message);
      await expect(adapter.withdrawETH(withdraw)).rejects.toThrow(message);
    });
  });

  it.each([
    ['checksummed', GATEWAY],
    ['lowercase', GATEWAY.toLowerCase()],
    ['unprefixed', GATEWAY.slice(2)],
    ['ICAP', getIcapAddress(GATEWAY)],
  ])(
    'populates adapter requests to the checksummed gateway given its %s spelling',
    async (_spelling, gateway) => {
      const adapter = new WETHGatewayLegacyAdapter(new OfflineProvider(), undefined, gateway);
      const tx = await adapter.depositETH(deposit);
      expect(tx.to).toBe(GATEWAY);
      expect(tx.value).toBe(1n);
      expect(decodedArgs(gatewayInterface, tx.data)).toEqual([POOL, USER, 0n]);
    },
  );

  it.each([
    ['lowercase', GATEWAY.toLowerCase()],
    ['unprefixed', GATEWAY.slice(2)],
    ['ICAP', getIcapAddress(GATEWAY)],
  ])(
    'populates service requests and allowance reads to the checksummed gateway given its %s spelling',
    async (_spelling, gateway) => {
      const { provider, service } = lending(gateway);
      const resolveName = jest.spyOn(provider, 'resolveName');
      const reads = provider.mockContract({
        allowance: async () => MaxUint256,
        borrowAllowance: async () => MaxUint256,
        decimals: async () => 18n,
      });
      expect(service.generateDepositEthTxData(deposit).to).toBe(GATEWAY);
      expect(service.generateBorrowEthTxData(borrow).to).toBe(GATEWAY);
      expect(service.generateRepayEthTxData(repay).to).toBe(GATEWAY);
      const actions = [
        ...service.depositETH(deposit),
        ...(await service.borrowETH(borrow)),
        ...(await service.withdrawETH(withdraw)),
        ...service.repayETH(repay),
      ];
      // Both allowances read as unlimited, so each method returns only its gateway action.
      expect(actions).toHaveLength(4);
      const populated = await Promise.all(actions.map(async ({ tx }) => tx()));
      for (const request of populated) expect(request.to).toBe(GATEWAY);
      expect(reads).toHaveBeenCalledWith(USER, GATEWAY);
      expect(resolveName).not.toHaveBeenCalled();
    },
  );
});

describe('native sentinel gateway', () => {
  const message = `WETH_GATEWAY must not be the native sentinel ${API_ETH_MOCK_ADDRESS}`;
  const SENTINEL_GATEWAYS = [
    ['checksummed', API_ETH_MOCK_ADDRESS],
    ['lowercase', API_ETH_MOCK_ADDRESS.toLowerCase()],
  ] as const;

  describe.each(SENTINEL_GATEWAYS)('gateway (%s)', (_spelling, gateway) => {
    it('throws from decorated native methods and native Pool.supply', async () => {
      const { service, pool } = lending(gateway);
      expect(() => service.depositETH(deposit)).toThrow(message);
      expect(() => service.repayETH(repay)).toThrow(message);
      await expect(async () => service.withdrawETH(withdraw)).rejects.toThrow(message);
      await expect(async () => service.borrowETH(borrow)).rejects.toThrow(message);
      await expect(async () => pool.supply(nativeRequest)).rejects.toThrow(message);
    });

    it('throws from every synchronous builder, native bundle supply and adapter method', async () => {
      const { service, bundle, adapter } = lending(gateway);
      expect(() => service.generateDepositEthTxData(deposit)).toThrow(message);
      expect(() => service.generateBorrowEthTxData(borrow)).toThrow(message);
      expect(() => service.generateRepayEthTxData(repay)).toThrow(message);
      expect(() => bundle.supplyTxBuilder.generateTxData(nativeRequest)).toThrow(message);
      await expect(adapter.depositETH(deposit)).rejects.toThrow(message);
      await expect(adapter.borrowETH(borrow)).rejects.toThrow(message);
      await expect(adapter.repayETH(repay)).rejects.toThrow(message);
      await expect(adapter.withdrawETH(withdraw)).rejects.toThrow(message);
    });
  });
});

describe('adapter contract accessor and getWETHAddress', () => {
  const UNUSABLE: ReadonlyArray<readonly [string, string | undefined]> = [
    ['unset', undefined],
    ['empty', ''],
    ['short zero', '0x0'],
    ['space-padded', ` ${GATEWAY}`],
    ...ZERO_SPELLINGS,
    ['native sentinel', API_ETH_MOCK_ADDRESS],
    ['lowercase native sentinel', API_ETH_MOCK_ADDRESS.toLowerCase()],
  ];

  function adapterFor(gateway: string | undefined, provider = new OfflineProvider()) {
    // An unset gateway reaches the constructor from untyped JavaScript callers.
    return new WETHGatewayLegacyAdapter(provider, undefined, gateway!);
  }

  it.each(UNUSABLE)('throws from contract for a gateway that is %s', (_spelling, gateway) => {
    const adapter = adapterFor(gateway);
    expect(() => adapter.contract).toThrow(TypeError);
    expect(() => adapter.contract).toThrow(/^WETH_GATEWAY must/);
  });

  it.each(UNUSABLE)(
    'rejects getWETHAddress for a gateway that is %s without ENS',
    async (_s, gateway) => {
      const provider = new OfflineProvider();
      const resolveName = jest.spyOn(provider, 'resolveName');
      const call = jest.spyOn(provider, 'call');
      await expect(adapterFor(gateway, provider).getWETHAddress()).rejects.toThrow(
        /^WETH_GATEWAY must/,
      );
      expect(resolveName).not.toHaveBeenCalled();
      expect(call).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['0x-lowercase', GATEWAY.toLowerCase()],
    ['unprefixed', GATEWAY.slice(2)],
    ['ICAP', getIcapAddress(GATEWAY)],
  ])('targets the checksummed address for a valid %s gateway', async (_spelling, gateway) => {
    const provider = new OfflineProvider();
    const resolveName = jest.spyOn(provider, 'resolveName');
    const adapter = adapterFor(gateway, provider);
    expect(adapter.contract.target).toBe(GATEWAY);
    expect(adapter.contract).toBe(adapter.contract);
    const call = jest
      .spyOn(provider, 'call')
      .mockResolvedValue(adapter.contractInterface.encodeFunctionResult('getWETHAddress', [USER]));
    expect(await adapter.getWETHAddress()).toBe(USER);
    expect(call).toHaveBeenCalledWith(expect.objectContaining({ to: GATEWAY }));
    expect(resolveName).not.toHaveBeenCalled();
  });
});

describe('construction with an unusable gateway', () => {
  it.each<readonly [string, string | undefined]>([
    ...UNUSABLE_GATEWAYS,
    ...ZERO_SPELLINGS,
    ...SENTINEL_SPELLINGS,
    ['unprefixed nonzero', GATEWAY.slice(2)],
    ['ICAP nonzero', getIcapAddress(GATEWAY)],
  ])('never starts an ENS lookup for a gateway that is %s', (_spelling, gateway) => {
    const provider = new OfflineProvider();
    const pending = new Promise<string | null>(() => {
      // A real lookup would surface as an unhandled rejection; this one never settles.
    });
    const resolveName = jest.spyOn(provider, 'resolveName').mockReturnValue(pending);
    const built = [
      new Pool(provider, { POOL, WETH_GATEWAY: gateway }),
      new PoolBundle(provider, { POOL, WETH_GATEWAY: gateway }),
      new WETHGatewayService(provider, new ERC20Service(provider), gateway),
      new WETHGatewayLegacyAdapter(provider, undefined, gateway ?? ''),
    ];
    expect(built).toHaveLength(4);
    expect(resolveName).not.toHaveBeenCalled();
  });

  it('keeps the documented gateway-free Pool working for ERC20 flows', async () => {
    const provider = new OfflineProvider();
    const pool = new Pool(provider, { POOL });
    jest.spyOn(pool.erc20Service, 'decimalsOf').mockResolvedValue(6);
    jest.spyOn(pool.erc20Service, 'isApproved').mockResolvedValue(true);
    const [action] = await pool.supply({ user: USER, reserve: RESERVE, amount: '1.5' });
    const tx = await action.tx();
    expect(tx.to).toBe(POOL);
    expect(decodedArgs(poolInterface, tx.data)).toEqual([RESERVE, 1_500_000n, USER, 0n]);
    const bundle = new PoolBundle(provider, { POOL });
    expect(
      bundle.supplyTxBuilder.generateTxData({ user: USER, reserve: RESERVE, amount: '1' }).to,
    ).toBe(POOL);
  });
});

describe.each([
  ...ZERO_SPELLINGS.map(
    ([spelling, value]) => [`${spelling} zero`, value, 'zero address'] as const,
  ),
  ...SENTINEL_SPELLINGS.map(
    ([spelling, value]) => [`${spelling} native sentinel`, value, 'native sentinel'] as const,
  ),
])('beneficiary (%s)', (_spelling, onBehalfOf, reason) => {
  const message = `must not be the ${reason}`;

  it.each([
    ['ERC20', RESERVE],
    ['native', API_ETH_MOCK_ADDRESS],
  ])('is rejected by decorated %s supply, deposit, withdraw and repay', async (_kind, reserve) => {
    const { pool } = lending(GATEWAY);
    const request = { user: USER, reserve, amount: '1', onBehalfOf };
    await expect(async () => pool.supply(request)).rejects.toThrow(message);
    await expect(async () => pool.deposit(request)).rejects.toThrow(message);
    await expect(async () => pool.withdraw({ ...request, aTokenAddress: A_TOKEN })).rejects.toThrow(
      message,
    );
    await expect(async () =>
      pool.repay({ ...request, interestRateMode: InterestRate.Variable }),
    ).rejects.toThrow(message);
  });

  it('is rejected by decorated permit methods and native gateway methods', async () => {
    const { service, pool } = lending(GATEWAY);
    const permit = { user: USER, reserve: RESERVE, amount: '1', onBehalfOf, signature: SIGNATURE };
    await expect(async () => pool.supplyWithPermit({ ...permit, deadline: '1' })).rejects.toThrow(
      message,
    );
    await expect(async () =>
      pool.repayWithPermit({ ...permit, deadline: '1', interestRateMode: InterestRate.Variable }),
    ).rejects.toThrow(message);
    expect(() => service.depositETH({ ...deposit, onBehalfOf })).toThrow(message);
    expect(() => service.repayETH({ ...repay, onBehalfOf })).toThrow(message);
    await expect(async () => service.withdrawETH({ ...withdraw, onBehalfOf })).rejects.toThrow(
      message,
    );
  });

  it('is rejected by PoolBundle, the synchronous gateway builders and the adapter', async () => {
    const { service, bundle, adapter } = lending(GATEWAY);
    for (const reserve of [RESERVE, API_ETH_MOCK_ADDRESS]) {
      const request = { user: USER, reserve, amount: '1', onBehalfOf };
      expect(() => bundle.supplyTxBuilder.generateTxData(request)).toThrow(message);
      expect(() =>
        bundle.repayTxBuilder.generateTxData({
          ...request,
          interestRateMode: InterestRate.Variable,
        }),
      ).toThrow(message);
    }

    const signed = { user: USER, reserve: RESERVE, amount: '1', onBehalfOf, signature: SIGNATURE };
    expect(() => bundle.supplyTxBuilder.generateSignedTxData({ ...signed, deadline: '1' })).toThrow(
      message,
    );
    expect(() =>
      bundle.repayTxBuilder.generateSignedTxData({
        ...signed,
        deadline: '1',
        interestRateMode: InterestRate.Variable,
      }),
    ).toThrow(message);
    expect(() => service.generateDepositEthTxData({ ...deposit, onBehalfOf })).toThrow(message);
    expect(() => service.generateRepayEthTxData({ ...repay, onBehalfOf })).toThrow(message);
    await expect(adapter.depositETH({ ...deposit, onBehalfOf })).rejects.toThrow(message);
    await expect(adapter.repayETH({ ...repay, onBehalfOf })).rejects.toThrow(message);
    await expect(adapter.withdrawETH({ ...withdraw, onBehalfOf })).rejects.toThrow(message);
  });

  it('is rejected as the account an ERC20 borrow debits', async () => {
    const { pool, bundle } = lending(GATEWAY);
    const request = {
      user: USER,
      reserve: RESERVE,
      amount: '1',
      interestRateMode: InterestRate.Variable,
      onBehalfOf,
    };
    await expect(async () => pool.borrow(request)).rejects.toThrow(message);
    expect(() => bundle.borrowTxBuilder.generateTxData(request)).toThrow(message);
  });
});

describe('beneficiary guards leave reserves and absent beneficiaries alone', () => {
  it.each([
    ['checksummed', API_ETH_MOCK_ADDRESS],
    ['lowercase', API_ETH_MOCK_ADDRESS.toLowerCase()],
  ])('keeps routing a %s native reserve to a nonzero beneficiary', async (_spelling, reserve) => {
    const { pool, bundle } = lending(GATEWAY);
    const request = { user: USER, reserve, amount: '1', onBehalfOf: RESERVE };
    const [supplied] = await pool.supply(request);
    const supplyTx = await supplied.tx();
    expect(supplyTx.to).toBe(GATEWAY);
    expect(decodedArgs(gatewayInterface, supplyTx.data)).toEqual([POOL, RESERVE, 0n]);
    const bundled = bundle.supplyTxBuilder.generateTxData(request);
    expect(bundled.to).toBe(GATEWAY);
    expect(decodedArgs(gatewayInterface, bundled.data)).toEqual([POOL, RESERVE, 0n]);
  });

  it('keeps accepting the sentinel in token and positional address parameters', async () => {
    const { service } = lending(GATEWAY);
    await expect(
      service.erc20Service.isApproved({
        user: USER,
        token: API_ETH_MOCK_ADDRESS,
        spender: GATEWAY,
        amount: '1',
      }),
    ).resolves.toBe(true);
    await expect(service.erc20Service.decimalsOf(API_ETH_MOCK_ADDRESS)).resolves.toBe(18);
  });

  it('pays a native withdrawal to a nonzero recipient', async () => {
    const { pool } = lending(GATEWAY);
    jest.spyOn(pool.erc20Service, 'isApproved').mockResolvedValue(true);
    const [action] = await pool.withdraw({
      ...nativeRequest,
      onBehalfOf: RESERVE,
      aTokenAddress: A_TOKEN,
    });
    const tx = await action.tx();
    expect(tx.to).toBe(GATEWAY);
    expect(decodedArgs(gatewayInterface, tx.data)).toEqual([POOL, 10n ** 18n, RESERVE]);
  });

  it('keeps treating an empty native-borrow beneficiary as absent', async () => {
    const { provider, pool } = lending(GATEWAY);
    provider.mockContract({ borrowAllowance: async () => MaxUint256, decimals: async () => 18n });
    const [action] = await pool.borrow({ ...nativeBorrow, onBehalfOf: '' });
    const tx = await action.tx();
    expect(tx.to).toBe(GATEWAY);
    expect(decodedArgs(gatewayInterface, tx.data)).toEqual([POOL, 10n ** 18n, 2n, 0n]);
  });
});

describe('native borrow beneficiary rule', () => {
  // A checksummed address with hex letters differs from its lowercase spelling.
  const LETTER_USER = getAddress(`0x${'abcdef0123'.repeat(4)}`);

  it.each([
    ['checksummed user, lowercase beneficiary', LETTER_USER, LETTER_USER.toLowerCase()],
    ['lowercase user, checksummed beneficiary', LETTER_USER.toLowerCase(), LETTER_USER],
  ])('accepts the same account in any case: %s', async (_case, user, onBehalfOf) => {
    expect(user).not.toBe(onBehalfOf);
    const { provider, pool, bundle } = lending(GATEWAY);
    provider.mockContract({ borrowAllowance: async () => MaxUint256, decimals: async () => 18n });
    const request = { ...nativeBorrow, user, onBehalfOf };
    const [action] = await pool.borrow(request);
    const tx = await action.tx();
    expect(tx.to).toBe(GATEWAY);
    expect(decodedArgs(gatewayInterface, tx.data)).toEqual([POOL, 10n ** 18n, 2n, 0n]);
    const bundled = bundle.borrowTxBuilder.generateTxData(request);
    expect(bundled.to).toBe(GATEWAY);
    expect(decodedArgs(gatewayInterface, bundled.data)).toEqual([POOL, 1n, 2n, 0n]);
    await expect(pool.borrow({ ...request, onBehalfOf: RESERVE })).rejects.toThrow(
      'Native borrow requires onBehalfOf to equal user',
    );
    expect(() =>
      bundle.borrowTxBuilder.generateTxData({ ...request, onBehalfOf: RESERVE }),
    ).toThrow('Native borrow requires onBehalfOf to equal user');
  });
});
