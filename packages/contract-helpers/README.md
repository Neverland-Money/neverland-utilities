# @neverland-money/contract-helpers

Contract helper classes for interacting with Neverland protocol smart contracts. Provides a clean,
typed API over raw contract calls.

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

The helpers use ethers v5 and load their ABIs from `@neverland-money/contract-types`. Contract
addresses live in `@neverland-money/address-book`.

## Available Helpers

| Helper                     | Contract                                           |
| -------------------------- | -------------------------------------------------- |
| `DustIncentiveProvider`    | `DustRewardsController` reads (emissions, rewards) |
| `ClaimRewardsHelper`       | `DustRewardsController` claim transaction data     |
| `DustLockHelper`           | `DustLock` (veDUST) transaction data and reads     |
| `VeDustRevenueHelper`      | `RevenueReward` plus `DustLock` revenue data       |
| `NeverlandUiService`       | `NeverlandUiProvider` aggregated UI reads          |
| `WETHGatewayLegacyAdapter` | Legacy `WrappedTokenGatewayV3` (with rate mode)    |
| `DustAPRCalculator`        | Emission APR (known issue, see below)              |

## Known issues

`DustAPRCalculator.calculateMarketAPR` currently always returns the inactive result (`apr: 0`,
`isActive: false`). It reads fields the rewards controller does not return, swallows the resulting
error, and assumes 18 decimals for every asset. Use `DustIncentiveProvider.calculateEmissionAPR`
with your own TVL and price inputs until it is fixed.

## Usage

### Emissions: DustIncentiveProvider

```typescript
import { providers } from 'ethers';
import { DustIncentiveProvider } from '@neverland-money/contract-helpers';

const provider = new providers.JsonRpcProvider('https://rpc.monad.xyz');

const incentives = new DustIncentiveProvider({
  provider,
  dustIncentiveProviderAddress: '0x...', // DustRewardsController
});

// Reward configuration for an asset
const data = await incentives.getRewardsData(aTokenAddress, dustTokenAddress);
console.log('Emission per second:', data.emissionPerSecond.toString());
console.log('Distribution end:', data.distributionEnd.toNumber());

// Are emissions running right now?
const active = await incentives.isEmissionsActive(aTokenAddress, dustTokenAddress);

// Unclaimed rewards across several assets
const { rewardTokens, unclaimedAmounts } = await incentives.getAllUserRewards(
  [aToken, variableDebtToken],
  userAddress,
);

// The user's last-synced reward index for one asset
const index = await incentives.getUserAssetIndex(userAddress, aToken, dustTokenAddress);
```

Static helpers: `DustIncentiveProvider.calculateAnnualEmissions(emissionPerSecond, decimals?)` and
`DustIncentiveProvider.calculateEmissionAPR(emissionPerSecond, rewardPriceUSD, tvlUSD, decimals?)`.

### veDUST locks: DustLockHelper

```typescript
import { DustLockHelper } from '@neverland-money/contract-helpers';

const lock = new DustLockHelper({
  provider,
  lockAddress: '0x...', // DustLock
  dustTokenAddress: '0x...', // DUST
});

const locks = await lock.getUserLocks(userAddress);

// Transaction data for a signer to send
const { to, data } = lock.getCreateLockTxData({
  amount: '1000000000000000000',
  lockDuration: 7 * 86400,
});

// Early withdraw. Pass a maximum penalty (DUST, wei) to revert instead of paying more than quoted.
lock.getEarlyWithdrawTxData(tokenId);
lock.getEarlyWithdrawTxData(tokenId, maxPenaltyWei);
```

`getUserLocksWithMulticall` and `getUserDustDataWithMulticall` batch the same reads through
Multicall3.

### UI aggregation: NeverlandUiService

```typescript
import { NeverlandUiService } from '@neverland-money/contract-helpers';
import type { NeverlandUiTypes } from '@neverland-money/contract-helpers';

const ui = new NeverlandUiService('0x...', provider); // NeverlandUiProvider

const bundle = await ui.getUiFullBundle(userAddress);
const prices = await ui.getAllPrices();
```

Reads that can partly fail are fail-soft on-chain, so results carry resolution signals:

- `PriceData.resolvedMask` and `UserRewardsSummary.revenueResolvedMask` / `emissionsResolvedMask`
  are bitmasks aligned with the input arrays. Check a row with
  `NeverlandUiService.isRowResolved(mask, index)`.
- `EmissionData.resolved`, `MarketData.totalValueLockedUSDResolved` and
  `UserEmissionBreakdown.enumerationResolved` are booleans. `false` means a read failed, not that
  the value is genuinely zero.
- Every aggregate read reports `asOfBlock` and `asOfTimestamp`.

User dashboards are paginated over the raw DustLock enumeration, and pages are compacted to live
veNFTs. The helper follows the contract's `nextRawOffset` / `hasMore` cursor for you. If you call
`getUserDashboard` on the contract directly, never page by `tokenIds.length`.

### Revenue: VeDustRevenueHelper

```typescript
import { VeDustRevenueHelper } from '@neverland-money/contract-helpers';

const revenue = new VeDustRevenueHelper({
  provider,
  chainId: 143,
  revenueAddress: '0x...', // RevenueReward
  dustLockAddress: '0x...', // DustLock
});

const protocol = await revenue.getProtocolData();
const mine = await revenue.getUserVeDustRevenueData(userAddress);
```

### Claims: ClaimRewardsHelper

```typescript
import { ClaimRewardsHelper } from '@neverland-money/contract-helpers';

const claim = new ClaimRewardsHelper({ provider, chainId: 143 });

const { to, data } = claim.getClaimAllRewardsToSelfTxData({
  assetAddresses: [aToken, variableDebtToken],
  chainId: 143,
  rewardsControllerAddress: '0x...',
  lockTime: 0, // 0 for an instant claim
  tokenId: 0,
});
```

### Raw contract access

Every helper extends `AbiBaseService`, so you can reach the underlying ethers contract and
interface:

```typescript
const contract = incentives.getContractInstance(controllerAddress);
const calldata = incentives.encodeFunctionData('getRewardsList', []);
```

## Building

```bash
yarn build
```

## Related Packages

- `@neverland-money/contract-types` - Typed ABIs used by these helpers
- `@neverland-money/address-book` - Deployed contract addresses
