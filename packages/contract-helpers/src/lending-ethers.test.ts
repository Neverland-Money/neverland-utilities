import { erc20Abi, poolAbi, wethGatewayLegacyAbi } from '@neverland-money/contract-types';
import { FeeData, Interface, Signature, Wallet } from 'ethers';
import { OfflineProvider } from './__tests__/offline-provider';
import { AbiBaseService } from './commons/base-service';
import { estimateGas } from './commons/gas-station';
import { eEthereumTxType, ProtocolAction } from './commons/types';
import { reservesMock, userReservesMock } from './ui-pool-data-provider-contract/mocks';
import { ERC20_2612Service } from '.';
import {
  BaseDebtToken,
  ERC20Service,
  InterestRate,
  Pool,
  PoolBundle,
  UiPoolDataProvider,
  WalletBalanceProvider,
  WETHGatewayLegacyAdapter,
} from '.';

const TOKEN = '0x0000000000000000000000000000000000000002';

const USER = '0x0000000000000000000000000000000000000001';

describe('ethers 6 lending reads', () => {
  it('returns standard permit nonces above 2^53 as bigint', async () => {
    // No provider operation is allowed: this read is intercepted at the ABI boundary.
    const provider = new OfflineProvider();
    provider.mockContract({ nonces: async () => 9007199254740993n });
    const service = new ERC20_2612Service(provider);
    expect(await service.getNonce({ token: TOKEN, owner: USER })).toBe(9007199254740993n);
  });
});

const POOL = '0x0000000000000000000000000000000000000003';

const GATEWAY = '0x0000000000000000000000000000000000000004';

const raw = 900719925474099312345678n;

const poolInterface = new Interface(poolAbi);

const gatewayInterface = new Interface(wethGatewayLegacyAbi);

describe('exact ethers 6 raw and humanized output contracts', () => {
  it('keeps allowance units exact above 2^53 with separate raw reads', async () => {
    const provider = new OfflineProvider();
    provider.mockContract({ allowance: async () => raw, decimals: async () => 6n });
    const token = new ERC20Service(provider);
    expect(await token.allowanceRaw({ user: USER, token: TOKEN, spender: POOL })).toBe(raw);
    expect(await token.approvedAmount({ user: USER, token: TOKEN, spender: POOL })).toBe(
      '900719925474099312.345678',
    );
    await expect(
      token.isApproved({
        user: USER,
        token: TOKEN,
        spender: POOL,
        amount: '900719925474099312.345678',
      }),
    ).resolves.toBe(true);
    await expect(
      token.isApproved({
        user: USER,
        token: TOKEN,
        spender: POOL,
        amount: '900719925474099312.345679',
      }),
    ).resolves.toBe(false);
  });

  it('keeps delegation units exact above 2^53 with separate raw reads', async () => {
    const provider = new OfflineProvider();
    provider.mockContract({ borrowAllowance: async () => raw, decimals: async () => 6n });
    const debt = new BaseDebtToken(provider, new ERC20Service(provider));
    const args = { user: USER, delegatee: POOL, debtTokenAddress: TOKEN };
    expect(await debt.borrowAllowanceRaw(args)).toBe(raw);
    expect(await debt.approvedDelegationAmount(args)).toBe('900719925474099312.345678');
    await expect(
      debt.isDelegationApproved({
        debtTokenAddress: TOKEN,
        allowanceGiver: USER,
        allowanceReceiver: POOL,
        amount: (raw + 1n).toString(),
        nativeDecimals: true,
      }),
    ).resolves.toBe(false);
  });

  it('returns null for unsupported standard nonces without probing a private mapping', async () => {
    const provider = new OfflineProvider();
    const observed = provider.mockContract({
      async nonces() {
        throw new Error('unsupported');
      },
    });
    expect(
      await new ERC20_2612Service(provider).getNonce({ token: TOKEN, owner: USER }),
    ).toBeNull();
    expect(observed).toHaveBeenCalledTimes(1);
  });

  it('decodes wallet balances as bigint, including values above 2^53', async () => {
    const provider = new OfflineProvider();
    provider.mockContract({
      balanceOf: async () => raw,
      batchBalanceOf: async () => [raw],
      getUserWalletBalances: async () => [[TOKEN], [raw]],
    });
    const reader = new WalletBalanceProvider({ provider, walletBalanceProviderAddress: GATEWAY });
    expect(await reader.balanceOf(USER, TOKEN)).toBe(raw);
    expect(await reader.batchBalanceOf([USER], [TOKEN], { blockTag: 0 })).toEqual([raw]);
    expect((await reader.getUserWalletBalancesForLendingPoolProvider(USER, POOL))[1][0]).toBe(raw);
  });

  it('decodes every UI integer width as bigint and narrows bounded humanized metadata', async () => {
    const provider = new OfflineProvider();
    const reserve = {
      ...reservesMock[0][0],
      decimals: 18n,
      lastUpdateTimestamp: 1099511627775n,
      eModeCategoryId: 255n,
      eModeLtv: 65535n,
      liquidityIndex: raw,
      stableDebtLastUpdateTimestamp: 1099511627775n,
    };
    provider.mockContract({
      getReservesData: async () => [
        [reserve],
        { ...reservesMock[1], networkBaseTokenPriceDecimals: 8n },
      ],
      getUserReservesData: async () => [userReservesMock[0], 255n],
    });
    const reader = new UiPoolDataProvider({
      provider,
      uiPoolDataProviderAddress: GATEWAY,
      chainId: 143,
    });
    const decoded = await reader.getReservesData({ lendingPoolAddressProvider: POOL });
    expect(decoded[0][0].decimals).toBe(18n);
    expect(decoded[0][0].lastUpdateTimestamp).toBe(1099511627775n);
    const humanized = await reader.getReservesHumanized({ lendingPoolAddressProvider: POOL });
    expect(humanized.reservesData[0]).toMatchObject({
      decimals: 18,
      lastUpdateTimestamp: 1099511627775,
      eModeCategoryId: 255,
      eModeLtv: 65535,
      liquidityIndex: raw.toString(),
      stableDebtLastUpdateTimestamp: 1099511627775,
      virtualAccActive: false,
      virtualUnderlyingBalance: '0',
    });
    expect(
      (await reader.getUserReservesHumanized({ lendingPoolAddressProvider: POOL, user: USER }))
        .userEmodeCategoryId,
    ).toBe(255);
    reserve.stableDebtLastUpdateTimestamp = 9007199254740993n;
    await expect(reader.getReservesHumanized({ lendingPoolAddressProvider: POOL })).rejects.toThrow(
      'overflow',
    );
  });
});

describe('shared rate-mode native gateway encoding', () => {
  it.each([InterestRate.Stable, InterestRate.Variable])(
    'encodes %s in the native adapter, bundle and decimal callbacks',
    async rate => {
      const provider = new OfflineProvider();
      provider.mockContract({ borrowAllowance: async () => 2n ** 255n, decimals: async () => 18n });
      const adapter = new WETHGatewayLegacyAdapter(provider, undefined, GATEWAY);
      const mode = rate === InterestRate.Stable ? 1n : 2n;
      const borrow = adapter.encodeBorrowETH(POOL, raw.toString(), rate, '7');
      expect(gatewayInterface.decodeFunctionData('borrowETH', borrow).toArray()).toEqual([
        POOL,
        raw,
        mode,
        7n,
      ]);
      const repay = adapter.encodeRepayETH(POOL, raw.toString(), rate, USER);
      expect(gatewayInterface.decodeFunctionData('repayETH', repay).toArray()).toEqual([
        POOL,
        raw,
        mode,
        USER,
      ]);
      expect(
        (
          await adapter.borrowETH({
            lendingPool: POOL,
            user: USER,
            amount: raw.toString(),
            interestRateMode: rate,
            referralCode: '7',
          })
        ).data,
      ).toBe(borrow);
      expect(
        (
          await adapter.repayETH({
            lendingPool: POOL,
            user: USER,
            amount: raw.toString(),
            interestRateMode: rate,
          })
        ).data,
      ).toBe(repay);
      const native = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
      const bundle = new PoolBundle(provider, { POOL, WETH_GATEWAY: GATEWAY });
      expect(
        bundle.borrowTxBuilder.generateTxData({
          user: USER,
          reserve: native,
          amount: raw.toString(),
          interestRateMode: rate,
          debtTokenAddress: TOKEN,
          referralCode: '7',
        }).data,
      ).toBe(borrow);
      expect(
        bundle.repayTxBuilder.generateTxData({
          user: USER,
          reserve: native,
          amount: raw.toString(),
          interestRateMode: rate,
        }).data,
      ).toBe(repay);
      const pool = new Pool(provider, { POOL, WETH_GATEWAY: GATEWAY });
      const borrowed = await pool.borrow({
        user: USER,
        reserve: native,
        amount: '1',
        interestRateMode: rate,
        debtTokenAddress: TOKEN,
      });
      expect(
        gatewayInterface.decodeFunctionData('borrowETH', (await borrowed[0].tx()).data!).toArray(),
      ).toEqual([POOL, 10n ** 18n, mode, 0n]);
      const repaid = await pool.repay({
        user: USER,
        reserve: native,
        amount: '1',
        interestRateMode: rate,
      });
      expect(
        gatewayInterface.decodeFunctionData('repayETH', (await repaid[0].tx()).data!).toArray(),
      ).toEqual([POOL, 10n ** 18n, mode, USER]);
    },
  );
});

describe('finite decimal SignatureLike capture', () => {
  it.each(['serialized', 'compact', 'object'] as const)(
    'preserves %s signatures and snapshots before awaited decimals',
    async form => {
      const wallet = new Wallet(`0x${'55'.repeat(32)}`);
      const parsed = Signature.from(await wallet.signMessage('unfunded offline fixture'));
      const signature = { r: parsed.r, s: parsed.s, yParity: parsed.yParity };
      let release: (() => void) | undefined;
      const gate = new Promise<void>(resolve => {
        release = resolve;
      });
      const provider = new OfflineProvider();
      provider.mockContract({
        async decimals() {
          await gate;
          return 6n;
        },
      });
      const pool = new Pool(provider, { POOL });
      const args = {
        user: USER,
        reserve: TOKEN,
        amount: '1.234567',
        deadline: '1792916073',
        signature:
          form === 'object'
            ? signature
            : form === 'compact'
              ? parsed.compactSerialized
              : parsed.serialized,
      };
      const pending = pool.supplyWithPermit(args);
      signature.r = `0x${'11'.repeat(32)}`;
      args.amount = '99';
      args.deadline = '0';
      args.user = POOL;
      release?.();
      const [action] = await pending;
      const first = await action.tx();
      expect(poolInterface.decodeFunctionData('supplyWithPermit', first.data!).toArray()).toEqual([
        TOKEN,
        1234567n,
        USER,
        0n,
        1792916073n,
        BigInt(parsed.v),
        parsed.r,
        parsed.s,
      ]);
      first.data = '0x';
      expect((await action.tx()).data).not.toBe('0x');
    },
  );
});

describe('one base service with distinct supported gas policies', () => {
  it('preserves native direct estimates and lending floor-rounded percentage surplus', async () => {
    const provider = new OfflineProvider();
    provider.gasEstimate = 101n;
    const native = new AbiBaseService(provider, erc20Abi);
    const lending = new AbiBaseService(provider, erc20Abi, undefined, estimateGas);
    const args = {
      from: USER,
      rawTxMethod: async () => ({ to: TOKEN, data: '0x', chainId: 143n }),
    };
    expect((await native.generateTxCallback(args)()).gasLimit).toBe(101n);
    expect((await lending.generateTxCallback(args)()).gasLimit).toBe(131n);
    expect((await lending.generateTxCallback({ ...args, gasSurplus: 0 })()).gasLimit).toBe(101n);
    expect((await lending.generateTxCallback({ ...args, gasSurplus: 50 })()).gasLimit).toBe(151n);
    await expect(lending.generateTxCallback({ ...args, gasSurplus: -1 })()).rejects.toThrow(
      'surplus',
    );
  });
  it('keeps pending-approval suppression, force estimates, fee zero and recommendation fallback', async () => {
    const provider = new OfflineProvider();
    jest.spyOn(provider, 'getFeeData').mockResolvedValue(new FeeData(0n));
    const service = new AbiBaseService(provider, erc20Abi, undefined, estimateGas);
    const callback = jest.fn(async () => ({ gasLimit: 999n, gasPrice: 0n }));
    const gas = service.generateTxPriceEstimation(
      [{ txType: eEthereumTxType.ERC20_APPROVAL }],
      callback,
      ProtocolAction.supply,
    );
    expect(await gas()).toEqual({ gasLimit: '300000', gasPrice: '0' });
    expect(callback).not.toHaveBeenCalled();
    expect(await gas(true)).toEqual({ gasLimit: '999', gasPrice: '0' });
    jest.spyOn(provider, 'estimateGas').mockRejectedValue(new Error('approval required'));
    expect(
      (await service.estimateGasLimit({ tx: {}, action: ProtocolAction.repay })).gasLimit,
    ).toBe(300000n);
  });
});
