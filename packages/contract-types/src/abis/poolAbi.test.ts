import { ethers } from 'ethers';
import { decodeFunctionData, decodeFunctionResult, encodeFunctionData } from 'viem';
import { poolAbi, type PoolAbi } from '@neverland-money/contract-types';
const abi: PoolAbi = poolAbi;
const asset = '0x1111111111111111111111111111111111111111';
const user = '0x2222222222222222222222222222222222222222';
describe('lending Pool ABI', () => {
  it('retains implementation getters and Neverland synchronization calls', () => {
    const iface = new ethers.Interface(JSON.stringify(abi));
    expect(iface.getFunction('POOL_REVISION')!.outputs?.[0].type).toBe('uint256');
    expect(iface.getFunction('ADDRESSES_PROVIDER')!.outputs?.[0].type).toBe('address');
    expect(iface.getFunction('initialize')!.format()).toBe('initialize(address)');
    expect(iface.getFunction('syncIndexesState')!.format()).toBe('syncIndexesState(address)');
    expect(iface.getFunction('syncRatesState')!.format()).toBe('syncRatesState(address)');
    expect(iface.getEvent('Supply')!.format()).toBe(
      'Supply(address,address,address,uint256,uint16)',
    );
  });
  it('encodes supply calldata and decodes it with viem and ethers', () => {
    const data = encodeFunctionData({
      abi,
      functionName: 'supply',
      args: [asset, BigInt(1000000), user, 7],
    });
    // Selector and ABI words are independent of the packaged ABI.
    expect(data).toBe(
      '0x617ba037' +
        asset.slice(2).padStart(64, '0') +
        'f4240'.padStart(64, '0') +
        user.slice(2).padStart(64, '0') +
        '7'.padStart(64, '0'),
    );
    expect(decodeFunctionData({ abi, data })).toEqual({
      functionName: 'supply',
      args: [asset, BigInt(1000000), user, 7],
    });
    const decoded = new ethers.Interface(JSON.stringify(abi)).decodeFunctionData('supply', data);
    expect(decoded.asset).toBe(asset);
    expect(decoded.amount.toString()).toBe('1000000');
    expect(decoded.onBehalfOf).toBe(user);
    expect(decoded.referralCode).toBe(7n);
  });
  it('decodes the full reserve tuple including its nested configuration', () => {
    // Encode an independent return fixture to catch missing, reordered, or renamed tuple fields.
    const data = ethers.AbiCoder.defaultAbiCoder().encode(
      [
        'tuple(tuple(uint256) configuration,uint128 liquidityIndex,uint128 currentLiquidityRate,' +
          'uint128 variableBorrowIndex,uint128 currentVariableBorrowRate,uint128 currentStableBorrowRate,' +
          'uint40 lastUpdateTimestamp,uint16 id,address aTokenAddress,address stableDebtTokenAddress,' +
          'address variableDebtTokenAddress,address interestRateStrategyAddress,uint128 accruedToTreasury,' +
          'uint128 unbacked,uint128 isolationModeTotalDebt)',
      ],
      [[[7], 11, 12, 13, 14, 15, 1700000000, 3, asset, user, asset, user, 16, 17, 18]],
    ) as `0x${string}`;
    expect(decodeFunctionResult({ abi, functionName: 'getReserveData', data })).toEqual({
      configuration: { data: BigInt(7) },
      liquidityIndex: BigInt(11),
      currentLiquidityRate: BigInt(12),
      variableBorrowIndex: BigInt(13),
      currentVariableBorrowRate: BigInt(14),
      currentStableBorrowRate: BigInt(15),
      lastUpdateTimestamp: 1700000000,
      id: 3,
      aTokenAddress: asset,
      stableDebtTokenAddress: user,
      variableDebtTokenAddress: asset,
      interestRateStrategyAddress: user,
      accruedToTreasury: BigInt(16),
      unbacked: BigInt(17),
      isolationModeTotalDebt: BigInt(18),
    });
  });
});
