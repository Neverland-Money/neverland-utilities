import { Interface, JsonRpcProvider, parseEther } from 'ethers';
import { dustLockAbi, revenueRewardAbi } from '@neverland-money/contract-types';
import { VeDustRevenueHelper } from './index';

const LOCK = '0x0000000000000000000000000000000000000011';
const REVENUE = '0x0000000000000000000000000000000000000022';
const USER = '0x0000000000000000000000000000000000000033';
const REWARD = '0x0000000000000000000000000000000000000044';
const provider = new JsonRpcProvider('http://127.0.0.1:1', 143, { staticNetwork: true });
const helper = new VeDustRevenueHelper({
  provider,
  chainId: 143,
  revenueAddress: REVENUE,
  dustLockAddress: LOCK,
});
const lockIface = new Interface(dustLockAbi);
const revenueIface = new Interface(revenueRewardAbi);

describe('VeDustRevenueHelper ethers v6 reads', () => {
  it('aggregates decoded bigint balances and rewards into the existing display strings', async () => {
    jest
      .spyOn(provider, 'getBlock')
      .mockResolvedValue({ timestamp: 1700000000 } as Awaited<
        ReturnType<typeof provider.getBlock>
      >);
    jest.spyOn(provider, 'call').mockImplementation(async tx => {
      const iface = tx.to === LOCK ? lockIface : revenueIface;
      const name = iface.parseTransaction({ data: tx.data! })!.name;
      const values: Record<string, unknown[]> = {
        balanceOf: [1],
        ownerToNFTokenIdList: [7],
        balanceOfNFT: [parseEther('2')],
        locked: [[parseEther('3'), 1000, 2000, false]],
        totalSupply: [parseEther('20')],
        getRewardTokens: [[REWARD]],
        earnedRewardsAll: [[[2500000]], [2500000]],
        tokenRewardsPerEpoch: [5000000],
      };
      if (!values[name]) throw new Error(`Unexpected read: ${name}`);
      return iface.encodeFunctionResult(name, values[name]);
    });
    const result = await helper.getUserVeDustRevenueData(USER);
    expect(result).toMatchObject({
      veNftIds: [7],
      votingPower: '2.0',
      lockedAmount: '3.0',
      totalRevenueUSD: '2.5',
      rewardAmounts: ['2500000'],
      individualNftRewards: { 7: ['2.5'] },
      individualNftEndTimes: { 7: 2000 },
      pendingRewardsUSD: '5.0',
      totalVeDustSupply: '20.0',
    });
  });

  it('keeps the configured transaction destination when encoding reward claims', () => {
    const tx = helper.getBatchClaimRewardsTxData([7], [REWARD]);
    expect(tx.to).toBe(REVENUE);
    expect(revenueIface.decodeFunctionData('getRewardBatch', tx.data).toArray()).toEqual([
      [7n],
      [REWARD],
    ]);
  });
});
