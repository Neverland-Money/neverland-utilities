import { ethers } from 'ethers';
import { dustLockAbi, revenueRewardAbi } from '@neverland-money/contract-types';
import { AbiBaseService } from '../commons/BaseService';
import type { Abi } from 'abitype';
import type { VeDustRevenueHelperContext, VeDustRevenueData } from './types';

export class VeDustRevenueHelper extends AbiBaseService<Abi> {
  private revenueContract: ethers.Contract;
  private dustLockContract: ethers.Contract;
  private revenueIfaceManual: ethers.utils.Interface;

  constructor(context: VeDustRevenueHelperContext) {
    super(context.provider, revenueRewardAbi as any, context.revenueAddress);
    const svcLock = new AbiBaseService(this.provider, dustLockAbi as any, context.dustLockAddress);
    this.revenueContract = this.getContractInstance(context.revenueAddress);
    this.dustLockContract = svcLock.getContractInstance(context.dustLockAddress);

    this.revenueIfaceManual = new ethers.utils.Interface([
      'function rewardTokens(uint256 index) view returns (address)',
      'function rewardTokensLength() view returns (uint256)',
      'function getRewardTokens() view returns (address[])',
      'function tokenRewardsPerEpoch(address token, uint256 epoch) view returns (uint256)',
      'function earnedRewardsAll(address[] tokens, uint256[] tokenIds) view returns (uint256[][] matrix, uint256[] totals)',
      'function earnedRewards(address token, uint256 tokenId, uint256 endTs) view returns (uint256 amount)',
      'function getReward(uint256 tokenId, address[] tokens)',
      'function getRewardBatch(uint256[] tokenIds, address[] tokens)',
    ]);
  }

  private async getCurrentBlockTimestamp(): Promise<number> {
    try {
      const latestBlock = await this.provider.getBlock('latest');
      return latestBlock.timestamp;
    } catch {
      return Math.floor(Date.now() / 1000);
    }
  }

  async getNextEpochTimestamp(currentTimestamp?: number): Promise<number> {
    const WEEK = 7 * 24 * 60 * 60;
    const timestamp = currentTimestamp || (await this.getCurrentBlockTimestamp());
    return timestamp - (timestamp % WEEK) + WEEK;
  }

  async getTotalVeDustSupply(): Promise<string> {
    try {
      const totalSupply = await this.dustLockContract.totalSupply();
      return ethers.utils.formatEther(totalSupply);
    } catch {
      return '0.0';
    }
  }

  async getRewardTokens(): Promise<string[]> {
    try {
      try {
        const data = this.revenueIfaceManual.encodeFunctionData('getRewardTokens', []);
        const raw = await this.provider.call({ to: this.revenueContract.address, data });
        const decoded = this.revenueIfaceManual.decodeFunctionResult('getRewardTokens', raw);
        const tokens = (decoded?.[0] as string[]) || [];
        return tokens.filter(t => t && t !== ethers.constants.AddressZero);
      } catch {
        try {
          const lenData = this.revenueIfaceManual.encodeFunctionData('rewardTokensLength', []);
          const lenRaw = await this.provider.call({ to: this.revenueContract.address, data: lenData });
          const lenDec = this.revenueIfaceManual.decodeFunctionResult('rewardTokensLength', lenRaw);
          const lenBn = lenDec?.[0] as ethers.BigNumber;
          const len = lenBn?.toNumber?.() ?? Number(lenBn || 0);
          const tokens: string[] = [];
          for (let i = 0; i < len; i++) {
            try {
              const tData = this.revenueIfaceManual.encodeFunctionData('rewardTokens', [i]);
              const tRaw = await this.provider.call({ to: this.revenueContract.address, data: tData });
              const tDec = this.revenueIfaceManual.decodeFunctionResult('rewardTokens', tRaw);
              const addr = tDec?.[0] as string;
              if (addr && addr !== ethers.constants.AddressZero) tokens.push(addr);
            } catch {}
          }
          return tokens;
        } catch {
          return [];
        }
      }
    } catch {
      return [];
    }
  }

  async getPendingRewardsForNextEpoch(): Promise<string> {
    try {
      const tokens: string[] = await this.getRewardTokens();
      const usdcAddress = tokens?.[0];
      if (!usdcAddress || usdcAddress === ethers.constants.AddressZero) {
        return '0.00';
      }
      const nextEpoch = await this.getNextEpochTimestamp();
      const callData = this.revenueIfaceManual.encodeFunctionData('tokenRewardsPerEpoch', [usdcAddress, nextEpoch]);
      const callRaw = await this.provider.call({ to: this.revenueContract.address, data: callData });
      const decoded = this.revenueIfaceManual.decodeFunctionResult('tokenRewardsPerEpoch', callRaw);
      const totalPendingRewards = decoded?.[0] as ethers.BigNumber;
      return ethers.utils.formatUnits(totalPendingRewards, 6);
    } catch {
      return '0.00';
    }
  }

  async getProtocolData(): Promise<{ pendingRewardsUSD: string; nextEpochTimestamp: number; totalVeDustSupply: string }> {
    const pendingRewardsUSD = await this.getPendingRewardsForNextEpoch();
    const [nextEpochTimestamp, totalVeDustSupply] = await Promise.all([
      this.getNextEpochTimestamp(),
      this.getTotalVeDustSupply(),
    ]);
    return { pendingRewardsUSD, nextEpochTimestamp, totalVeDustSupply };
  }

  async getUserVeDustRevenueData(userAddress: string): Promise<VeDustRevenueData> {
    try {
      const veNftCount = await this.dustLockContract.balanceOf(userAddress);
      const veNftIds: number[] = [];
      if (veNftCount.eq(0)) {
        const pendingRewards = await this.getPendingRewardsForNextEpoch();
        const nextEpoch = await this.getNextEpochTimestamp();
        return {
          totalRevenueUSD: '0.00',
          rewardTokens: [],
          rewardAmounts: [],
          selfRepayEnabled: false,
          selfRepayTokenIds: [],
          votingPower: '0.0',
          lockedAmount: '0.0',
          veNftCount: 0,
          veNftIds: [],
          individualNftRewards: {},
          individualNftVotingPower: {},
          individualNftLockedAmounts: {},
          individualNftEndTimes: {},
          pendingRewardsUSD: pendingRewards,
          nextEpochTimestamp: nextEpoch,
          totalVeDustSupply: await this.getTotalVeDustSupply(),
          selfRepayVotingPower: '0.0',
          userRevenueShare: '0.0',
          weeklyRevenueUSD: '0.00',
          formattedRevenueUSD: '0.00',
          hasRewards: false,
          hasVeNfts: false,
        };
      }

      for (let i = 0; i < veNftCount.toNumber(); i++) {
        try {
          const tokenId = await this.dustLockContract.ownerToNFTokenIdList(userAddress, i);
          const n = Number(tokenId);
          if (n > 0) veNftIds.push(n);
        } catch {}
      }

      let totalVotingPower = ethers.BigNumber.from(0);
      let totalLockedAmount = ethers.BigNumber.from(0);
      let selfRepayVotingPower = ethers.BigNumber.from(0);
      const individualNftVotingPower: { [tokenId: number]: string } = {};
      const individualNftLockedAmounts: { [tokenId: number]: string } = {};
      const individualNftEndTimes: { [tokenId: number]: number } = {};

      for (const tokenId of veNftIds) {
        try {
          const votingPower = await this.dustLockContract.balanceOfNFT(tokenId);
          const lockedBalance = await this.dustLockContract.locked(tokenId);
          totalVotingPower = totalVotingPower.add(votingPower);
          individualNftVotingPower[tokenId] = ethers.utils.formatEther(votingPower);
          if (lockedBalance && lockedBalance.amount) {
            const amount = lockedBalance.amount;
            const endTime = lockedBalance.end;
            totalLockedAmount = totalLockedAmount.add(amount);
            individualNftLockedAmounts[tokenId] = ethers.utils.formatEther(amount);
            individualNftEndTimes[tokenId] = endTime.toNumber();
          } else {
            individualNftLockedAmounts[tokenId] = '0';
            individualNftEndTimes[tokenId] = 0;
          }
        } catch {
          individualNftVotingPower[tokenId] = '0';
          individualNftLockedAmounts[tokenId] = '0';
          individualNftEndTimes[tokenId] = 0;
        }
      }

      // Fetch reward tokens
      const rewardTokens: string[] = await this.getRewardTokens();
      let rewardAmounts: ethers.BigNumber[] = [];
      const individualNftRewards: { [tokenId: number]: string[] } = {};
      let totalRevenueUSD = '0.00';

      if (veNftIds.length > 0 && rewardTokens.length > 0) {
        const validTokens = rewardTokens.filter(t => t && t !== ethers.constants.AddressZero);
        const validIds = veNftIds.filter(id => id > 0);
        const rewardAmountsByToken: ethers.BigNumber[] = [];
        for (const tokenId of validIds) {
          try {
            const callData = this.revenueIfaceManual.encodeFunctionData('earnedRewardsAll', [validTokens, [tokenId]]);
            const callRaw = await this.provider.call({ to: this.revenueContract.address, data: callData });
            const result = this.revenueIfaceManual.decodeFunctionResult('earnedRewardsAll', callRaw);
            const matrix = result?.[0] as ethers.BigNumber[][];
            const tokenRow: ethers.BigNumber[] = matrix?.[0] ?? [];
            if (tokenRow.length > 0) {
              individualNftRewards[tokenId] = tokenRow.map(r => ethers.utils.formatUnits(r, 6));
              tokenRow.forEach((r, idx) => {
                if (!rewardAmountsByToken[idx]) rewardAmountsByToken[idx] = ethers.BigNumber.from(0);
                rewardAmountsByToken[idx] = rewardAmountsByToken[idx].add(r);
              });
            } else {
              individualNftRewards[tokenId] = validTokens.map(() => '0');
            }
          } catch {
            individualNftRewards[tokenId] = validTokens.map(() => '0');
          }
        }
        rewardAmounts = rewardAmountsByToken;
        if (rewardAmounts.length > 0) {
          const totalRewards = rewardAmounts.reduce((sum, a) => sum.add(a), ethers.BigNumber.from(0));
          totalRevenueUSD = ethers.utils.formatUnits(totalRewards, 6);
        }
      }

      const pendingRewards = await this.getPendingRewardsForNextEpoch();
      const nextEpoch = await this.getNextEpochTimestamp();
      const totalVeDustSupply = await this.getTotalVeDustSupply();
      const totalSupplyBN = ethers.utils.parseEther(totalVeDustSupply);
      let userRevenueShare = '0.0';
      let weeklyRevenueUSD = '0.00';
      if (totalSupplyBN.gt(0) && selfRepayVotingPower.gt(0)) {
        const sharePercentage = selfRepayVotingPower.mul(10000).div(totalSupplyBN);
        userRevenueShare = ethers.utils.formatUnits(sharePercentage, 2);
        const pendingRewardsBN = ethers.utils.parseUnits(pendingRewards, 6);
        const userWeeklyRevenue = pendingRewardsBN.mul(selfRepayVotingPower).div(totalSupplyBN);
        weeklyRevenueUSD = ethers.utils.formatUnits(userWeeklyRevenue, 6);
      }

      return {
        totalRevenueUSD,
        rewardTokens: rewardTokens || [],
        rewardAmounts: rewardAmounts?.map(a => a.toString()) || [],
        selfRepayEnabled: false,
        selfRepayTokenIds: [],
        votingPower: ethers.utils.formatEther(totalVotingPower),
        lockedAmount: ethers.utils.formatEther(totalLockedAmount),
        veNftCount: veNftIds.length,
        veNftIds,
        individualNftRewards,
        individualNftVotingPower,
        individualNftLockedAmounts,
        individualNftEndTimes,
        pendingRewardsUSD: pendingRewards,
        nextEpochTimestamp: nextEpoch,
        totalVeDustSupply,
        selfRepayVotingPower: ethers.utils.formatEther(selfRepayVotingPower),
        userRevenueShare,
        weeklyRevenueUSD,
        formattedRevenueUSD: totalRevenueUSD,
        hasRewards: parseFloat(totalRevenueUSD) > 0,
        hasVeNfts: veNftIds.length > 0,
      };
    } catch {
      return {
        totalRevenueUSD: '0.00',
        rewardTokens: [],
        rewardAmounts: [],
        selfRepayEnabled: false,
        selfRepayTokenIds: [],
        votingPower: '0.0',
        lockedAmount: '0.0',
        veNftCount: 0,
        veNftIds: [],
        individualNftRewards: {},
        individualNftVotingPower: {},
        individualNftLockedAmounts: {},
        individualNftEndTimes: {},
        pendingRewardsUSD: '0.00',
        nextEpochTimestamp: await this.getNextEpochTimestamp(),
        totalVeDustSupply: await this.getTotalVeDustSupply(),
        selfRepayVotingPower: '0.0',
        userRevenueShare: '0.0',
        weeklyRevenueUSD: '0.00',
        formattedRevenueUSD: '0.00',
        hasRewards: false,
        hasVeNfts: false,
      };
    }
  }

  private encodeRevenueFunction(signature: string, params: unknown[]): { to: string; data: string } {
    const fragment = `function ${signature}`;
    const manual = new ethers.utils.Interface([fragment]);
    const name = signature.slice(0, signature.indexOf('('));
    return { to: this.revenueContract.address, data: manual.encodeFunctionData(name, params) };
  }

  getEnableSelfRepayLoanBatchTxData(tokenIds: number[]): { to: string; data: string } {
    return this.encodeRevenueFunction('enableSelfRepayLoanBatch(uint256[] tokenIds)', [tokenIds]);
  }

  getDisableSelfRepayLoanBatchTxData(tokenIds: number[]): { to: string; data: string } {
    return this.encodeRevenueFunction('disableSelfRepayLoanBatch(uint256[] tokenIds)', [tokenIds]);
  }

  getBatchClaimRewardsTxData(tokenIds: number[], rewardTokens: string[]): { to: string; data: string } {
    return this.encodeRevenueFunction('getRewardBatch(uint256[] tokenIds,address[] tokens)', [tokenIds, rewardTokens]);
  }

  static formatUSDAmount(amount: string): string {
    const numAmount = parseFloat(amount);
    if (numAmount === 0) return '—';
    if (numAmount < 0.01) return '< $0.01';
    return `$${numAmount.toFixed(2)}`;
  }
}


