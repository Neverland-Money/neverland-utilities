# Contract Helpers Package - Complete Guide

## 📦 Package Overview

The `@neverland-money/contract-helpers` package provides type-safe, easy-to-use helper classes for interacting with Neverland protocol smart contracts.

## 🎯 What Was Created

### 1. Package Structure

```
packages/contract-helpers/
├── src/
│   ├── DustRewardsControllerHelper.ts  # Main helper class
│   ├── types.ts                        # TypeScript types
│   └── index.ts                        # Package exports
├── dist/                               # Built output
├── package.json
├── tsconfig.json
├── README.md                           # Package documentation
└── REFACTORING_EXAMPLE.md             # Frontend refactoring guide
```

### 2. DustRewardsControllerHelper Class

A complete helper for the DustRewardsController contract with:

**Instance Methods:**
- `getRewardsData(asset, reward)` - Get reward configuration
- `getAllUserRewards(assets, user)` - Get all user rewards
- `getUserRewards(assets, user, reward)` - Get specific reward
- `getUserAccruedRewards(user, reward)` - Get accrued rewards
- `getRewardsList()` - List all reward tokens
- `getUserAssetData(user, asset, reward)` - Get user asset data
- `isEmissionsActive(asset, reward)` - Check if active
- `getContract()` - Access raw contract
- `getContractWithSigner(signer)` - Get contract with signer

**Static Methods:**
- `calculateAnnualEmissions(emissionPerSecond, decimals)` - Calculate yearly emissions
- `calculateEmissionAPR(emissionPerSecond, rewardPriceUSD, tvlUSD, decimals)` - Calculate APR

## 🚀 Quick Start

### Installation (Frontend)

```bash
# Option 1: If using monorepo workspace
npm install @neverland-money/contract-helpers

# Option 2: Copy files to your project
cp -r packages/contract-helpers/src/* your-frontend/lib/contract-helpers/
```

### Basic Usage

```typescript
import { ethers } from 'ethers';
import { DustRewardsControllerHelper } from '@neverland-money/contract-helpers';

// Initialize
const provider = new ethers.providers.JsonRpcProvider('https://rpc.monad.xyz');
const helper = new DustRewardsControllerHelper({
  provider,
  contractAddress: '0x...' // Your DustRewardsController address
});

// Get reward data
const rewardData = await helper.getRewardsData(
  aTokenAddress,
  dustTokenAddress
);

// Check if active
const isActive = await helper.isEmissionsActive(
  aTokenAddress,
  dustTokenAddress
);

// Get user rewards
const userRewards = await helper.getAllUserRewards(
  [aToken1, aToken2],
  userAddress
);

// Calculate APR
const apr = DustRewardsControllerHelper.calculateEmissionAPR(
  rewardData.emissionPerSecond,
  0.50, // DUST price in USD
  1000000, // TVL in USD
  18
);
```

## 🔧 Integration with Your Frontend

### Step 1: Import in Your Service

```typescript
// your-frontend/services/DustIncentiveService.ts
import { DustRewardsControllerHelper } from '@neverland-money/contract-helpers';
```

### Step 2: Initialize Helper

```typescript
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
```

### Step 3: Replace Direct Contract Calls

```typescript
// ❌ Before
const controller = new ethers.Contract(
  rewardsControllerAddress,
  dustRewardsControllerAbi,
  provider
);
const rewardData = await controller.getRewardsData(assetAddress, dustToken);
const isActive = distributionEnd.toNumber() > now && !emissionPerSecond.eq(0);

// ✅ After
const helper = this.getRewardsHelper(provider, chainId);
const rewardData = await helper.getRewardsData(assetAddress, dustToken);
const isActive = await helper.isEmissionsActive(assetAddress, dustToken);
```

### Step 4: Use Static Utility Methods

```typescript
// ❌ Before - Manual APR calculation
const annualEmissions = emissionPerSecond.mul(31536000);
const annualEmissionsFormatted = parseFloat(
  ethers.utils.formatUnits(annualEmissions, 18)
);
const annualEmissionsUSD = annualEmissionsFormatted * dustPriceUSD;
const aprDecimal = annualEmissionsUSD / parseFloat(tvlUSD);
const incentiveAPR = (aprDecimal * 100).toFixed(4);

// ✅ After - Helper method
const incentiveAPR = DustRewardsControllerHelper.calculateEmissionAPR(
  emissionPerSecond,
  dustPriceUSD,
  parseFloat(tvlUSD),
  18
);
```

## 📚 Complete Refactoring Example

See `packages/contract-helpers/REFACTORING_EXAMPLE.md` for a complete before/after example of refactoring your `DustIncentiveService`.

## 🎨 Architecture Benefits

### Separation of Concerns

```
┌─────────────────────────────────┐
│   Frontend Service Layer        │
│  (Business Logic & State)       │
│  - DustIncentiveService         │
│  - Caching, pricing, etc.       │
└────────────┬────────────────────┘
             │
             ↓
┌─────────────────────────────────┐
│   Contract Helper Layer         │
│  (Contract Interactions)        │
│  - DustRewardsControllerHelper  │
│  - Type-safe methods            │
└────────────┬────────────────────┘
             │
             ↓
┌─────────────────────────────────┐
│   Smart Contracts               │
│  (On-chain Logic)               │
│  - DustRewardsController        │
└─────────────────────────────────┘
```

### Benefits

1. **Maintainability** - Contract logic centralized
2. **Testability** - Easy to mock helpers
3. **Reusability** - Use across multiple services
4. **Type Safety** - Full TypeScript support
5. **Clarity** - Clear separation of concerns

## 🧪 Testing

### Mock the Helper

```typescript
// your-frontend/__tests__/DustIncentiveService.test.ts
import { DustRewardsControllerHelper } from '@neverland-money/contract-helpers';

jest.mock('@neverland-money/contract-helpers', () => ({
  DustRewardsControllerHelper: jest.fn().mockImplementation(() => ({
    getRewardsData: jest.fn().mockResolvedValue({
      index: BigNumber.from('0'),
      emissionPerSecond: BigNumber.from('1000000000000000000'),
      lastUpdateTimestamp: BigNumber.from('1234567890'),
      distributionEnd: BigNumber.from('9999999999'),
    }),
    isEmissionsActive: jest.fn().mockResolvedValue(true),
    getAllUserRewards: jest.fn().mockResolvedValue({
      rewardTokens: ['0xDUST'],
      unclaimedAmounts: [BigNumber.from('1000000000000000000')],
    }),
  })),
}));

describe('DustIncentiveService', () => {
  it('should fetch incentive data', async () => {
    // Your tests here
  });
});
```

## 📖 API Documentation

See `packages/contract-helpers/README.md` for complete API documentation.

### Key Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `getRewardsData(asset, reward)` | Get reward configuration | `Promise<RewardData>` |
| `getAllUserRewards(assets, user)` | Get all user rewards | `Promise<UserRewardsResult>` |
| `getUserRewards(assets, user, reward)` | Get user rewards for reward token | `Promise<BigNumber>` |
| `isEmissionsActive(asset, reward)` | Check if emissions active | `Promise<boolean>` |
| `calculateEmissionAPR(...)` | Calculate APR | `string` (percentage) |
| `calculateAnnualEmissions(...)` | Calculate annual emissions | `string` (formatted) |

## 🔮 Future Enhancements

Consider creating additional helpers:

1. **DustLockHelper** - For veNFT operations
   - `createLock()`, `increaseAmount()`, `increaseUnlockTime()`
   - `merge()`, `withdraw()`, `delegate()`

2. **NeverlandUiProviderHelper** - For UI data
   - `getReservesData()`, `getUserReservesData()`
   - Aggregated market information

3. **ERC20Helper** - For token operations
   - `approve()`, `transfer()`, `balanceOf()`
   - Allowance management

4. **MulticallHelper** - Specialized multicall
   - Batch contract calls efficiently
   - Type-safe result parsing

## 🔗 Related Packages

- `@neverland-money/contract-types` - ABIType-based contract types
- `@neverland-money/address-book` - Contract addresses by network

## 📝 Notes

- Uses Ethers v5 (compatible with most existing frontends)
- Fully typed with TypeScript
- Works with both read and write operations
- Includes utility methods for common calculations
- Easy to extend with new methods

## 🎉 Summary

You now have:
- ✅ A complete contract helper package
- ✅ Type-safe contract interactions
- ✅ Easy-to-use API
- ✅ Static utility methods
- ✅ Full documentation
- ✅ Refactoring guide for your frontend

Import the helper in your frontend service and enjoy cleaner, more maintainable code! 🚀

