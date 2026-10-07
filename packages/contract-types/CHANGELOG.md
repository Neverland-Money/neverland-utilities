# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.0.1](https://github.com/Neverland-Money/neverland-utilities/compare/@neverland-money/contract-types@1.0.0...@neverland-money/contract-types@1.0.1) (2026-10-07)

### Bug Fixes

- **contract-types:** point `main` at the CommonJS build and add a `module` entry for the ESM build.
  `main` used to point at the ESM build, so `require('@neverland-money/contract-types')` failed in
  Node. Bundlers still use the ESM build.
- **contract-types:** declare `tslib` as a dependency. The CommonJS build loads it, so requiring
  `dist/cjs` failed with `Cannot find module 'tslib'` unless something else had installed it.
- **contract-types:** publish only `dist`, the README and the changelog. The 1.0.0 tarball also
  contained `src/`, the test files and `tsconfig.json`, so every ABI shipped three times.

# [1.0.0](https://github.com/Neverland-Money/neverland-utilities/compare/@neverland-money/contract-types@0.2.0...@neverland-money/contract-types@1.0.0) (2026-10-07)

### ⚠ BREAKING CHANGES

- **contract-types:** the six project ABIs now match the current contracts instead of the October
  2025 snapshot. Updated: `dustLockAbi`, `dustLockTransferStrategyAbi`, `dustRewardsControllerAbi`,
  `neverlandDustHelperAbi`, `neverlandUiProviderAbi` and `revenueRewardAbi`. Unchanged: `erc20Abi`,
  `multicall3Abi` and `wethGatewayLegacyAbi`.
- **neverlandUiProviderAbi:** removed `getBatchTokenDetails`, `getTokenDetails`,
  `getExtendedUserView`, `getUserEmissionRewards`, `getUserRevenueRewards` and the lowercase getters
  `dustLock`, `dustOracle`, `dustRewardsController`, `revenueReward` and
  `aaveLendingPoolAddressProvider`. Use `DUST_LOCK()`, `DUST_HELPER()`, `DUST_REWARDS_CONTROLLER()`,
  `REVENUE_REWARD()` and `NEVERLAND_POOL_REGISTRY()` instead. The constructor takes the pool
  registry instead of a pool address provider.
- **neverlandUiProviderAbi:** return structs changed. `RewardSummary` loses `emissionRewards` and
  `totalEarned`. `PriceData` loses `isStale` and gains `resolvedMask`, `dustPriceFromOracle`,
  `asOfBlock` and `asOfTimestamp`. `UserDashboardData` gains `rawTokenCount`, `nextRawOffset` and
  `hasMore`. `MarketData` and `EmissionData` gain resolution and as-of fields.
  `getUserRewardsSummary` drops `totalHistorical` for resolution masks, and
  `getUserEmissionBreakdown` returns structured rows plus `enumerationResolved`.
- **neverlandDustHelperAbi:** the Uniswap pair API (`uniswapPair`, `setUniswapPair`,
  `removeUniswapPair`, `UniswapPairUpdated`) is replaced by `pair`, `setPair`, `removePair`,
  `pairOracle`, and ReClamm and V4 pool configuration. Price outputs named `fromUniswap`,
  `isFromUniswap` and `isPriceFromUniswap` are now `fromOracle`, `isFromOracle` and
  `isPriceFromOracle`.
- **revenueRewardAbi:** removed `initializeV2`, `initializeV3` and `emergencyFixDistributor`.
- **dustLockAbi:** `earlyWithdraw` is now overloaded (`earlyWithdraw(uint256)` and
  `earlyWithdraw(uint256,uint256)`), so ethers v5 callers must use the full signature.

### Features

- **dustLockAbi:** penalty-bounded `earlyWithdraw(uint256,uint256)`, `earlyWithdrawPenaltyAmount`,
  royalty info and transfer validator functions.
- **dustLockTransferStrategyAbi:** `previewClaim`, `version`, `assertActivationState` and the
  `RewardClaimPriced` event.
- **neverlandUiProviderAbi:** `getRegisteredPoolMarkets` and `NEVERLAND_POOL_REGISTRY`.
- **revenueRewardAbi:** `notifyRewardAmountForFollowingEpoch`, `version` and self-repaying loan
  enumeration views.

The ABIs were copied from the compiled `neverland-contracts` sources and checked against Monad
mainnet. `dustLockAbi`, `dustLockTransferStrategyAbi`, `dustRewardsControllerAbi`,
`neverlandDustHelperAbi` and `revenueRewardAbi` are identical to the deployment records, including
parameter and field names, and the live proxy implementations match those records. The new selectors
are present in the live bytecode and the removed ones are absent. `neverlandUiProviderAbi` has no
retained deployed ABI, but the live provider answers the new selectors and reverts on the removed
ones.

# 0.2.0 (2025-10-29)

### Features

- **helpers:** add DustLockHelper and refactor DustIncentiveProvider; migrate to ABIType; pin
  yarn@4.3.1; monorepo scripts aligned with aave-utilities
  ([6f3c8da](https://github.com/Neverland-Money/neverland-utilities/commit/6f3c8da8fd7449db1be5e950d7b89250143c7a5c))
