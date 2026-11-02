# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [3.0.0](https://github.com/Neverland-Money/neverland-utilities/compare/@neverland-money/contract-helpers@2.0.0...@neverland-money/contract-helpers@3.0.0) (2026-11-02)

### Breaking Changes

- **contract-helpers:** rename every PascalCase module directory to lowercase kebab-case under both
  `dist/cjs` and `dist/esm`. Update deep imports: `ClaimRewards-contract` to
  `claim-rewards-contract`, `DustAPR-contract` to `dust-apr-contract`,
  `DustIncentiveProvider-contract` to `dust-incentive-provider-contract`, `DustLock-contract` to
  `dust-lock-contract`, `NeverlandUiProvider-contract` to `neverland-ui-provider-contract`,
  `VeDustRevenue-contract` to `ve-dust-revenue-contract`, `WETHGatewayLegacy-contract` to
  `weth-gateway-legacy-contract`, `commons/BaseService` to `commons/base-service`, and
  `interestRate` to `interest-rate`. No root export was removed, so imports from
  `@neverland-money/contract-helpers` are unaffected.
- **contract-helpers:** widen `IncreaseAmountParams.tokenId`, `MergeParams.fromTokenId`,
  `MergeParams.toTokenId` and the claim `ClaimRewardsParams.lockTime` and `tokenId` from `number` to
  `BigNumberish`, so token IDs above 2^53 and `MaxUint256` permanent lock times encode exactly.
  `ClaimRewardsParams.assetAddresses` is now `readonly string[]`. `MarketAPR.totalSupply` is now
  optional because dormant results omit it.
- **NeverlandUiService:** `getProtocolMeta`, `getAllPrices`, `getGlobalStats`, `getMarketData`,
  `getNetworkData`, `getUiBootstrap`, `getUserRewardsSummary`, `getUserDashboard` and
  `getUiFullBundle` now return plain objects and arrays, including the rows nested in dashboards and
  bundles. They no longer expose ethers `Result` positional indexes, `toObject()` or `toArray()`.
  Read fields by name. Quantities remain `bigint`.
- **ClaimRewardsHelper:** the claim builders (`getClaimAllRewardsToSelfTxData`,
  `getClaimRewardsToSelfTxData`, `buildClaimAllRewardsToSelfTxData` and
  `buildClaimRewardsToSelfTxData`) require an explicit `lockTime`; 2.0.0 defaulted a missing value
  to 0, an instant claim. `0` is an instant claim with a 50% toll. A duration in seconds of at least
  28 days creates a timed lock with a toll that slides with the commitment; use 35 days or more,
  because the unlock time rounds down to a whole week. `MaxUint256` creates a permanent lock with no
  toll. A `tokenId` above 0 deposits into that lock and ignores `lockTime`; pass 0. Quote any route
  with the transfer strategy's `previewClaim`.
- **contract-helpers:** the synchronous lending builders no longer set `gasLimit`, because Monad
  bills `gas_limit` times `gas_price` rather than gas used. Upstream `@aave/contract-helpers` filled
  in a fixed Ethereum-mainnet value. This covers the `PoolBundle` supply, borrow, repay and
  repayWithATokens builders (`generateTxData` and `generateSignedTxData`),
  `WETHGatewayService.generateDepositEthTxData`, `generateBorrowEthTxData` and
  `generateRepayEthTxData`, `ERC20Service.approveTxData`, and
  `BaseDebtToken.generateApproveDelegationTxData`. Wallets and ethers estimate gas when it is
  absent.
- **contract-helpers:** `InterestRate.None` now selects variable debt (2) on the `Pool` and
  `PoolBundle` paths, matching the gateway; upstream mapped it to stable debt (1).
  `InterestRate.Stable` still selects stable (1).
- **contract-helpers:** decimal amount conversion throws `RangeError` instead of rounding. This
  covers the exported `valueToWei`, the decimal `Pool` methods, the `WETHGatewayService` native
  methods, and `ERC20Service.isApproved` and `BaseDebtToken.isDelegationApproved` without
  `nativeDecimals`. It throws when an amount is not a base-10 decimal (0x, 0b or 0o prefixes,
  `Infinity`, `NaN`, blanks or separators), is negative, cannot be represented exactly in the
  token's decimals, or exceeds MaxUint256 in base units. Base-10 spellings with surrounding
  whitespace, a leading `+`, fractions such as `1.` or `.5`, and exponents such as `1e-6` still
  work, and `'-1'` keeps its maximum meaning where supported. Round amounts down to the token's
  decimals first.
- **contract-helpers:** `PoolBundle` builders and the synchronous `WETHGatewayService` builders take
  raw amounts as plain unsigned decimal digit strings and throw for empty, whitespace-padded, `+`,
  `0x`, `0b`, `0o`, negative, fractional and exponent strings (`TypeError`), for zero and for values
  above MaxUint256 (`RangeError`). Leading zeros are accepted: `'007'` is 7 and `'000'` is zero.
  `'-1'` still selects the maximum where supported. Upstream accepted 0x-hex amounts; convert them
  with `BigInt(hex).toString()`.
- **contract-helpers:** native borrow rejects an `onBehalfOf` address other than the caller
  (compared case-insensitively) because the gateway cannot encode it.
- **WETHGatewayLegacyAdapter:** `depositETH`, `borrowETH`, `repayETH` and `withdrawETH` reject an
  unset, malformed, zero or native-sentinel gateway. `contract` is now an accessor that throws a
  `TypeError` for such a gateway instead of an eagerly built field, and the constructor builds no
  contract. `getWETHAddress()` reads the checksummed gateway and rejects for an unusable one.
  `depositETH`, `repayETH` and `withdrawETH` reject a zero or native-sentinel `onBehalfOf` (the
  withdrawal recipient). The constructor still accepts any string, ENS names are not resolved as
  gateways, and the populated `to` is the checksummed gateway.
- **WETHGatewayService:** the synchronous builders and decorated native methods, and the native
  `Pool` and `PoolBundle` paths built on them, use the checksummed gateway as the populated `to` and
  as the delegation and approval target for every accepted spelling (0x in any case, unprefixed hex
  or ICAP). ethers would otherwise send an unprefixed or ICAP gateway through ENS resolution.
- **contract-helpers:** decorated native methods return `[]` and log
  `[WethGatewayValidator] You need to pass valid addresses` for an unset or malformed gateway, as in
  upstream; treat `[]` as a failed build. The synchronous builders, the native `PoolBundle` builders
  and the adapter throw for the same configuration. A zero or native-sentinel gateway is not "unset
  or malformed": every decorated method, builder and adapter method throws for it.

### Security Fixes

- Reject zero and native-sentinel (`API_ETH_MOCK_ADDRESS`) native gateway destinations in every
  spelling (0x-prefixed, unprefixed hex and ICAP) in decorated and synchronous transaction builders,
  the native `PoolBundle` builders and the `WETHGatewayLegacyAdapter` populate methods, before a
  transaction can carry native value to either address. The sentinel error reads
  `WETH_GATEWAY must not be the native sentinel <API_ETH_MOCK_ADDRESS>`.
- For native actions the parsed amount is the transaction `value` for deposit (the calldata carries
  no amount), the calldata amount for borrow (no `value`), and both for repay.
- `valueToWei` parses with a linear-time pattern, so inputs with very long digit or whitespace runs
  fail fast instead of taking quadratic time. The accepted spellings, results and error messages are
  unchanged.
- `onBehalfOf` rejects address(0) in every spelling and the keyless `API_ETH_MOCK_ADDRESS` native
  sentinel on the decorated `Pool` and `WETHGatewayService` methods, every `PoolBundle` builder, the
  synchronous `generateDepositEthTxData` and `generateRepayEthTxData`, and the adapter `depositETH`,
  `repayETH` and `withdrawETH`. Supplied aTokens or withdrawn funds sent to either address would be
  lost. Reserve, token and other asset fields still accept the native sentinel.
- `DustIncentiveProvider.getRewardsDataHumanized` now reports zero APR at or after
  `distributionEnd`, using an optional `currentTimestamp` or the provider's latest block time. An
  explicit `currentTimestamp` must be a nonnegative safe integer, otherwise it throws a `TypeError`,
  and the block is read only when TVL, reward price and emissions are all positive. Every APR known
  to be zero (no TVL, price or emissions, or an ended campaign) is now reported as `'0'`, where
  `'0.0000'` could appear before.

### Features

- **contract-helpers:** add the Aave-derived lending services, ported from `@aave/contract-helpers`
  1.36.1 to ethers 6 and `bigint`; none of them exist in 2.0.0. The root exports `Pool`,
  `PoolBundle`, `ERC20Service`, `ERC20_2612Service`, `BaseDebtToken`, `UiPoolDataProvider`,
  `WalletBalanceProvider` and `buildErc2612PermitTypedData`. `WETHGatewayService` is available from
  the `wrapped-native-gateway-contract` deep path. Raw nonces, allowances, delegations and balances
  are `bigint`; `approvedAmount` and `approvedDelegationAmount` return exact strings in normalized
  token units.
- **Pool:** add the finite raw methods `supplyRaw`, `repayRaw`, `supplyWithPermitRaw` and
  `repayWithPermitRaw`. They take exact base-unit `amountRaw` strings and reject zero, max-uint,
  native-sentinel and invalid amounts, addresses and rate modes. `zeroFirst` inserts a zero approval
  before a new finite approval when the current allowance is insufficient and nonzero. Each raw
  approval estimates its own `gas()` instead of reusing the pending-approval table value; a finite
  approval queued behind a zero reset still previews with the table value until the reset is mined.
- **DustLockHelper:** add `DustLockTransactionBuilder` for lock transaction data without a provider,
  and the provider-free `buildClaimAllRewardsToSelfTxData` and `buildClaimRewardsToSelfTxData`.
  Token IDs, amounts and lock times accept exact `BigNumberish` values. Add `getTransferTxData`,
  `getTotalVotingPower`, `readEarlyWithdrawPenaltyAmount`, and a `spender` argument on
  `getDustAllowance`.
- **UiPoolDataProvider:** `getEModes` and `getEModesHumanized` rebuild lending-core 1.1 E-mode
  categories from the E-mode fields embedded in each reserve. Add the export
  `synthesizeEModesFromReserves` and the type `EModeReserveFields` for callers that already hold
  reserves.
- **DustLockHelper:** `getUserLocks`, `getUserLocksWithMulticall` and `getUserDustDataWithMulticall`
  accept an optional `currentTimestamp` for `daysRemaining` and `isExpired`.
- **NeverlandUiService:** add `{ requireComplete: true }` pagination checks,
  `decodeUserEmissionBreakdown` and `materializeContractResult`. `calculateTotalRewardsUSD` reports
  `emissionsIncluded` and leaves unresolved emissions out of both totals.
- **DustAPRCalculator:** `MarketAPR.totalSupplyUSD` exposes the USD supply behind an APR, and is
  re-exported from math-utils with `calculateMarketAPRFromInputs`, `DustMarketAPRInputs` and
  `UnresolvedDustAPRInputError`. Share the exact integer calculation with math-utils and accept an
  explicit protocol clock through `{ nowSeconds }`.
- **contract-helpers:** add an `exports` map. The root `import` condition selects ESM and `require`
  selects CommonJS, and native Node ESM can import `dist/esm` deep paths. Re-export
  `calculateBufferedRepayAmount` from math-utils. The package `LICENSE` now retains the
  `Copyright (c) 2021 Aave` attribution for upstream-derived source; the 2.0.0 license named only
  Neverland.

- **VeDustRevenueHelper:** add the optional `usdRewardTokens` context field, the reward tokens
  counted at $1 per whole token in USD totals, and the additive optional `VeDustRevenueData` fields
  `rewardTokenDecimals` and `unpricedRewardTokens`.

### Bug Fixes

- **DustLockHelper:** `getCreateLockForTxData` encodes `(amount, duration, recipient)` in the
  contract's order. 2.0.0 passed `(to, amount, unlockTime)`. The legacy `unlockTime` field is a
  duration in seconds, not a timestamp.
- **WETHGatewayLegacyAdapter:** `encodeBorrowETH` and `encodeRepayETH` map `InterestRate` to the
  numeric rate mode (1 or 2). 2.0.0 passed the enum string to the ABI encoder, which throws.
- **contract-helpers:** relative to upstream `@aave/contract-helpers` 1.36.1, the decorated lending
  validators and `PoolBundle` `onBehalfOf` reject the zero address. `supplyWithPermit` accepts
  referral code `'0'`. `setUsageAsCollateral` requires a boolean. `supplyWithPermit`,
  `repayWithPermit` and `setUsageAsCollateral` reject the native sentinel.
- **BaseDebtToken:** `approveDelegation` and `generateApproveDelegationTxData` accept 0 to revoke a
  delegation and parse exact uint256 values.
- **contract-helpers:** the exact uint256 parser used by the DustLock, claim, VeDustRevenue and
  delegation builders rejects binary and octal strings and labels decimal and exponent errors. ERC20
  approval amounts follow the same rule.
- **contract-helpers:** gas estimation falls back to the default recommendation for actions missing
  from the table, such as `setEModeUsage`.
- **VeDustRevenueHelper:** query earned rewards in ascending token order, as `RevenueReward`
  requires, and return each column in caller order. The constructor validates `revenueAddress`. The
  batch encoders bound `tokenIds` to 1-64 entries and `rewardTokens` to 1-32.
- **VeDustRevenueHelper:** format each reward token with its own ERC20 `decimals()` instead of
  assuming 6. Stop adding raw units across tokens: `totalRevenueUSD`, `formattedRevenueUSD` and
  `pendingRewardsUSD` now count only USD reward tokens, by default the first registered reward token
  (USDC). `hasRewards` reflects a nonzero raw amount of any token. When a token's `decimals()` read
  fails, that token is excluded and flagged instead of zeroing the result. While USDC is the only
  reward token and every `decimals()` read succeeds, output is unchanged. Check
  `unpricedRewardTokens` before trusting a USD total, and pass `usdRewardTokens` explicitly.
  `getProtocolData()` also returns the optional `unpricedRewardTokens`, listing USD reward tokens
  with unreadable decimals; user data merges those into its own list. With several USD tokens,
  `pendingRewardsUSD` sums the readable ones. When `usdRewardTokens` is omitted and the
  index-enumeration fallback skipped an index, no default USD token is selected: nothing counts,
  `pendingRewardsUSD` is '0.00' and the enumerated tokens are listed as unpriced.
- **contract-helpers:** `valueToWei` and `decimalsToCurrencyUnits` use a module-private bignumber.js
  constructor, so an application's global `BigNumber.config` (DECIMAL_PLACES, ROUNDING_MODE, RANGE)
  no longer changes SDK amount conversions. Decimal `Pool` supply, deposit and repay, and the native
  `withdrawETH` and `borrowETH`, throw `RangeError` before reading allowances when an amount exceeds
  MaxUint256 in base units, instead of returning a redundant MaxUint256 approval for an action that
  cannot encode. `isApproved` and `isDelegationApproved` in decimal mode throw for such amounts
  instead of returning false.
- **contract-helpers:** constructing `Pool`, `PoolBundle`, `WETHGatewayService` or
  `WETHGatewayLegacyAdapter` with an unset, malformed, padded, unprefixed or ICAP gateway no longer
  starts an unawaited ENS lookup. On networks without ENS, such as Monad, that lookup could exit
  Node with an unhandled rejection.
- **DustAPRCalculator:** fix the tuple decoding and token-decimal normalization behind the known
  issue in 2.0.0. `calculateMarketAPR` reads the incentivized token's `totalSupply()` and
  `decimals()`; unresolved inputs reject with `UnresolvedDustAPRInputError`, failed batch entries
  are omitted, and dormant results omit unread supply. `calculateWeightedAverageAPR` weights by USD
  supply and throws `UnresolvedDustAPRInputError` when an active market lacks `totalSupplyUSD`.
  Float prices convert to USD8 exactly instead of through `price * 1e8`.
- **NeverlandUiService:** pagination rejects a `pageSize` that is not a positive safe integer. A
  revert on the first dashboard page now throws instead of returning an empty dashboard
  (`getUiFullBundle` and `getUiFullBundleFromParts` return `null`); later pages still return the
  pages already loaded with `hasMore` set.
- **UiPoolDataProvider:** remove upstream's dead Ethereum-mainnet AMM symbol overrides.

### Dependencies

- **contract-helpers:** `@neverland-money/contract-types` moves from `^2.0.0` to the exact `3.0.0`,
  and the new `@neverland-money/math-utils` dependency is the exact `1.0.0`. `ethers` stays
  `^6.17.0`, and the new `bignumber.js` (`^9.3.1`) and `reflect-metadata` (`^0.1.14`) dependencies
  are caret ranges, so consumers on compatible newer versions install them once.

## [2.0.0](https://github.com/Neverland-Money/neverland-utilities/compare/@neverland-money/contract-helpers@1.0.1...@neverland-money/contract-helpers@2.0.0) (2026-10-07)

### Breaking Changes

- **contract-helpers:** migrate to ethers 6.17.0. Provider and signer inputs use ethers v6 types;
  raw contract integers, rewards, balances, UI values, and gas estimates use native `bigint` instead
  of ethers v5 `BigNumber`. Populated transactions use `TransactionRequest`, utilities are imported
  from the ethers root, and fee reads use `getFeeData`.
- **contract-helpers:** update transaction population and static multicalls to the ethers v6 method
  API. Callers must migrate their providers and replace BigNumber arithmetic with bigint operators.
  Humanized strings and numbers retain their existing representations.

### Bug Fixes

- **contract-helpers:** declare abitype directly because public declarations import it. Nested npm
  installations previously failed with `Cannot find module 'abitype'` even though hoisted installs
  worked. Remove stale generated git metadata from the source manifest.
- **contract-helpers:** require contract-types 2.0.0 with its patched viem dependency, refresh the
  ethers v6 and tslib minimum versions, and run TypeScript checks directly without forwarding an
  unsupported `--` option. The known APR issue remains separate; the calculator's reads and formula
  are preserved while adapting its numeric operations to ethers v6.

## [1.0.1](https://github.com/Neverland-Money/neverland-utilities/compare/@neverland-money/contract-helpers@1.0.0...@neverland-money/contract-helpers@1.0.1) (2026-10-07)

### Bug Fixes

- **contract-helpers:** point `main` at the CommonJS build and add a `module` entry for the ESM
  build. `main` used to point at the ESM build, so `require('@neverland-money/contract-helpers')`
  failed in Node. Bundlers still use the ESM build.
- **contract-helpers:** declare `tslib` as a dependency. The CommonJS build loads it, so requiring
  `dist/cjs` failed with `Cannot find module 'tslib'` unless something else had installed it.
- **contract-helpers:** publish only `dist`, the README and the changelog. The 1.0.0 tarball also
  contained `src/`, the test files and `tsconfig.json`.

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
