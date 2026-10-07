import { Interface, JsonRpcProvider } from 'ethers';
import { dustRewardsControllerAbi } from '@neverland-money/contract-types';
import { DustAPRCalculator } from './index';

describe('DustAPRCalculator ethers migration', () => {
  it('preserves the known inactive fallback for the actual unnamed controller outputs', async () => {
    const provider = new JsonRpcProvider('http://127.0.0.1:1', 143, { staticNetwork: true });
    const iface = new Interface(dustRewardsControllerAbi);
    jest
      .spyOn(provider, 'call')
      .mockResolvedValue(iface.encodeFunctionResult('getRewardsData', [1, 2, 3, 4000000000]));
    const result = await new DustAPRCalculator().calculateMarketAPR(
      '0x0000000000000000000000000000000000000011',
      '0x0000000000000000000000000000000000000022',
      '0x0000000000000000000000000000000000000033',
      provider,
      {},
    );
    expect(result).toEqual({
      apr: 0,
      isActive: false,
      emissionPerSecond: '0',
      distributionEnd: 0,
      totalSupply: '0',
    });
  });
});
