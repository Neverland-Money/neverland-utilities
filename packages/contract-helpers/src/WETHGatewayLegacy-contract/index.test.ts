import { Interface, JsonRpcProvider } from 'ethers';
import { WETHGatewayLegacyAdapter } from './index';
import { InterestRate } from '../interestRate';

const GATEWAY = '0x0000000000000000000000000000000000000011';
const POOL = '0x0000000000000000000000000000000000000022';
const USER = '0x0000000000000000000000000000000000000033';
const provider = new JsonRpcProvider('http://127.0.0.1:1', 143, { staticNetwork: true });
const gateway = new WETHGatewayLegacyAdapter(provider, undefined, GATEWAY);
const iface = new Interface([
  'function depositETH(address pool,address user,uint16 referralCode) payable',
  'function borrowETH(address pool,uint256 amount,uint256 interestRateMode,uint16 referralCode)',
  'function repayETH(address pool,uint256 amount,uint256 interestRateMode,address user) payable',
  'function withdrawETH(address pool,uint256 amount,address user)',
]);

describe('ethers v6 gateway population', () => {
  it('populates deposits with unchanged calldata and bigint value', async () => {
    const tx = await gateway.depositETH({
      lendingPool: POOL,
      user: USER,
      amount: '7',
      referralCode: '9',
    });
    expect(tx).toMatchObject({
      to: GATEWAY,
      value: 7n,
      data: iface.encodeFunctionData('depositETH', [POOL, USER, 9]),
    });
  });

  it.each([
    [InterestRate.Stable, 1],
    [InterestRate.Variable, 2],
  ])('populates %s borrowing with the numeric rate mode', async (interestRateMode, rateMode) => {
    const tx = await gateway.borrowETH({
      lendingPool: POOL,
      user: USER,
      amount: '7',
      interestRateMode,
      referralCode: '9',
    });
    expect(tx).toMatchObject({
      to: GATEWAY,
      data: iface.encodeFunctionData('borrowETH', [POOL, 7, rateMode, 9]),
    });
  });

  it('populates repayments with the beneficiary and native value', async () => {
    const tx = await gateway.repayETH({
      lendingPool: POOL,
      user: USER,
      onBehalfOf: GATEWAY,
      amount: '7',
      interestRateMode: InterestRate.Variable,
    });
    expect(tx).toMatchObject({
      to: GATEWAY,
      value: 7n,
      data: iface.encodeFunctionData('repayETH', [POOL, 7, 2, GATEWAY]),
    });
  });

  it('populates withdrawals without making an RPC request', async () => {
    const call = jest.spyOn(provider, 'call');
    const tx = await gateway.withdrawETH({
      lendingPool: POOL,
      user: USER,
      amount: '7',
      aTokenAddress: GATEWAY,
    });
    expect(tx).toMatchObject({
      to: GATEWAY,
      data: iface.encodeFunctionData('withdrawETH', [POOL, 7, USER]),
    });
    expect(call).not.toHaveBeenCalled();
  });
});
