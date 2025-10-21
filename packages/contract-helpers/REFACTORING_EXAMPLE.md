# Refactoring Frontend Service to Use Contract Helpers

This guide shows how to refactor your `DustIncentiveService` to use the new `DustRewardsControllerHelper`.

## Benefits of Refactoring

- ✅ **Separation of concerns** - Contract logic separated from business logic
- ✅ **Reusability** - Helper can be used across multiple services
- ✅ **Testability** - Easier to mock contract interactions
- ✅ **Type safety** - Better TypeScript support
- ✅ **Maintainability** - Contract changes centralized in helper

## Installation in Frontend

```bash
# If using the monorepo package
npm install @neverland-money/contract-helpers

# Or copy the helper files to your frontend
```

## Before: Direct Contract Usage

```typescript
// Old approach - direct contract instantiation
const controller = new ethers.Contract(
  rewardsControllerAddress,
  dustRewardsControllerAbi,
  provider
);

const rewardData = await controller.getRewardsData(
  assetAddress,
  dustTokenAddress
);
```

## After: Using Contract Helper

```typescript
// New approach - using helper
import { DustRewardsControllerHelper } from '@neverland-money/contract-helpers';

const rewardsHelper = new DustRewardsControllerHelper({
  provider,
  contractAddress: rewardsControllerAddress,
});

const rewardData = await rewardsHelper.getRewardsData(
  assetAddress,
  dustTokenAddress
);
```

## Refactored Service Example

```typescript
import { ethers } from 'ethers';
import { DustRewardsControllerHelper } from '@neverland-money/contract-helpers';
import type {
  DustIncentiveData,
  UserRewardsData,
  AssetRewardBreakdown,
} from '@neverland-money/contract-helpers';

import {
  getDustRewardsController,
  getDustTokenAddress,
} from '@/configs/dust-markets-config';
import { getNetworkNowSec } from '@/utils/time';
import { MulticallService } from './MulticallService';
import NeverlandDustHelperService from './NeverlandDustHelperService';
import { TokenPriceService } from './TokenPriceService';

export class DustIncentiveService {
  private static instance: DustIncentiveService;
  private provider: ethers.providers.Provider | null = null;
  private priceService: TokenPriceService | null = null;
  private rewardsHelper: DustRewardsControllerHelper | null = null;

  private constructor() {}

  public static getInstance(): DustIncentiveService {
    if (!DustIncentiveService.instance) {
      DustIncentiveService.instance = new DustIncentiveService();
    }
    return DustIncentiveService.instance;
  }

  private getPriceService(): TokenPriceService {
    if (!this.priceService) {
      this.priceService = new TokenPriceService();
    }
    return this.priceService;
  }

  private async getDustPriceUSD(
    chainId: number,
    providerOverride?: ethers.providers.Provider
  ): Promise<number> {
    try {
      const provider = providerOverride || this.provider;
      if (provider && chainId) {
        const helper = new NeverlandDustHelperService(provider, chainId);
        const metrics = await helper.getMarketMetricsParsed();
        if (
          metrics &&
          typeof metrics.usdPrice === 'number' &&
          metrics.usdPrice > 0
        ) {
          return metrics.usdPrice;
        }
      }
    } catch {
      // fall through to API fallback
    }
    const priceService = this.getPriceService();
    return priceService.getDustPrice();
  }

  setProvider(provider: ethers.providers.Provider) {
    this.provider = provider;
  }

  /**
   * Initialize or get rewards helper for a specific chain
   */
  private getRewardsHelper(
    provider: ethers.providers.Provider,
    chainId: number
  ): DustRewardsControllerHelper | null {
    const controllerAddress = getDustRewardsController(chainId);
    if (!controllerAddress) return null;

    return new DustRewardsControllerHelper({
      provider,
      contractAddress: controllerAddress,
    });
  }

  /**
   * Fetch DUST incentive data for a specific asset using the helper
   */
  async fetchDustIncentiveDataWithProvider(
    provider: ethers.providers.Provider,
    assetAddress: string,
    chainId: number,
    assetPriceInMarketReferenceCurrency?: string,
    tvlUSD?: string
  ): Promise<DustIncentiveData | null> {
    const rewardsHelper = this.getRewardsHelper(provider, chainId);
    const dustTokenAddress = getDustTokenAddress(chainId);

    if (!rewardsHelper || !dustTokenAddress) {
      return null;
    }

    try {
      // Use helper method to get reward data
      const rewardData = await rewardsHelper.getRewardsData(
        assetAddress,
        dustTokenAddress
      );

      // Check if rewards are active using helper method
      const isActive = await rewardsHelper.isEmissionsActive(
        assetAddress,
        dustTokenAddress
      );

      if (!isActive) {
        return null;
      }

      const dustPriceUSD = await this.getDustPriceUSD(chainId, provider);
      const dustPriceFormatted = Math.floor(dustPriceUSD * 1e8);
      const assetPrice = assetPriceInMarketReferenceCurrency || '';

      // Calculate APR using helper static method
      const incentiveAPR = tvlUSD && parseFloat(tvlUSD) > 0
        ? DustRewardsControllerHelper.calculateEmissionAPR(
            rewardData.emissionPerSecond,
            dustPriceUSD,
            parseFloat(tvlUSD),
            18
          )
        : '0';

      return {
        incentiveControllerAddress: rewardsHelper.address,
        rewardTokenAddress: dustTokenAddress,
        rewardTokenSymbol: 'DUST',
        rewardTokenDecimals: 18,
        precision: 18,
        priceFeed: assetPrice,
        priceFeedTimestamp: getNetworkNowSec(),
        priceFeedDecimals: 8,
        emissionPerSecond: rewardData.emissionPerSecond.toString(),
        incentivesLastUpdateTimestamp: rewardData.lastUpdateTimestamp.toNumber(),
        tokenIncentivesIndex: rewardData.index.toString(),
        emissionEndTimestamp: rewardData.distributionEnd.toNumber(),
        rewardPriceFeed: dustPriceFormatted.toString(),
        distributionEnd: rewardData.distributionEnd.toNumber(),
        incentiveAPR,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get all rewards for a user using the helper
   */
  async getAllUserRewardsWithProvider(
    provider: ethers.providers.Provider,
    userAddress: string,
    assetAddresses: string[],
    chainId: number
  ): Promise<UserRewardsData> {
    const rewardsHelper = this.getRewardsHelper(provider, chainId);

    if (!rewardsHelper) {
      return {
        rewardTokens: [],
        unclaimedAmounts: [],
        totalRewards: '0',
        totalRewardsUSD: '0',
      };
    }

    try {
      // Use helper method
      const result = await rewardsHelper.getAllUserRewards(
        assetAddresses,
        userAddress
      );

      // Calculate total rewards
      const totalRewards = result.unclaimedAmounts.reduce(
        (total, amount) => total.add(amount),
        ethers.BigNumber.from('0')
      );

      // Calculate USD value
      const dustPriceUSD = await this.getDustPriceUSD(chainId, provider);
      const totalRewardsFormatted = parseFloat(
        ethers.utils.formatUnits(totalRewards, 18)
      );
      const totalRewardsUSDValue = totalRewardsFormatted * dustPriceUSD;
      const totalRewardsUSD =
        totalRewardsUSDValue > 0 && totalRewardsUSDValue < 0.01
          ? '< 0.01'
          : totalRewardsUSDValue.toString();

      return {
        rewardTokens: result.rewardTokens,
        unclaimedAmounts: result.unclaimedAmounts.map(amount =>
          amount.toString()
        ),
        totalRewards: totalRewards.toString(),
        totalRewardsUSD,
      };
    } catch {
      return {
        rewardTokens: [],
        unclaimedAmounts: [],
        totalRewards: '0',
        totalRewardsUSD: '0',
      };
    }
  }

  /**
   * Get asset reward breakdown using the helper
   */
  async getAssetRewardsBreakdown(
    provider: ethers.providers.Provider,
    userAddress: string,
    assetAddresses: string[],
    chainId: number,
    reserves: {
      aTokenAddress: string;
      variableDebtTokenAddress: string;
      symbol: string;
    }[]
  ): Promise<AssetRewardBreakdown[]> {
    const rewardsHelper = this.getRewardsHelper(provider, chainId);
    const dustTokenAddress = getDustTokenAddress(chainId);

    if (!rewardsHelper || !dustTokenAddress || !reserves) {
      return [];
    }

    try {
      const breakdown: AssetRewardBreakdown[] = [];
      let totalRewards = ethers.BigNumber.from('0');

      // Use helper to get rewards for each asset
      for (const assetAddress of assetAddresses) {
        try {
          const rewards = await rewardsHelper.getUserRewards(
            [assetAddress],
            userAddress,
            dustTokenAddress
          );

          if (rewards.gt(0)) {
            const reserve = reserves.find(
              r =>
                r.aTokenAddress.toLowerCase() === assetAddress.toLowerCase() ||
                r.variableDebtTokenAddress.toLowerCase() ===
                  assetAddress.toLowerCase()
            );

            if (reserve) {
              const isAToken =
                reserve.aTokenAddress.toLowerCase() ===
                assetAddress.toLowerCase();
              const assetType = isAToken ? 'aToken' : 'variableDebtToken';
              const symbol = isAToken
                ? `n${reserve.symbol}`
                : `${reserve.symbol}`;

              breakdown.push({
                assetAddress,
                assetSymbol: symbol,
                assetType,
                rewardAmount: ethers.utils.formatUnits(rewards, 18),
                rewardPercentage: 0,
              });

              totalRewards = totalRewards.add(rewards);
            }
          }
        } catch {
          continue;
        }
      }

      // Calculate percentages
      if (totalRewards.gt(0)) {
        breakdown.forEach(item => {
          const itemAmount = ethers.utils.parseUnits(item.rewardAmount, 18);
          item.rewardPercentage =
            parseFloat(itemAmount.mul(10000).div(totalRewards).toString()) /
            100;
        });
      }

      return breakdown.filter(item => parseFloat(item.rewardAmount) > 0);
    } catch (error) {
      console.error('Error getting asset rewards breakdown:', error);
      return [];
    }
  }

  /**
   * Fetch multiple asset incentives with multicall
   * Note: For multicall, you might still need direct contract access
   * Consider creating a MulticallRewardsHelper if this pattern is common
   */
  async fetchMultipleAssetIncentivesWithMulticall(
    provider: ethers.providers.Provider,
    assetAddresses: string[],
    chainId: number,
    assetPrices?: { [address: string]: string },
    tvlData?: { [address: string]: string }
  ): Promise<{ [assetAddress: string]: DustIncentiveData | null }> {
    const rewardsHelper = this.getRewardsHelper(provider, chainId);
    const dustTokenAddress = getDustTokenAddress(chainId);

    if (!rewardsHelper || !dustTokenAddress) {
      return {};
    }

    try {
      const multicallService = new MulticallService(provider, chainId);
      
      // Get the raw contract for multicall encoding
      const contract = rewardsHelper.getContract();
      const rewardsInterface = contract.interface;

      // Create multicall batch
      const calls = assetAddresses.map(assetAddress =>
        MulticallService.createCall(
          rewardsHelper.address,
          MulticallService.encodeFunctionCall(
            rewardsInterface,
            'getRewardsData',
            [assetAddress, dustTokenAddress]
          )
        )
      );

      const results = await multicallService.aggregate(calls);
      const incentiveData: { [assetAddress: string]: DustIncentiveData | null } = {};

      const dustPriceUSD = await this.getDustPriceUSD(chainId, provider);
      const dustPriceFormatted = Math.floor(dustPriceUSD * 1e8);
      const latestBlock = await provider.getBlock('latest');
      const blockTimestamp = latestBlock.timestamp;

      for (let i = 0; i < assetAddresses.length; i++) {
        const assetAddress = assetAddresses[i];

        if (results[i]?.success) {
          try {
            const rewardDataResult = MulticallService.decodeFunctionResult(
              rewardsInterface,
              'getRewardsData',
              results[i]?.returnData || '0x'
            );

            if (rewardDataResult) {
              const [index, emissionPerSecond, lastUpdateTimestamp, distributionEnd] =
                rewardDataResult;

              const distributionEndTimestamp = distributionEnd.toNumber();
              const isActive =
                distributionEndTimestamp > blockTimestamp &&
                !emissionPerSecond.eq(0);

              if (isActive) {
                const tvlUSD = tvlData?.[assetAddress!];
                
                // Use helper static method for APR calculation
                const incentiveAPR = tvlUSD && parseFloat(tvlUSD) > 0
                  ? DustRewardsControllerHelper.calculateEmissionAPR(
                      emissionPerSecond,
                      dustPriceUSD,
                      parseFloat(tvlUSD),
                      18
                    )
                  : '0';

                incentiveData[assetAddress!] = {
                  incentiveControllerAddress: rewardsHelper.address,
                  rewardTokenAddress: dustTokenAddress,
                  rewardTokenSymbol: 'DUST',
                  rewardTokenDecimals: 18,
                  precision: 18,
                  priceFeed: assetPrices?.[assetAddress!] || '',
                  priceFeedTimestamp: blockTimestamp,
                  priceFeedDecimals: 8,
                  emissionPerSecond: emissionPerSecond.toString(),
                  incentivesLastUpdateTimestamp: lastUpdateTimestamp.toNumber(),
                  tokenIncentivesIndex: index.toString(),
                  emissionEndTimestamp: distributionEnd.toNumber(),
                  rewardPriceFeed: dustPriceFormatted.toString(),
                  distributionEnd: distributionEnd.toNumber(),
                  incentiveAPR,
                };
              } else {
                incentiveData[assetAddress!] = null;
              }
            } else {
              incentiveData[assetAddress!] = null;
            }
          } catch {
            incentiveData[assetAddress!] = null;
          }
        } else {
          incentiveData[assetAddress!] = null;
        }
      }

      return incentiveData;
    } catch (error) {
      console.error('Multicall failed for asset incentives:', error);
      // Fallback to individual calls using helper
      const incentiveData: { [assetAddress: string]: DustIncentiveData | null } = {};
      for (const assetAddress of assetAddresses) {
        try {
          const assetPrice = assetPrices?.[assetAddress];
          const tvlUSD = tvlData?.[assetAddress];
          incentiveData[assetAddress] =
            await this.fetchDustIncentiveDataWithProvider(
              provider,
              assetAddress,
              chainId,
              assetPrice,
              tvlUSD
            );
        } catch {
          incentiveData[assetAddress] = null;
        }
      }
      return incentiveData;
    }
  }
}

export const dustIncentiveService = DustIncentiveService.getInstance();
```

## Key Changes

### 1. Helper Initialization

```typescript
// Before
const controller = new ethers.Contract(
  rewardsControllerAddress,
  dustRewardsControllerAbi,
  provider
);

// After
private getRewardsHelper(provider: ethers.providers.Provider, chainId: number) {
  const controllerAddress = getDustRewardsController(chainId);
  if (!controllerAddress) return null;
  
  return new DustRewardsControllerHelper({
    provider,
    contractAddress: controllerAddress,
  });
}
```

### 2. Using Helper Methods

```typescript
// Before
const rewardData = await controller.getRewardsData(assetAddress, dustTokenAddress);
const isActive = distributionEnd.toNumber() > now && !emissionPerSecond.eq(0);

// After
const rewardData = await rewardsHelper.getRewardsData(assetAddress, dustTokenAddress);
const isActive = await rewardsHelper.isEmissionsActive(assetAddress, dustTokenAddress);
```

### 3. Using Static Utility Methods

```typescript
// Before
const annualEmissions = emissionPerSecond.mul(31536000);
const annualEmissionsFormatted = parseFloat(
  ethers.utils.formatUnits(annualEmissions, 18)
);
const annualEmissionsUSD = annualEmissionsFormatted * dustPriceUSD;
const aprDecimal = annualEmissionsUSD / parseFloat(tvlUSD);
const incentiveAPR = (aprDecimal * 100).toFixed(4);

// After
const incentiveAPR = DustRewardsControllerHelper.calculateEmissionAPR(
  rewardData.emissionPerSecond,
  dustPriceUSD,
  parseFloat(tvlUSD),
  18
);
```

### 4. Accessing Raw Contract When Needed

```typescript
// For advanced usage like multicall encoding
const contract = rewardsHelper.getContract();
const rewardsInterface = contract.interface;
```

## Migration Steps

1. **Install the helper package** in your frontend
2. **Import the helper** instead of the raw ABI
3. **Replace direct contract instantiation** with helper initialization
4. **Replace contract method calls** with helper methods
5. **Use static utility methods** for calculations
6. **Test thoroughly** to ensure behavior is unchanged

## Testing the Refactored Service

```typescript
// Mock the helper for testing
jest.mock('@neverland-money/contract-helpers', () => ({
  DustRewardsControllerHelper: jest.fn().mockImplementation(() => ({
    getRewardsData: jest.fn(),
    getAllUserRewards: jest.fn(),
    isEmissionsActive: jest.fn(),
    // ... other methods
  })),
}));
```

## Next Steps

Consider creating additional helpers for:
- `DustLockHelper` - For veNFT operations
- `NeverlandUiProviderHelper` - For UI data fetching
- `MulticallHelper` - Specialized multicall operations

This creates a clean, maintainable architecture that scales well!

