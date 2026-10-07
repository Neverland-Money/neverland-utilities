# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.0.0](https://github.com/Neverland-Money/neverland-utilities/compare/@neverland-money/contract-helpers@0.2.0...@neverland-money/contract-helpers@1.0.0) (2026-10-07)

### ⚠ BREAKING CHANGES

- **contract-helpers:** requires `@neverland-money/contract-types` `^1.0.0`.
- **NeverlandUiService:** removed `getBatchTokenDetails` and `getTokenDetails`, which the contract
  no longer exposes. Also removed `getUserPortfolioValue`, `getOptimalClaimOrder`,
  `getUserTokensPaginated`, `calculateUnlockPenalty`, `getOptimalLockDuration` and `simulateClaim`,
  which have no contract counterpart and always threw.
- **NeverlandUiTypes:** `RewardSummary` loses `emissionRewards` and `totalEarned`. `PriceData` loses
  `isStale` and gains `resolvedMask`, `dustPriceFromOracle`, `asOfBlock` and `asOfTimestamp`.
  `UserDashboardData` gains `rawTokenCount`, `nextRawOffset` and `hasMore`. `MarketData` and
  `EmissionData` gain resolution and as-of fields. `ExtendedUserView` loses `rewardsSummary`.
  `UserEmissionAssetBreakdown` is replaced by `UserEmissionBreakdown`, and `OptimalClaimResult` is
  removed.
- **NeverlandUiService:** `getUserRewardsSummary` returns `UserRewardsSummary` (no
  `totalHistorical`), and `getUserEmissionBreakdown` returns `{ breakdown, enumerationResolved }`.
- **NeverlandUiService:** `calculateTotalRewardsUSD` no longer adds emission rewards per summary.
  Pass the user's `EmissionData` as the fourth argument to include them, and the USD value is `'0'`
  when the DUST price row is unresolved instead of stale.
- **DustIncentiveProvider:** removed `getUserAssetData`, which the controller never exposed. Use
  `getUserAssetIndex`.

### Features

- **NeverlandUiService:** add `getProtocolMeta`, `getRegisteredPoolMarkets`, and the static
  `isRowResolved` and `areAllRowsResolved` mask helpers.
- **DustLockHelper:** `getEarlyWithdrawTxData` accepts an optional `maxPenalty`.

### Bug Fixes

- **DustLockHelper:** `getEarlyWithdrawTxData` encodes the full overload signature. The bare name is
  ambiguous in the current DustLock ABI and would throw.
- **NeverlandUiService:** dashboards and bundles follow the contract's `nextRawOffset` and `hasMore`
  cursor instead of assuming raw offsets equal `index * pageSize`. The paginated bundle merges the
  per-page unlock schedule instead of keeping only the first page's, and when a later page reverts
  it returns the pages already loaded instead of discarding the whole bundle.
- **DustLockHelper:** `getUserLocksWithMulticall` and `getUserDustDataWithMulticall` read through
  `callStatic`. They previously tried to send a transaction and failed on read-only providers.
- **DustIncentiveProvider:** `getRewardsData`, `getRewardsDataHumanized` and `isEmissionsActive`
  decode the controller's unnamed outputs by position. They previously returned undefined fields.

### Known issues

- **DustAPRCalculator:** `calculateMarketAPR` always returns the inactive result. It reads fields
  the controller does not return, hides the error, and assumes 18 decimals for every asset. Not
  changed in this release.

# 0.2.0 (2025-10-29)

### Features

- **contract-helpers:** add multicall encode/decode to DustIncentiveProvider and export types;
  chore: update package index exports
  ([f8b175f](https://github.com/Neverland-Money/neverland-utilities/commit/f8b175f80f6dcf9d45dbb0b8839d91c38ce5a879))
- **helpers:** add ClaimRewardsHelper and exports
  ([844f4a0](https://github.com/Neverland-Money/neverland-utilities/commit/844f4a0a5123b2544d4d05c9427b7051ea5c6e32))
- **helpers:** add DustAPRCalculator helper and types
  ([90fa721](https://github.com/Neverland-Money/neverland-utilities/commit/90fa7218fa8cff9eb5d643f542943089981a7bef))
- **helpers:** add DustLockHelper and refactor DustIncentiveProvider; migrate to ABIType; pin
  yarn@4.3.1; monorepo scripts aligned with aave-utilities
  ([6f3c8da](https://github.com/Neverland-Money/neverland-utilities/commit/6f3c8da8fd7449db1be5e950d7b89250143c7a5c))
- **helpers:** add NeverlandUiService helper and export types namespace
  ([4be59ab](https://github.com/Neverland-Money/neverland-utilities/commit/4be59aba63cdb870dce0fb4c459b8c72bcf94c53))
- **helpers:** add VeDustRevenueHelper and exports
  ([34fca67](https://github.com/Neverland-Money/neverland-utilities/commit/34fca678548d1fe994db35db8a9d52f04459c7e0))
- **helpers:** add WETHGatewayLegacyAdapter helper and exports
  ([690cd98](https://github.com/Neverland-Money/neverland-utilities/commit/690cd98c9fb70620d1f3db62a2c761df992ec350))
- **helpers:** export InterestRate enum for WETH legacy adapter usage
  ([63d82da](https://github.com/Neverland-Money/neverland-utilities/commit/63d82daf9504200601abe5ea3499a9b98c600c99))
- **helpers:** pass default contract address to AbiBaseService and align constructors across helpers
  ([db8464d](https://github.com/Neverland-Money/neverland-utilities/commit/db8464d07f216b6ce7b4cf107132b2ea27e37c1f))
