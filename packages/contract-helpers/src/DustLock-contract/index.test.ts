import { BigNumber, providers, utils } from 'ethers';
import { dustLockAbi, erc20Abi, multicall3Abi } from '@neverland-money/contract-types';
import { DustLockHelper } from './index';

const LOCK = '0x00000000000000000000000000000000000010c4';
const DUST = '0x0000000000000000000000000000000000000d57';
const USER = '0x00000000000000000000000000000000000000a1';
const MULTICALL = '0xcA11bde05977b3631167028862bE2a173976CA11';

const lockIface = new utils.Interface(dustLockAbi as any);
const erc20Iface = new utils.Interface(erc20Abi as any);
const multicallIface = new utils.Interface(multicall3Abi as any);

// A real provider with a fixed network, so ethers never probes the URL; tests mock `call`.
const provider = new providers.StaticJsonRpcProvider('http://127.0.0.1:1', {
  chainId: 143,
  name: 'monad',
});
const helper = new DustLockHelper({ provider, lockAddress: LOCK, dustTokenAddress: DUST });
const ether = (amount: string) => utils.parseEther(amount);

const aggregate3Result = (results: Array<[boolean, string]>) =>
  multicallIface.encodeFunctionResult('aggregate3', [results]);

describe('DustLockHelper', () => {
  describe('getEarlyWithdrawTxData', () => {
    it('encodes earlyWithdraw(uint256) when no penalty cap is given', () => {
      const { to, data } = helper.getEarlyWithdrawTxData(7);
      expect(to).toBe(LOCK);
      expect(data.slice(0, 10)).toBe(lockIface.getSighash('earlyWithdraw(uint256)'));
      expect(lockIface.decodeFunctionData('earlyWithdraw(uint256)', data).map(String)).toEqual([
        '7',
      ]);
    });

    it('encodes the penalty-bounded overload when maxPenalty is given', () => {
      const maxPenalty = ether('2').toString();
      const { data } = helper.getEarlyWithdrawTxData(7, maxPenalty);
      expect(data.slice(0, 10)).toBe(lockIface.getSighash('earlyWithdraw(uint256,uint256)'));
      expect(
        lockIface.decodeFunctionData('earlyWithdraw(uint256,uint256)', data).map(String),
      ).toEqual(['7', maxPenalty]);
    });
  });

  describe('getUserDustDataWithMulticall', () => {
    it('reads through a static aggregate3 call on a read-only provider', async () => {
      const requests: Array<{ to?: string; data: string }> = [];
      jest.spyOn(provider, 'call').mockImplementation(async tx => {
        requests.push({ to: await tx.to, data: utils.hexlify((await tx.data) ?? '0x') });
        return aggregate3Result([
          [true, lockIface.encodeFunctionResult('balanceOf', [0])],
          [true, erc20Iface.encodeFunctionResult('balanceOf', [ether('5')])],
          [true, erc20Iface.encodeFunctionResult('allowance', [ether('1')])],
          [true, lockIface.encodeFunctionResult('minLockAmount', [ether('10')])],
        ]);
      });

      const result = await helper.getUserDustDataWithMulticall(USER, MULTICALL);

      expect(requests).toHaveLength(1);
      expect(requests[0].to).toBe(MULTICALL);
      expect(multicallIface.parseTransaction({ data: requests[0].data }).name).toBe('aggregate3');
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

      expect(result.dustBalance).toEqual(BigNumber.from(0));
      expect(result.dustAllowance).toEqual(ether('1'));
      expect(result.minLockAmount).toEqual(BigNumber.from(0));
    });
  });
});
