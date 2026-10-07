# Neverland Contract Helpers

<p>
  <a href="./README.md"><img src="https://img.shields.io/badge/Neverland%20Contract%20Helpers-v1.0.1%20%C2%B7%20Monad%20mainnet%20%28143%29%20%C2%B7%20MIT-192170?style=for-the-badge" alt="Neverland Contract Helpers v1.0.1 - Monad mainnet (143) - MIT"/></a>
</p>

Contract helper classes for interacting with Neverland protocol smart contracts. Provides a clean,
typed API over raw contract calls.

## Package

The package is published as:

```bash
npm install @neverland-money/contract-helpers
```

The helpers use ethers v5 and load their ABIs from `@neverland-money/contract-types`. Contract
addresses live in `@neverland-money/address-book`.

The published package includes:

- `dist/esm/`: ES module build, used by bundlers through the `module` field.
- `dist/cjs/`: CommonJS build, used by `require` through the `main` field.
- `README.md` and `CHANGELOG.md`.

Example import:

```typescript
import { DustLockHelper } from '@neverland-money/contract-helpers';
```

## Features

- Type-safe: full TypeScript support with proper typing.
- Easy to use: simple class-based API.
- Modular: import only what you need.
- Testable: easily mock for testing.
- Safe: built-in validation and error handling.

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

## Known Issues

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
veNFTs. The helper follows the contract's `nextRawOffset` / `hasMore` cursor for you. When a page
after the first reverts, the dashboard and the bundle return the pages already loaded with `hasMore`
still `true` and `nextRawOffset` at the page to retry. If you call `getUserDashboard` on the
contract directly, never page by `tokenIds.length`.

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

### Raw Contract Access

Every helper extends `AbiBaseService`, so you can reach the underlying ethers contract and
interface:

```typescript
const contract = incentives.getContractInstance(controllerAddress);
const calldata = incentives.encodeFunctionData('getRewardsList', []);
```

## Development

Use Node `24` via the repository `.nvmrc`. Build and test from the repository root:

```bash
yarn install
yarn build
yarn test packages/contract-helpers
```

The tests mock every contract read, so they need neither a build nor an RPC endpoint.

## Layout

- `src/<Name>-contract/`: one folder per contract, with `index.ts` for the helper and `types.ts` for
  its types.
- `src/commons/`: shared `AbiBaseService` code.
- `src/index.ts`: package exports.
- `src/abiUsage.test.ts` and `src/**/index.test.ts`: tests for the helpers and their ABI usage.
- `dist/`: generated build output, not committed.

## Related Packages

- `@neverland-money/contract-types`: typed ABIs used by these helpers.
- `@neverland-money/address-book`: deployed contract addresses.

## License And Notices

See [LICENSE](../../LICENSE). Released under the MIT License.

<p>
  <a href="https://neverland.money"><img src="https://img.shields.io/badge/Website-neverland.money-480052?style=for-the-badge&logo=safari&logoColor=white" height="22" alt="Website"/></a>
  <a href="https://app.neverland.money"><img src="https://img.shields.io/badge/App-app.neverland.money-192170?style=for-the-badge&logo=ethereum&logoColor=white" height="22" alt="App"/></a>
  <a href="https://x.com/Neverland_Money"><img src="https://img.shields.io/badge/%F0%9D%95%8F-%40Neverland__Money-1DA1F2?style=for-the-badge" height="22" alt="X"/></a>
  <a href="https://discord.com/invite/neverland"><img src="https://img.shields.io/badge/Discord-Join%20Server-5865F2?style=for-the-badge&logo=discord&logoColor=white" height="22" alt="Discord"/></a>
</p>
