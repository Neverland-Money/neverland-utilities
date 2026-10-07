import { ethers } from 'ethers';
import { dustLockAbi, erc20Abi, multicall3Abi } from '@neverland-money/contract-types';
import { DustLockHelper } from './index';
const LOCK = '0x00000000000000000000000000000000000010c4';
const DUST = '0x0000000000000000000000000000000000000d57';
const USER = '0x00000000000000000000000000000000000000a1';
const MULTICALL = '0xcA11bde05977b3631167028862bE2a173976CA11';
const lockIface = new ethers.Interface(dustLockAbi as any);
const erc20Iface = new ethers.Interface(erc20Abi as any);
const multicallIface = new ethers.Interface(multicall3Abi as any);
// A real provider with a fixed network, so ethers never probes the URL; tests mock `call`.
const provider = new ethers.JsonRpcProvider(
  'http://127.0.0.1:1',
  {
    chainId: 143,
    name: 'monad',
  },
  { staticNetwork: true },
);
const helper = new DustLockHelper({ provider, lockAddress: LOCK, dustTokenAddress: DUST });
const ether = (amount: string) => ethers.parseEther(amount);
const aggregate3Result = (results: Array<[boolean, string]>) =>
  multicallIface.encodeFunctionResult('aggregate3', [results]);
describe('DustLockHelper', () => {
  describe('getEarlyWithdrawTxData', () => {
    it('encodes earlyWithdraw(uint256) when no penalty cap is given', () => {
      const { to, data } = helper.getEarlyWithdrawTxData(7);
      expect(to).toBe(LOCK);
      expect(data.slice(0, 10)).toBe(lockIface.getFunction('earlyWithdraw(uint256)')!.selector);
      expect(lockIface.decodeFunctionData('earlyWithdraw(uint256)', data).map(String)).toEqual([
        '7',
      ]);
    });
    it('encodes the penalty-bounded overload when maxPenalty is given', () => {
      const maxPenalty = ether('2').toString();
      const { data } = helper.getEarlyWithdrawTxData(7, maxPenalty);
      expect(data.slice(0, 10)).toBe(
        lockIface.getFunction('earlyWithdraw(uint256,uint256)')!.selector,
      );
      expect(
        lockIface.decodeFunctionData('earlyWithdraw(uint256,uint256)', data).map(String),
      ).toEqual(['7', maxPenalty]);
    });
  });
  describe('getUserDustDataWithMulticall', () => {
    it('reads through a static aggregate3 call on a read-only provider', async () => {
      const requests: Array<{
        to?: string;
        data: string;
      }> = [];
      jest.spyOn(provider, 'call').mockImplementation(async tx => {
        requests.push({
          to: tx.to == null ? undefined : await ethers.resolveAddress(tx.to),
          data: ethers.hexlify((await tx.data) ?? '0x'),
        });
        return aggregate3Result([
          [true, lockIface.encodeFunctionResult('balanceOf', [0])],
          [true, erc20Iface.encodeFunctionResult('balanceOf', [ether('5')])],
          [true, erc20Iface.encodeFunctionResult('allowance', [ether('1')])],
          [true, lockIface.encodeFunctionResult('minLockAmount', [ether('10')])],
        ]);
      });
      const result = await helper.getUserDustDataWithMulticall(USER, MULTICALL);
      expect(requests).toHaveLength(1);
      expect(typeof result.dustBalance).toBe('bigint');
      expect(requests[0].to).toBe(MULTICALL);
      expect(multicallIface.parseTransaction({ data: requests[0].data })!.name).toBe('aggregate3');
      expect(result).toEqual({
        userLocks: [],
        dustBalance: ether('5'),
        dustAllowance: ether('1'),
        minLockAmount: ether('10'),
      });
    });
    it('reads a failed sub-call as zero', async () => {
      jest.spyOn(provider, 'call').mockResolvedValue(
        aggregate3Result([
          [true, lockIface.encodeFunctionResult('balanceOf', [0])],
          [false, '0x'],
          [true, erc20Iface.encodeFunctionResult('allowance', [ether('1')])],
          [false, '0x'],
        ]),
      );
      const result = await helper.getUserDustDataWithMulticall(USER, MULTICALL);
      expect(result.dustBalance).toEqual(0n);
      expect(result.dustAllowance).toEqual(ether('1'));
      expect(result.minLockAmount).toEqual(0n);
    });
  });

  it('decodes bigint lock timestamps from a static multicall', async () => {
    jest.spyOn(provider, 'call').mockImplementation(async tx => {
      const data = ethers.hexlify(tx.data ?? '0x');
      const to = tx.to == null ? '' : await ethers.resolveAddress(tx.to);
      if (to.toLowerCase() === MULTICALL.toLowerCase()) {
        return aggregate3Result([
          [true, lockIface.encodeFunctionResult('locked', [[ether('10'), 1000, 2000, false]])],
          [true, lockIface.encodeFunctionResult('balanceOfNFT', [ether('5')])],
        ]);
      }
      const name = lockIface.parseTransaction({ data })!.name;
      if (name === 'balanceOf') return lockIface.encodeFunctionResult(name, [1]);
      if (name === 'ownerToNFTokenIdList') return lockIface.encodeFunctionResult(name, [7]);
      throw new Error(`Unexpected read: ${name}`);
    });
    const locks = await helper.getUserLocksWithMulticall(USER, MULTICALL);
    expect(locks).toHaveLength(1);
    expect(locks[0]).toMatchObject({
      tokenId: 7,
      amount: ether('10').toString(),
      veDustAmount: ether('5').toString(),
      effectiveStart: 1000,
      end: 2000,
      isPermanent: false,
    });
  });
});
