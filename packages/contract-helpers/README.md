# @neverland-money/contract-helpers

Contract helper classes for interacting with Neverland protocol smart contracts. Provides a clean, typed API over raw contract calls.

## Features

- 🎯 **Type-safe** - Full TypeScript support with proper typing
- 🔧 **Easy to use** - Simple class-based API
- 📦 **Modular** - Import only what you need
- 🧪 **Testable** - Easily mock for testing
- 🔒 **Safe** - Built-in validation and error handling

## Installation

This package is part of the Neverland utilities monorepo.

```bash
yarn install
```

## Available Helpers

### DustRewardsControllerHelper

Helper for interacting with the DustRewardsController contract that manages DUST token emissions and rewards.

## Usage

### Basic Setup

```typescript
import { providers } from 'ethers';
import { DustRewardsControllerHelper } from '@neverland-money/contract-helpers';

// Create provider
const provider = new providers.JsonRpcProvider('https://rpc.monad.xyz');

// Create helper instance
const rewardsHelper = new DustRewardsControllerHelper({
  provider,
  contractAddress: '0x...', // DustRewardsController address
});
```

### Get Rewards Data

```typescript
// Get reward configuration for an asset
const rewardData = await rewardsHelper.getRewardsData(
  aTokenAddress,
  dustTokenAddress
);

console.log('Emissions per second:', rewardData.emissionPerSecond.toString());
console.log('Distribution end:', rewardData.distributionEnd.toNumber());
```

### Check if Emissions are Active

```typescript
const isActive = await rewardsHelper.isEmissionsActive(
  aTokenAddress,
  dustTokenAddress
);

if (isActive) {
  console.log('Rewards are currently active for this asset');
}
```

### Get User Rewards

```typescript
// Get all user rewards across multiple assets
const userRewards = await rewardsHelper.getAllUserRewards(
  [aToken1, aToken2, variableDebtToken1],
  userAddress
);

console.log('Reward tokens:', userRewards.rewardTokens);
console.log('Unclaimed amounts:', userRewards.unclaimedAmounts);

// Get user rewards for a specific reward token
const dustRewards = await rewardsHelper.getUserRewards(
  [aToken1, aToken2],
  userAddress,
  dustTokenAddress
);

console.log('Unclaimed DUST:', ethers.utils.formatUnits(dustRewards, 18));
```

### Calculate APR

```typescript
import { DustRewardsControllerHelper } from '@neverland-money/contract-helpers';

const rewardData = await rewardsHelper.getRewardsData(
  aTokenAddress,
  dustTokenAddress
);

// Calculate APR
const apr = DustRewardsControllerHelper.calculateEmissionAPR(
  rewardData.emissionPerSecond,
  dustPriceUSD, // e.g., 0.50
  totalLiquidityUSD, // e.g., 1000000
  18 // DUST decimals
);

console.log(`Emission APR: ${apr}%`);
```

### Calculate Annual Emissions

```typescript
const annualEmissions = DustRewardsControllerHelper.calculateAnnualEmissions(
  rewardData.emissionPerSecond,
  18
);

console.log(`Annual emissions: ${annualEmissions} DUST`);
```

### Advanced: Access Raw Contract

```typescript
// Get the underlying ethers contract for advanced usage
const contract = rewardsHelper.getContract();

// Call any contract method directly
const customData = await contract.someCustomMethod();
```

## Integration with Frontend Services

### Example: Refactored Service

```typescript
import { providers } from 'ethers';
import { DustRewardsControllerHelper } from '@neverland-money/contract-helpers';

export class DustIncentiveService {
  private rewardsHelper: DustRewardsControllerHelper | null = null;

  async initialize(provider: providers.Provider, controllerAddress: string) {
    this.rewardsHelper = new DustRewardsControllerHelper({
      provider,
      contractAddress: controllerAddress,
    });
  }

  async fetchIncentiveData(assetAddress: string, dustTokenAddress: string) {
    if (!this.rewardsHelper) throw new Error('Not initialized');

    const rewardData = await this.rewardsHelper.getRewardsData(
      assetAddress,
      dustTokenAddress
    );

    const isActive = await this.rewardsHelper.isEmissionsActive(
      assetAddress,
      dustTokenAddress
    );

    if (!isActive) return null;

    return {
      emissionPerSecond: rewardData.emissionPerSecond.toString(),
      distributionEnd: rewardData.distributionEnd.toNumber(),
      // ... more data
    };
  }

  async getUserRewards(userAddress: string, assetAddresses: string[]) {
    if (!this.rewardsHelper) throw new Error('Not initialized');

    return await this.rewardsHelper.getAllUserRewards(
      assetAddresses,
      userAddress
    );
  }
}
```

## API Reference

### DustRewardsControllerHelper

#### Constructor

```typescript
constructor(config: BaseContractHelperConfig)
```

- `config.provider` - Ethers provider instance
- `config.contractAddress` - DustRewardsController contract address

#### Methods

##### getRewardsData(asset, reward)

Get rewards configuration for an asset and reward token.

##### getAllUserRewards(assets, user)

Get all rewards for a user across multiple assets.

##### getUserRewards(assets, user, reward)

Get user rewards for specific assets and reward token.

##### getUserAccruedRewards(user, reward)

Get accrued rewards for a user and reward token.

##### getRewardsList()

Get list of all reward tokens configured.

##### getUserAssetData(user, asset, reward)

Get user's reward index and accrued amount for a specific asset.

##### isEmissionsActive(asset, reward, currentTimestamp?)

Check if emissions are currently active.

#### Static Methods

##### calculateAnnualEmissions(emissionPerSecond, decimals?)

Calculate annual emissions from per-second rate.

##### calculateEmissionAPR(emissionPerSecond, rewardPriceUSD, tvlUSD, decimals?)

Calculate APR from emissions, reward price, and TVL.

## Building

```bash
yarn build
```

## Type Checking

```bash
yarn check-types
```

## Related Packages

- `@neverland-money/contract-types` - Typed ABIs used by these helpers

