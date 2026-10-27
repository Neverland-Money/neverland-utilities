import {
  erc20Abi,
  poolAbi,
  variableDebtTokenAbi,
  wethGatewayLegacyAbi,
} from '@neverland-money/contract-types';
import { Interface, MaxUint256, ZeroAddress } from 'ethers';
import { OfflineProvider } from '../__tests__/offline-provider';
import { estimateGasByNetwork } from '../commons/gas-station';
import { InterestRate, ProtocolAction } from '../commons/types';
import {
  API_ETH_MOCK_ADDRESS,
  DEFAULT_APPROVE_AMOUNT,
  gasLimitRecommendations,
} from '../commons/utils';
import { ERC20Service } from '../erc20-contract';
import { WETHGatewayService } from '../wrapped-native-gateway-contract';
import { Pool } from './pool';
import { PoolBundle } from './pool-bundle';

jest.mock('../commons/gas-station', () => ({
  __esModule: true,
  estimateGasByNetwork: jest.fn(async () => Promise.resolve(1n)),
  estimateGas: jest.fn(async () => Promise.resolve(1n)),
}));

const POOL = '0x0000000000000000000000000000000000000001';
const GATEWAY = '0x0000000000000000000000000000000000000002';
const USER = '0x0000000000000000000000000000000000000003';
const RESERVE = '0x0000000000000000000000000000000000000004';
const A_TOKEN = '0x0000000000000000000000000000000000000005';
const DEBT_TOKEN = '0x0000000000000000000000000000000000000006';
const ONE_ETHER = 10n ** 18n;

const poolInterface = new Interface(poolAbi);
const tokenInterface = new Interface(erc20Abi);
const debtTokenInterface = new Interface(variableDebtTokenAbi);
const gatewayInterface = new Interface(wethGatewayLegacyAbi);

function decodedArgs(iface: Interface, data: string | null | undefined): unknown[] {
  const parsed = iface.parseTransaction({ data: data ?? '0x' });
  if (!parsed) throw new Error('Undecodable calldata');
  return parsed.args.toArray();
}

function gateway(): WETHGatewayService {
  const provider = new OfflineProvider();
  return new WETHGatewayService(provider, new ERC20Service(provider), GATEWAY);
}

/** Pins the fields where a regression would send funds or allowances to the wrong place. */
describe('lending fund routing', () => {
  describe.each(['supply', 'deposit'] as const)('Pool.%s', method => {
    it('checks the allowance in human units and approves the pool', async () => {
      const pool = new Pool(new OfflineProvider(), { POOL, WETH_GATEWAY: GATEWAY });
      jest.spyOn(pool.erc20Service, 'decimalsOf').mockResolvedValue(6);
      const isApproved = jest.spyOn(pool.erc20Service, 'isApproved').mockResolvedValue(false);
      const approve = jest.spyOn(pool.erc20Service, 'approve');

      const [approval, action] = await pool[method]({
        user: USER,
        reserve: RESERVE,
        amount: '1.5',
      });

      expect(isApproved).toHaveBeenCalledWith({
        token: RESERVE,
        user: USER,
        spender: POOL,
        amount: '1.5',
      });
      expect(approve).toHaveBeenCalledWith({
        user: USER,
        token: RESERVE,
        spender: POOL,
        amount: DEFAULT_APPROVE_AMOUNT,
      });
      const approvalTx = await approval.tx();
      expect(approvalTx.to).toBe(RESERVE);
      expect(decodedArgs(tokenInterface, approvalTx.data)).toEqual([POOL, MaxUint256]);
      const actionTx = await action.tx();
      expect(actionTx.to).toBe(POOL);
      expect(decodedArgs(poolInterface, actionTx.data)).toEqual([RESERVE, 1_500_000n, USER, 0n]);
    });
  });

  it('Pool.repay checks the allowance in human units and approves the pool', async () => {
    const pool = new Pool(new OfflineProvider(), { POOL, WETH_GATEWAY: GATEWAY });
    jest.spyOn(pool.erc20Service, 'decimalsOf').mockResolvedValue(6);
    const isApproved = jest.spyOn(pool.erc20Service, 'isApproved').mockResolvedValue(false);
    const approve = jest.spyOn(pool.erc20Service, 'approve');

    const [, action] = await pool.repay({
      user: USER,
      reserve: RESERVE,
      amount: '2',
      interestRateMode: InterestRate.Variable,
    });

    expect(isApproved).toHaveBeenCalledWith({
      token: RESERVE,
      user: USER,
      spender: POOL,
      amount: '2',
    });
    expect(approve).toHaveBeenCalledWith({
      user: USER,
      token: RESERVE,
      spender: POOL,
      amount: DEFAULT_APPROVE_AMOUNT,
    });
    const actionTx = await action.tx();
    expect(actionTx.to).toBe(POOL);
    expect(decodedArgs(poolInterface, actionTx.data)).toEqual([RESERVE, 2_000_000n, 2n, USER]);
  });

  it('depositETH sends the converted amount as msg.value to the gateway', async () => {
    const [deposit] = gateway().depositETH({ lendingPool: POOL, user: USER, amount: '1.5' });
    const tx = await deposit.tx();
    expect(tx.to).toBe(GATEWAY);
    expect(BigInt(tx.value ?? 0)).toBe((ONE_ETHER * 3n) / 2n);
    expect(decodedArgs(gatewayInterface, tx.data)).toEqual([POOL, USER, 0n]);
  });

  it('repayETH sends the converted amount as msg.value to the gateway', async () => {
    const [repay] = gateway().repayETH({
      lendingPool: POOL,
      user: USER,
      amount: '2',
      interestRateMode: InterestRate.Variable,
    });
    const tx = await repay.tx();
    expect(tx.to).toBe(GATEWAY);
    expect(BigInt(tx.value ?? 0)).toBe(2n * ONE_ETHER);
    expect(decodedArgs(gatewayInterface, tx.data)).toEqual([POOL, 2n * ONE_ETHER, 2n, USER]);
  });

  it('withdrawETH checks and approves the aToken allowance for the gateway', async () => {
    const weth = gateway();
    const isApproved = jest.spyOn(weth.erc20Service, 'isApproved').mockResolvedValue(false);
    const approve = jest.spyOn(weth.erc20Service, 'approve');

    const [approval, action] = await weth.withdrawETH({
      lendingPool: POOL,
      user: USER,
      amount: '1',
      aTokenAddress: A_TOKEN,
    });

    expect(isApproved).toHaveBeenCalledWith({
      token: A_TOKEN,
      user: USER,
      spender: GATEWAY,
      amount: '1',
    });
    expect(approve).toHaveBeenCalledWith({
      user: USER,
      token: A_TOKEN,
      spender: GATEWAY,
      amount: MaxUint256.toString(),
    });
    const approvalTx = await approval.tx();
    expect(approvalTx.to).toBe(A_TOKEN);
    expect(decodedArgs(tokenInterface, approvalTx.data)).toEqual([GATEWAY, MaxUint256]);
    const actionTx = await action.tx();
    expect(actionTx.to).toBe(GATEWAY);
    expect(BigInt(actionTx.value ?? 0)).toBe(0n);
    expect(decodedArgs(gatewayInterface, actionTx.data)).toEqual([POOL, ONE_ETHER, USER]);
  });

  it('borrowETH delegates credit to the gateway and sends no value', async () => {
    const weth = gateway();
    const isDelegationApproved = jest
      .spyOn(weth.baseDebtTokenService, 'isDelegationApproved')
      .mockResolvedValue(false);
    const approveDelegation = jest.spyOn(weth.baseDebtTokenService, 'approveDelegation');

    const [delegation, action] = await weth.borrowETH({
      lendingPool: POOL,
      user: USER,
      amount: '1',
      debtTokenAddress: DEBT_TOKEN,
      interestRateMode: InterestRate.Variable,
    });

    expect(isDelegationApproved).toHaveBeenCalledWith({
      debtTokenAddress: DEBT_TOKEN,
      allowanceGiver: USER,
      allowanceReceiver: GATEWAY,
      amount: '1',
    });
    expect(approveDelegation).toHaveBeenCalledWith({
      user: USER,
      delegatee: GATEWAY,
      debtTokenAddress: DEBT_TOKEN,
      amount: MaxUint256.toString(),
    });
    const delegationTx = await delegation.tx();
    expect(delegationTx.to).toBe(DEBT_TOKEN);
    expect(decodedArgs(debtTokenInterface, delegationTx.data)).toEqual([GATEWAY, MaxUint256]);
    const actionTx = await action.tx();
    expect(actionTx.to).toBe(GATEWAY);
    expect(BigInt(actionTx.value ?? 0)).toBe(0n);
    expect(decodedArgs(gatewayInterface, actionTx.data)).toEqual([POOL, ONE_ETHER, 2n, 0n]);
  });

  it('routes a native bundle supply to the gateway with msg.value and no fixed gas limit', () => {
    const bundle = new PoolBundle(new OfflineProvider(), { POOL, WETH_GATEWAY: GATEWAY });
    const tx = bundle.supplyTxBuilder.generateTxData({
      user: USER,
      reserve: API_ETH_MOCK_ADDRESS,
      amount: '1000',
    });
    expect(tx.to).toBe(GATEWAY);
    expect(tx.value).toBe(1000n);
    expect(tx.gasLimit).toBeUndefined();
    expect(decodedArgs(gatewayInterface, tx.data)).toEqual([POOL, USER, 0n]);
  });

  it('maps InterestRate.None to variable debt on the pool and gateway paths alike', () => {
    const bundle = new PoolBundle(new OfflineProvider(), { POOL, WETH_GATEWAY: GATEWAY });
    const poolRepay = bundle.repayTxBuilder.generateTxData({
      user: USER,
      reserve: RESERVE,
      amount: '1',
      interestRateMode: InterestRate.None,
    });
    const nativeRepay = bundle.repayTxBuilder.generateTxData({
      user: USER,
      reserve: API_ETH_MOCK_ADDRESS,
      amount: '1',
      interestRateMode: InterestRate.None,
    });
    expect(decodedArgs(poolInterface, poolRepay.data)[2]).toBe(2n);
    expect(decodedArgs(gatewayInterface, nativeRepay.data)[2]).toBe(2n);
  });

  it('rejects a zero-address beneficiary on the decorated and bundle paths', async () => {
    const pool = new Pool(new OfflineProvider(), { POOL, WETH_GATEWAY: GATEWAY });
    await expect(async () =>
      pool.supply({ user: USER, reserve: RESERVE, amount: '1', onBehalfOf: ZeroAddress }),
    ).rejects.toThrow('must not be the zero address');
    const bundle = new PoolBundle(new OfflineProvider(), { POOL, WETH_GATEWAY: GATEWAY });
    expect(() =>
      bundle.supplyTxBuilder.generateTxData({
        user: USER,
        reserve: RESERVE,
        amount: '1',
        onBehalfOf: ZeroAddress,
      }),
    ).toThrow('onBehalfOf must not be the zero address');
  });

  it('rejects non-boolean collateral flags and native permit reserves', async () => {
    const pool = new Pool(new OfflineProvider(), { POOL, WETH_GATEWAY: GATEWAY });
    const params = { user: USER, reserve: RESERVE, usageAsCollateral: true };
    Reflect.set(params, 'usageAsCollateral', 'false');
    await expect(async () => pool.setUsageAsCollateral(params)).rejects.toThrow(
      'usageAsCollateral must be a boolean',
    );
    await expect(async () =>
      pool.repayWithPermit({
        user: USER,
        reserve: API_ETH_MOCK_ADDRESS,
        amount: '1',
        interestRateMode: InterestRate.Variable,
        signature: `0x${'11'.repeat(65)}`,
        deadline: '1',
      }),
    ).rejects.toThrow('repayWithPermit requires the wrapped token');
  });

  describe.each(['supplyTxBuilder', 'repayTxBuilder'] as const)('PoolBundle.%s', builder => {
    it.each([API_ETH_MOCK_ADDRESS, API_ETH_MOCK_ADDRESS.toLowerCase()])(
      'rejects the native permit reserve %s',
      reserve => {
        const bundle = new PoolBundle(new OfflineProvider(), { POOL, WETH_GATEWAY: GATEWAY });
        expect(() =>
          bundle[builder].generateSignedTxData({
            user: USER,
            reserve,
            amount: '1',
            interestRateMode: InterestRate.Variable,
            signature:
              '0x532f8df4e2502bd869fb35e9301156f9b307380afdcc25cfbc87b2e939f16f7e47c326dc26eb918d327358797ee67ad7415d871ef7eaf0d4f6352d3ad021fbb41c',
            deadline: '10000',
          }),
        ).toThrow('requires the wrapped token');
      },
    );

    it('rejects a native reserve before parsing the permit signature', () => {
      const bundle = new PoolBundle(new OfflineProvider(), { POOL, WETH_GATEWAY: GATEWAY });
      expect(() =>
        bundle[builder].generateSignedTxData({
          user: USER,
          reserve: API_ETH_MOCK_ADDRESS,
          amount: '1',
          interestRateMode: InterestRate.Variable,
          signature: '0x',
          deadline: '10000',
        }),
      ).toThrow('requires the wrapped token');
    });
  });

  it('estimates a raw approval with its own gas callback', async () => {
    jest.mocked(estimateGasByNetwork).mockResolvedValueOnce(90_000n);
    const pool = new Pool(new OfflineProvider(), { POOL });
    jest.spyOn(pool.erc20Service, 'allowanceRaw').mockResolvedValue(0n);

    const [approval, action] = await pool.supplyRaw({
      user: USER,
      reserve: RESERVE,
      amountRaw: '1000',
    });

    expect((await approval.gas())?.gasLimit).toBe('90000');
    // The action still waits on the approval, so its preview keeps the table recommendation.
    expect((await action.gas())?.gasLimit).toBe(
      gasLimitRecommendations[ProtocolAction.supply].recommended,
    );
  });
});
