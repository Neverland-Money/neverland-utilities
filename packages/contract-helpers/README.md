# Neverland Contract Helpers

<p>
  <a href="https://github.com/Neverland-Money/neverland-utilities/blob/main/packages/contract-helpers/README.md"><img src="https://img.shields.io/badge/Neverland%20Contract%20Helpers-v3.0.0%20%C2%B7%20Monad%20mainnet%20%28143%29%20%C2%B7%20MIT-192170?style=for-the-badge" alt="Neverland Contract Helpers v3.0.0 - Monad mainnet (143) - MIT"/></a>
</p>

Contract helpers for Neverland lending, DUST locks, emissions and revenue rewards. Version 3.0.0
uses ethers **^6.17.0** for every helper and depends on contract-types exactly **3.0.0** and
math-utils exactly **1.0.0**. `ethers`, `bignumber.js` and `reflect-metadata` are caret ranges, so a
compatible newer version already in your application is shared with this package instead of being
installed twice.

## Package

Install the package:

```bash
npm install @neverland-money/contract-helpers
```

Example import:

```typescript
import { JsonRpcProvider } from 'ethers';
import { Pool, PoolBundle, UiPoolDataProvider } from '@neverland-money/contract-helpers';

const provider = new JsonRpcProvider(rpcUrl);
const pool = new Pool(provider, { POOL: poolAddress, WETH_GATEWAY: gatewayAddress });
const bundle = new PoolBundle(provider, { POOL: poolAddress, WETH_GATEWAY: gatewayAddress });
const reader = new UiPoolDataProvider({ provider, chainId: 143, uiPoolDataProviderAddress });
```

Root `import` selects the ESM runtime and declarations; `require` selects CommonJS. NodeNext
consumers can use ordinary ethers 6 types in either mode. Match explicit deep imports to that mode:
`dist/esm` for ESM and `dist/cjs` for CommonJS. Both extensionless module paths and explicit `.js`
paths are supported, including directory modules such as `dist/esm/erc20-contract`, and native Node
ESM can import the `dist/esm` deep paths. The two runtime graphs have separate class identities;
keep providers, contracts and constructors in the same graph.

## Requirements

- **Node.js:** the manifest sets no `engines` field. The compiled output targets ES2020 (native
  `bigint`, optional chaining and nullish coalescing). The repository validates the packages on Node
  24 only; other runtimes are untested.
- **ethers and bignumber.js:** ethers `^6.17.0` and bignumber.js `^9.3.1` are installed as
  dependencies. Pass ethers 6 providers, signers and `TransactionRequest` values.
- **TypeScript:** 5.0 or newer for the shipped declarations, which use `export type *`. They are
  tested with 5.9.3 and 6.0.3 under `strict` and `skipLibCheck: false`.
- **Module resolution:** `nodenext` and `bundler` are tested on both compilers, and 5.9.3 also runs
  `node10`. On TypeScript 6, `node10` is deprecated and needs `"ignoreDeprecations": "6.0"`; that
  combination is not in the test matrix. `node16` with `skipLibCheck: false` is not supported,
  because the `abitype` declarations that viem's types import are ESM-only; use `nodenext` or keep
  `skipLibCheck` on.

## Canonical Lending API

The Aave-derived lending services below are new in 3.0.0; contract-helpers 2.0.0 shipped only the
native Neverland helpers. They were ported from `@aave/contract-helpers` 1.36.1 to ethers 6 and
`bigint`. The root exports every service in this table except `WETHGatewayService`, which is
available from the `wrapped-native-gateway-contract` deep path.

| Service                 | Retained methods and units                                                                                                                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Pool`                  | `getReserveData`; `deposit`, `supply`, `borrow`, `repay`, `withdraw`, `supplyWithPermit`, `repayWithPermit`, `repayWithATokens`, `setUsageAsCollateral`, `setUserEMode`; decimal `amount` inputs; transaction callbacks                                                            |
| `Pool` raw policy       | `supplyRaw`, `repayRaw`, `supplyWithPermitRaw`, `repayWithPermitRaw`; exact unsigned base-unit `amountRaw` strings                                                                                                                                                                 |
| `PoolBundle`            | `supplyTxBuilder.generateTxData/generateSignedTxData/getApprovedAmount`, `borrowTxBuilder.generateTxData`, `repayTxBuilder.generateTxData/generateSignedTxData`, `repayWithATokensTxBuilder.generateTxData`; base-unit `amount` strings, synchronous `TransactionRequest` builders |
| `WETHGatewayService`    | `depositETH`, `borrowETH`, `withdrawETH`, `repayETH`; synchronous `generateDepositEthTxData`, `generateBorrowEthTxData`, `generateRepayEthTxData`; deep path only                                                                                                                  |
| `ERC20Service`          | `decimalsOf`, `getTokenData`, `isApproved`, `approve`, `approveTxData`, `approvedAmount`, `allowanceRaw`                                                                                                                                                                           |
| `ERC20_2612Service`     | `getNonce`: `Promise<bigint \| null>` using standard `nonces(address)`                                                                                                                                                                                                             |
| `BaseDebtToken`         | `approveDelegation`, `generateApproveDelegationTxData`, `isDelegationApproved`, `approvedDelegationAmount`, `borrowAllowanceRaw`                                                                                                                                                   |
| `UiPoolDataProvider`    | `getReservesList`, `getReservesData`, `getUserReservesData`, `getReservesHumanized`, `getUserReservesHumanized`, `getEModes`, `getEModesHumanized`; the active lending 1.1 decoder                                                                                                 |
| `WalletBalanceProvider` | `balanceOf`, `batchBalanceOf`, `getUserWalletBalancesForLendingPoolProvider`; bigint balances; `batchBalanceOf` accepts a block tag, including zero                                                                                                                                |

Raw amounts, rates, indexes, nonces, balances, allowance and delegation reads are bigint, including
all small Solidity integer widths. Humanized amounts/indexes/rates remain exact strings; bounded
metadata such as decimals, timestamps and category IDs uses checked `getNumber` conversion.
`approvedAmount` and `approvedDelegationAmount` return **exact strings in normalized token units**.
For example raw `900719925474099312345678n` at six decimals yields `'900719925474099312.345678'`.
`approvedAmount` retains `'-1'` for native/unlimited allowances; delegation adds no sentinel. Use
`allowanceRaw` and `borrowAllowanceRaw` for base-unit bigint comparisons.

Read shapes differ between the two families. The native helpers (`NeverlandUiService`,
`DustIncentiveProvider`, `DustLockHelper`, `VeDustRevenueHelper`) return plain objects and arrays.
The Aave-derived raw reads still return ethers `Result` values, which are read-only and index both
by position and by name: `Pool.getReserveData`, `UiPoolDataProvider.getReservesData` and
`getUserReservesData`, and `WalletBalanceProvider.getUserWalletBalancesForLendingPoolProvider`. When
you need a plain copy, call `materializeContractResult(pool.iface, 'getReserveData', result)` with
the service's `iface` and the ABI function name. `getReservesList`, `batchBalanceOf`, the humanized
`UiPoolDataProvider` methods and the other lending reads return plain arrays, objects and scalars.

`IERC20ServiceInterface` is now an equivalent object type alias. Consumers that augmented the old
interface through declaration merging must move those additions into their own extended type.

The lending provider ABI includes the original stable-debt and embedded E-mode tuple fields. Native
`NeverlandUiService` targets a different core contract and remains separate. Native
`IncentiveDataHumanized` keeps its Dust shape; the generic nested incentive DTO is
`LendingIncentiveDataHumanized`.

Native lending transactions reuse `WETHGatewayLegacyAdapter` encoding. Borrow and repay explicitly
pass the stable/variable rate mode (1/2). The former no-rate upstream gateway selectors are removed.
The shared synchronous encoders map `InterestRate.Stable` to 1 and every other value, including
`InterestRate.None`, to variable debt (2), the same numeric mode as the existing async methods.
Native deposit/withdraw and all existing Neverland helper interfaces remain.

### E-Mode Categories

`getEModesHumanized` and `getEModes` rebuild lending-core 1.1 E-mode categories from the fields each
reserve embeds: `eModeCategoryId`, `eModeLtv`, `eModeLiquidationThreshold`, `eModeLiquidationBonus`
and `eModeLabel`. They do one `getReservesHumanized` read. `getEModesHumanized` returns the
string-bitmap shape that math-utils `formatReserves` takes as `eModes`; `getEModes` converts the
same data to numeric LTV fields and bigint bitmaps. Collateral membership follows `eModeCategoryId`
alone, even for a reserve with a zero base LTV; the borrowable bitmap also requires
`borrowingEnabled`. A reserve whose `originalId` does not fit the 256-bit bitmap throws a
`RangeError`.

Callers that already hold humanized reserves can skip the second read with
`synthesizeEModesFromReserves`, which takes any `EModeReserveFields` array:

```typescript
import { synthesizeEModesFromReserves } from '@neverland-money/contract-helpers';
import type { EmodeDataHumanized } from '@neverland-money/contract-helpers';

const { reservesData } = await reader.getReservesHumanized({ lendingPoolAddressProvider });
const eModes: EmodeDataHumanized[] = synthesizeEModesFromReserves(reservesData);
```

Category price sources are not part of the reserve fields. For a category that has an E-mode price
source, the rebuilt categories alone are not enough: pass `legacyEMode`, including its resolved
`priceInMarketReferenceCurrency`, to math-utils `formatUserSummary`.

## Gas And Transaction Callbacks

Monad bills `gas_limit` times `gas_price`, not the gas a transaction uses, so an inflated limit
costs real money. The synchronous builders therefore return no `gasLimit`:

- the `PoolBundle` supply, borrow, repay and repayWithATokens builders (`generateTxData` and
  `generateSignedTxData`);
- `WETHGatewayService.generateDepositEthTxData`, `generateBorrowEthTxData` and
  `generateRepayEthTxData`;
- `ERC20Service.approveTxData` and `BaseDebtToken.generateApproveDelegationTxData`.

Let the wallet or ethers estimate when you send:

```typescript
import { PoolBundle } from '@neverland-money/contract-helpers';

const bundle = new PoolBundle(provider, { POOL: poolAddress, WETH_GATEWAY: gatewayAddress });
const request = bundle.supplyTxBuilder.generateTxData({
  user: userAddress,
  reserve: tokenAddress,
  amount: '1000000', // base units; PoolBundle takes raw amounts
});
// request.gasLimit is undefined, so the signer estimates gas when it sends.
const response = await signer.sendTransaction(request); // any ethers Signer
```

The callback builders (`Pool`, `ERC20Service.approve`, `BaseDebtToken.approveDelegation` and the
gateway methods) return `{ txType, tx, gas }` entries. `tx()` estimates gas when you call it, at
send time. Native helpers keep the provider's direct estimate. Lending callbacks add a floor-rounded
30% surplus, or an explicit nonnegative integer override. When a protocol action is attached, as the
`Pool` methods do, they also raise an estimate at or below that action's table `limit` up to the
table's `recommended` value, such as 300000 for `supply`. Actions missing from the table, such as
`setEModeUsage`, fall back to the default recommendation.

`gas()` is a preview that returns `{ gasLimit, gasPrice }` as decimal strings and rejects when the
provider reports no gas price. While an approval earlier in the same array is still pending, the
action cannot be estimated, so `gas()` returns upstream's table value instead. Those numbers come
from Ethereum mainnet, not from Monad measurements. Call `gas(true)` after the approval is mined to
estimate for real. The raw methods snapshot their earlier approvals, so each raw approval estimates
its own `gas()`; a finite approval queued behind a `zeroFirst` reset still previews with the table
value until the reset is mined.

## Finite Raw Transactions And Permit Data

Only these five raw parameter types are exported from the Pool barrel and package root:
`PoolSupplyRawParams`, `PoolRepayRawParams`, `PoolPermitRawParams`, `PoolSupplyWithPermitRawParams`,
and `PoolRepayWithPermitRawParams`. Retained decimal DTOs stay at
`@neverland-money/contract-helpers/dist/{esm,cjs}/pool-contract/pool-types`.

```typescript
import {
  InterestRate,
  Pool,
  buildErc2612PermitTypedData,
  calculateBufferedRepayAmount,
} from '@neverland-money/contract-helpers';
import type { PoolRepayWithPermitRawParams } from '@neverland-money/contract-helpers';
import type { SignatureLike } from 'ethers';

const pool = new Pool(provider, { POOL: poolAddress });
const amountRaw = calculateBufferedRepayAmount({
  debtRaw: '1000000000000000000',
  variableBorrowRateRay: '50000000000000000000000000',
  windowSeconds: 600,
}); // '1000000951294211240'

const data = buildErc2612PermitTypedData({
  domain: { name: 'Agora Dollar', version: '1', chainId: 143, verifyingContract: tokenAddress },
  owner: userAddress,
  spender: poolAddress,
  valueRaw: amountRaw,
  nonceRaw: '9007199254740993',
  deadline: 1792916073,
});
// The caller establishes token/domain support and obtains the signature separately.
const signature: SignatureLike = signedPermit;
const params: PoolRepayWithPermitRawParams = {
  user: userAddress,
  reserve: tokenAddress,
  amountRaw,
  interestRateMode: InterestRate.Variable,
  deadline: data.message.deadline,
  signature,
};
const transactions = await pool.repayWithPermitRaw(params);
```

`buildErc2612PermitTypedData` requires an explicit name/version/chainId/verifyingContract domain. It
returns string numeric fields and never converts the nonce to Number. Its `types` object
intentionally omits `EIP712Domain`, which is what ethers `signTypedData(domain, types, message)` and
viem expect. A caller that builds a raw `eth_signTypedData_v4` payload must add the `EIP712Domain`
type itself:

```typescript
const payload = JSON.stringify({
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    ...data.types,
  },
  primaryType: data.primaryType,
  domain: data.domain,
  message: data.message,
});
```

`SignatureLike` is ethers 6's union: serialized 65-byte, compact 64-byte and ethers 6 object forms
are accepted. Ethers 5 bytes/_vs/recoveryParam forms are outside the 3.0.0 API. Signature primitives
and raw inputs are captured before awaits and deferred callbacks.

The buffer accepts Number `windowSeconds` from 0 through 3600, default 600, including every
remaining horizon 0..600. It compounds conservatively, adds one atom, and rejects invalid inputs and
uint256 overflow. Prepare one amount and reuse it for the permit, approval and calldata. Raw methods
reject zero amounts, max-uint/unbounded amounts, invalid addresses, native sentinels and invalid
rate modes. Exact approvals use `amountRaw`; `zeroFirst: true` inserts zero before a new finite
approval only when the current insufficient allowance is nonzero. Adequate allowances skip approval.
Existing decimal methods retain their legacy approval/sentinel policy.

## Breaking Migration To 3.0.0

### From @neverland-money/contract-helpers 2.0.0

2.0.0 shipped only the native helpers on ethers 6, so the lending services need no migration. Update
the deep paths, the changed types and the runtime behavior below. Deep paths changed under both
`dist/esm` and `dist/cjs`. No root export was removed, so imports from the package root keep
working.

| Kind      | In 2.0.0                                                                               | In 3.0.0                                                                                                                                                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deep path | `ClaimRewards-contract`                                                                | `claim-rewards-contract`                                                                                                                                                                                                                                   |
| Deep path | `DustAPR-contract`                                                                     | `dust-apr-contract`                                                                                                                                                                                                                                        |
| Deep path | `DustIncentiveProvider-contract`                                                       | `dust-incentive-provider-contract`                                                                                                                                                                                                                         |
| Deep path | `DustLock-contract`                                                                    | `dust-lock-contract`                                                                                                                                                                                                                                       |
| Deep path | `NeverlandUiProvider-contract`                                                         | `neverland-ui-provider-contract`                                                                                                                                                                                                                           |
| Deep path | `VeDustRevenue-contract`                                                               | `ve-dust-revenue-contract`                                                                                                                                                                                                                                 |
| Deep path | `WETHGatewayLegacy-contract`                                                           | `weth-gateway-legacy-contract`                                                                                                                                                                                                                             |
| Deep path | `commons/BaseService`                                                                  | `commons/base-service`                                                                                                                                                                                                                                     |
| Deep path | `interestRate`                                                                         | `interest-rate`                                                                                                                                                                                                                                            |
| Type      | `IncreaseAmountParams.tokenId`, `MergeParams.fromTokenId` and `toTokenId`: `number`    | `BigNumberish`                                                                                                                                                                                                                                             |
| Type      | `ClaimRewardsParams.lockTime` and `tokenId`: optional `number`                         | `lockTime: BigNumberish` (required), `tokenId?: BigNumberish`                                                                                                                                                                                              |
| Type      | `ClaimRewardsParams.assetAddresses`: `string[]`                                        | `readonly string[]`                                                                                                                                                                                                                                        |
| Type      | `MarketAPR.totalSupply`: `string`                                                      | `totalSupply?: string`; dormant results omit it                                                                                                                                                                                                            |
| Runtime   | `NeverlandUiService` reads return ethers `Result` values with positional indexes       | `getProtocolMeta`, `getAllPrices`, `getGlobalStats`, `getMarketData`, `getNetworkData`, `getUiBootstrap`, `getUserRewardsSummary`, `getUserDashboard` and `getUiFullBundle` return plain objects with no positional indexes and no `toObject` or `toArray` |
| Runtime   | A missing claim `lockTime` meant 0, an instant claim                                   | `lockTime` is required; see [Claims](#claims-claimrewardshelper)                                                                                                                                                                                           |
| Runtime   | A reverted first dashboard page returned an empty dashboard with `hasMore: true`       | `getUserDashboard` and `getUiFullBundlePaginated` throw; `getUiFullBundle` and `getUiFullBundleFromParts` return `null`                                                                                                                                    |
| Runtime   | `DustAPRCalculator.calculateMarketAPR` returned an inactive zero result on any failure | Unresolved inputs reject with `UnresolvedDustAPRInputError`; `calculateBatchAPR` omits failed markets                                                                                                                                                      |
| Runtime   | `calculateWeightedAverageAPR` weighted by raw `totalSupply`                            | Weights by `totalSupplyUSD` and throws when an active market lacks it                                                                                                                                                                                      |
| Runtime   | `VeDustRevenueHelper` batch encoders accepted any array length                         | `tokenIds` must hold 1-64 entries and `rewardTokens` 1-32                                                                                                                                                                                                  |

### From @aave/contract-helpers 1.36.1

For applications that aliased `@aave/contract-helpers`. Each row lists the upstream deep path under
`dist/esm` or `dist/cjs` and its replacement; the mapping is recorded in the repository's
`upstream-provenance.json`.

| Upstream path                                 | Neverland path                    | Notes                                                                                                                      |
| --------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `baseDebtToken-contract`                      | `debt-token-contract`             | `BaseDebtToken`                                                                                                            |
| `erc20-2612`                                  | `erc20-permit-contract`           | `ERC20_2612Service`                                                                                                        |
| `erc20-contract`                              | `erc20-contract`                  | `ERC20Service`                                                                                                             |
| `v3-wethgateway-contract`                     | `wrapped-native-gateway-contract` | `WETHGatewayService`                                                                                                       |
| `v3-UiPoolDataProvider-legacy-contract`       | `ui-pool-data-provider-contract`  | `LegacyUiPoolDataProvider` is now `UiPoolDataProvider`                                                                     |
| `v3-pool-contract`, `v3-pool-contract-bundle` | `pool-contract`                   | `Pool` and `PoolBundle` share one module; `LendingPoolMarketConfigV3` is now `PoolConfig`                                  |
| `wallet-balance-provider`                     | `wallet-balance-provider`         | `WalletBalanceProvider`                                                                                                    |
| `commons/BaseService`                         | `commons/base-service`            | The factory-based `BaseService` is replaced by `AbiBaseService`                                                            |
| `commons/gasStation`                          | `commons/gas-station`             | `estimateGas`                                                                                                              |
| `v3-UiIncentiveDataProvider-contract`         | none                              | `UiIncentiveDataProvider` is not shipped. Its nested DTO types remain as `LendingIncentiveDataHumanized` and related types |

Use `@neverland-money/contract-helpers` and `@neverland-money/math-utils`; historical npm aliases
such as `@aave/contract-helpers` may remain only as application migration references. There is no
branded SDK namespace or compatibility alias. Remove V2, faucet, incentive-controller, modern UI,
governance-token and staking imports/dead branches. Remove rollup encoder calls/config and
`useOptimizedPath`/`encodedTxData`; keep the ordinary builders. Remove unused swap, migration,
liquidation, flash-liquidation and implicit-domain `signERC20Approval` wrappers. The owned ABIs are
contract-types `lendingOracleAbi` and `protocolDataProviderAbi`, which replace `aaveOracleAbi` and
`aaveProtocolDataProviderAbi`.

Remove ethers 5 providers, BigNumber calls, legacy TypeChain imports and old signature forms. Use
ethers 6 `Provider`, `TransactionRequest`, bigint operators, `getFeeData` and
`contract.method.populateTransaction/staticCall`. Convert bigint nonces with `.toString()` at typed
JSON boundaries. Update numeric allowance callers to consume exact normalized strings or named raw
bigint readers. Keep `PoolBundle` base-unit amounts distinct from decimal `Pool.amount`. The
behavior changes from upstream are:

- The synchronous builders return no `gasLimit`; see
  [Gas And Transaction Callbacks](#gas-and-transaction-callbacks).
- `InterestRate.None` selects variable debt (2) on the `Pool` and `PoolBundle` paths. Upstream
  mapped it to stable debt (1). `InterestRate.Stable` still selects stable.
- The decorated lending validators and `PoolBundle` `onBehalfOf` reject the zero address.
  `supplyWithPermit`, `repayWithPermit` and `setUsageAsCollateral` reject the native sentinel,
  `setUsageAsCollateral` requires a boolean, and `supplyWithPermit` accepts referral code `'0'`.
- `approveDelegation` and `generateApproveDelegationTxData` accept `'0'` to revoke a delegation and
  parse exact uint256 amounts.
- `getEModes` and `getEModesHumanized` rebuild categories; see
  [E-Mode Categories](#e-mode-categories).

SDK-only verification does not establish application integration, browser, live-chain or deployment
acceptance.

## Shared Display Math

`DustLockHelper.calculateVeDustPower`, `DustIncentiveProvider.calculateAnnualEmissions`,
`DustIncentiveProvider.calculateEmissionAPR` and DustAPR calculations continue to use shared native
math from math-utils. The dependency stays one-way from helpers to math. Pass `currentTimestamp` to
the veDUST estimate, or the final timestamp argument to the merged/increase estimates, to use your
application's protocol clock. Omitting it retains the wall-clock default.

## Available Helpers

| Helper                       | Contract                                           |
| ---------------------------- | -------------------------------------------------- |
| `DustIncentiveProvider`      | `DustRewardsController` reads (emissions, rewards) |
| `ClaimRewardsHelper`         | `DustRewardsController` claim transaction data     |
| `DustLockHelper`             | `DustLock` (veDUST) transaction data and reads     |
| `DustLockTransactionBuilder` | `DustLock` transaction data without a provider     |
| `VeDustRevenueHelper`        | `RevenueReward` plus `DustLock` revenue data       |
| `NeverlandUiService`         | `NeverlandUiProvider` aggregated UI reads          |
| `WETHGatewayLegacyAdapter`   | Legacy `WrappedTokenGatewayV3` (with rate mode)    |
| `DustAPRCalculator`          | DUST emission APR with explicit unresolved inputs  |

## Provider-Free Transactions

Use `buildClaimAllRewardsToSelfTxData` or `buildClaimRewardsToSelfTxData` for reward claims without
constructing a provider. They accept the same parameters as `ClaimRewardsHelper` methods, including
the required `lockTime`; the finite claim's `amount` is a human DUST decimal string with 18
decimals. `lockTime` and `tokenId` accept ethers `BigNumberish`, including `MaxUint256` permanent
lock times and IDs above 2^53.

Construct `DustLockTransactionBuilder({ lockAddress, dustTokenAddress })` to use the lock
`get*TxData` methods without a provider. `DustLockHelper` shares this encoder and adds reads. Raw
amounts and token IDs are validated as uint256; JavaScript numbers must be safe integers. The parser
accepts decimal and `0x` hex strings only, so binary and octal prefixes, decimals and exponents are
rejected with a labeled error. Revenue batch builders also accept readonly arrays of bigint, integer
strings, or safe numbers.

`getCreateLockForTxData({ amount, unlockTime, to })` encodes amount, duration, recipient in the
contract's order. The legacy `unlockTime` field means a **duration in seconds**. The returned
transaction target remains the configured lock address. `getTransferTxData({ from, to, tokenId })`
encodes the three-argument `safeTransferFrom`. For early withdrawal, omitting `maxPenalty` selects
the one-argument overload; supplying `0n` selects the two-argument overload with a zero cap.

Strict lock reads include `getLockInfo(tokenId)`, `getTotalVotingPower()`, and
`readEarlyWithdrawPenaltyAmount(tokenId)`. The latter two return raw bigint values.
`getDustAllowance(userAddress, spender?)` defaults to the configured lock address. These methods
propagate RPC errors; callers retain control of retries, batching, and unresolved UI states.

Legacy aggregate lock and revenue convenience methods still use numeric token IDs and best-effort
fallbacks. They can omit failed reads or return zero/empty aggregates after an RPC failure. Use the
strict reads and your own aggregation when large token IDs or a complete, attributable result are
required; the aggregate methods do not establish that every underlying read succeeded.

## DUST Market APR

`DustAPRCalculator.calculateMarketAPR` reads the controller's positional reward tuple and the
incentivized token's `totalSupply()` and `decimals()`. Supply is normalized to DUST's 18 decimals.
`tokenPrices` maps lowercase token addresses to float USD prices; they convert to USD8 exactly,
truncating beyond eight decimals, and a missing, nonpositive or nonfinite price rejects. The
optional final `{ nowSeconds }` argument accepts a safe integer number or bigint; pass your
application's protocol time when it differs from the system clock.

`calculateMarketAPRFromInputs` is exported from both helpers and math-utils, with one implementation
in math-utils. It accepts raw bigint `emissionPerSecond`, `distributionEnd`, and `nowSeconds`.
Active campaigns additionally require `totalSupplyRaw`, numeric `assetDecimals`, and positive bigint
`rewardPriceUsd8`/`assetPriceUsd8`. The result's `apr` is a percentage truncated to two decimal
places; `annualEmissions` and `totalSupply` retain raw integer strings. The formula annualizes the
current emission rate over 365 days and assumes an 18-decimal DUST reward.

Live results also carry `totalSupplyUSD`, the APR's USD denominator: supply normalized to 18
decimals times the asset's USD8 price, as a decimal string. Weight cross-market averages by it,
because raw `totalSupply` is in each asset's own decimals. `calculateWeightedAverageAPR` weights the
active markets by `totalSupplyUSD`, leaves dormant markets out instead of counting them as 0%, and
returns 0 when no active market has a positive USD supply. It throws `UnresolvedDustAPRInputError`
when an active market lacks a valid `totalSupplyUSD`.

A dormant campaign returns `isActive: false` and `apr: 0`, omitting unread supply and annual
emissions. Missing prices, invalid inputs, and a live zero denominator reject with
`UnresolvedDustAPRInputError`; RPC errors propagate. Batch calculation omits failed market keys.
This is a breaking correction to the previous inactive-zero fallback. A small active APR may
truncate to zero while `isActive` remains true. The separate incentive display helper's zero-TVL
behavior is unchanged. Multiple reads do not promise a common block snapshot.

## Usage

### Emissions: DustIncentiveProvider

```typescript
import { JsonRpcProvider, getNumber } from 'ethers';
import { DustIncentiveProvider } from '@neverland-money/contract-helpers';

const provider = new JsonRpcProvider('https://rpc.monad.xyz');

const incentives = new DustIncentiveProvider({
  provider,
  dustIncentiveProviderAddress: '0x...', // DustRewardsController
});

// Reward configuration for an asset
const data = await incentives.getRewardsData(aTokenAddress, dustTokenAddress);
console.log('Emission per second:', data.emissionPerSecond.toString());
console.log('Distribution end:', getNumber(data.distributionEnd));

// Are emissions running right now?
const active = await incentives.isEmissionsActive(aTokenAddress, dustTokenAddress);

// Unclaimed rewards across several assets
const { rewardTokens, unclaimedAmounts } = await incentives.getAllUserRewards(
  [aTokenAddress, variableDebtTokenAddress],
  userAddress,
);

// The user's last-synced reward index for one asset
const index = await incentives.getUserAssetIndex(userAddress, aTokenAddress, dustTokenAddress);
```

Static helpers: `DustIncentiveProvider.calculateAnnualEmissions(emissionPerSecond, decimals?)` and
`DustIncentiveProvider.calculateEmissionAPR(emissionPerSecond, rewardPriceUSD, tvlUSD, decimals?)`.

### veDUST Locks: DustLockHelper

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
  amount: '10000000000000000000', // 10 DUST in wei, the mainnet minLockAmount today
  lockDuration: 90 * 86400, // seconds; 35 to 365 days always fits
});

// Early withdraw. Pass a maximum penalty (DUST, wei) to revert instead of paying more than quoted.
lock.getEarlyWithdrawTxData(tokenId);
lock.getEarlyWithdrawTxData(tokenId, maxPenaltyWei);
```

DustLock validates every new lock, and the builders encode what you give them without checking, so a
value that breaks a rule produces a transaction that reverts:

- `amount` is raw DUST wei and must be at least `minLockAmount`. The team can change it; it is 10
  DUST on mainnet today. Read it with `lock.getMinLockAmount()` instead of hard-coding it.
- The unlock time is `now + duration` rounded down to a whole week (Thursday 00:00 UTC). It must be
  in the future, at least 28 days away and at most 365 days away after rounding. A 28-day duration
  usually rounds below the minimum, so use 35 to 365 days. A 1 DUST lock for 7 days always reverts
  on mainnet.
- `getCreateLockPermanentTxData` validates `lockDuration` exactly like `getCreateLockTxData`: the
  contract creates a timed lock first and only then makes it permanent, so 0 or a short duration
  reverts. 365 days is the conventional value.
- `getIncreaseAmountTxData` needs at least a tenth of `minLockAmount`, and a timed lock must not
  have expired and must have at least 28 days left.

`getUserLocks`, `getUserLocksWithMulticall` and `getUserDustDataWithMulticall` batch the same reads
and measure `daysRemaining` and `isExpired` against the optional `currentTimestamp` (Unix seconds),
which defaults to the local clock; pass the chain's block timestamp on forks or when they differ.
The multicall variants read through Multicall3.

### UI Aggregation: NeverlandUiService

```typescript
import { NeverlandUiService } from '@neverland-money/contract-helpers';
import type { NeverlandUiTypes } from '@neverland-money/contract-helpers';

const ui = new NeverlandUiService('0x...', provider); // NeverlandUiProvider

const bundle = await ui.getUiFullBundle(userAddress);
const prices: NeverlandUiTypes.PriceData = await ui.getAllPrices();
```

Reads that can partly fail are fail-soft on-chain, so results carry resolution signals:

- `PriceData.resolvedMask` and `UserRewardsSummary.revenueResolvedMask` / `emissionsResolvedMask`
  are bitmasks aligned with the input arrays. Check a row with
  `NeverlandUiService.isRowResolved(mask, index)`.
- `EmissionData.resolved`, `MarketData.totalValueLockedUSDResolved` and
  `UserEmissionBreakdown.enumerationResolved` are booleans. `false` means a read failed, not that
  the value is genuinely zero.
- Prices, market data, emissions, and reward summaries report `asOfBlock` and `asOfTimestamp`.

`calculateTotalRewardsUSD(rewardSummaries, priceData, dustTokenAddress, emissions?)` sums DUST
revenue rewards and, when you pass `emissions`, the user's DUST emissions. Emissions that did not
resolve (`emissions.resolved` is `false`) are left out of both totals instead of being counted as
zero, and the result's `emissionsIncluded` is then `false`; it is omitted when no emissions are
passed.

User dashboards are paginated over the raw DustLock enumeration, and pages are compacted to live
veNFTs. The helper follows the contract's `nextRawOffset` / `hasMore` cursor for you. `pageSize`
must be a positive safe integer (the default is 5); anything else throws before any RPC call. When a
page after the first reverts, the dashboard and the bundle return the pages already loaded with
`hasMore` still `true` and `nextRawOffset` at the page to retry. A revert on the first page leaves
nothing to return, so `getUserDashboard`, `getUserDashboardWithPagination` and
`getUiFullBundlePaginated` throw. `getUiFullBundle` and `getUiFullBundleFromParts` catch the error
and return `null`, so check for it. If you call `getUserDashboard` on the contract directly, never
page by `tokenIds.length`.

To reject incomplete pagination, pass `{ requireComplete: true }` as the third argument to
`getUserDashboardWithPagination` or `getUiFullBundlePaginated`. This mode propagates page errors and
rejects stalled cursors, changing live token counts, duplicate/zero IDs, and a final collection that
does not match the live ownership count. `rawTokenCount` is that live count; sparse raw enumeration
can require a cursor beyond it. These checks validate token collection across calls, not
reward/price resolution or a common block snapshot. Default pagination remains best-effort.

The `NeverlandUiService` reads return ordinary nested objects and arrays while retaining bigint
quantities; they are not ethers `Result` values.
`materializeContractResult(interface, method, value)` exposes the same ABI-driven conversion for
other reads, including empty or singleton tuple arrays.

`decodeUserEmissionBreakdown(data)` decodes the historical two-array and four-field-row layouts,
plus the current five-field rows with enumeration status. It returns aligned `assets`, `amounts`,
`symbols`, `sides`, `resolved`, and `enumerationResolved` fields. Unavailable legacy metadata is
`null`, never an asserted success. Malformed or noncanonical payloads reject. The existing
`getUserEmissionBreakdown` method retains the current ABI's row-shaped result.

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

The constructor throws when `revenueAddress` is not a valid address, and transactions target its
checksummed form. `RevenueReward` rejects earned-reward queries unless the tokens are strictly
ascending, so `getUserVeDustRevenueData` queries them sorted and unique and reads each column back
in your token order. The batch encoders enforce the contract's limits before encoding and throw
otherwise; chunk larger sets:

- `getEnableSelfRepayLoanBatchTxData` and `getDisableSelfRepayLoanBatchTxData` take 1 to 64 token
  IDs.
- `getBatchClaimRewardsTxData` takes 1 to 64 token IDs and 1 to 32 reward tokens, in any order.

### Claims: ClaimRewardsHelper

```typescript
import { ClaimRewardsHelper } from '@neverland-money/contract-helpers';

const claim = new ClaimRewardsHelper({ provider, chainId: 143 });

const { to, data } = claim.getClaimAllRewardsToSelfTxData({
  assetAddresses: [aTokenAddress, variableDebtTokenAddress],
  chainId: 143,
  rewardsControllerAddress: '0x...',
  lockTime: 0, // instant claim: half of the DUST goes to the treasury as a toll
  tokenId: 0,
});
```

`lockTime` is required and has no default, because every route costs something different. A missing
value throws. The route is chosen by `lockTime` and `tokenId`:

| `lockTime`            | `tokenId` | Result                                                                                                                                                                |
| --------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`                   | `0`       | Instant claim. The strategy sends half of the claimed DUST to the early-withdraw treasury as the toll and transfers the other half to you.                            |
| A duration in seconds | `0`       | New timed veDUST lock with a sliding toll. The unlock time is `now + lockTime` rounded down to a whole week and must land 28 to 365 days ahead; use at least 35 days. |
| `MaxUint256`          | `0`       | New permanent lock with no toll.                                                                                                                                      |
| Ignored (pass `0`)    | above `0` | The net DUST is deposited into that lock, which you must own. The toll is priced from the lock's remaining time.                                                      |

The toll for a timed claim is 40% at a 28-day commitment and falls linearly toward 0 at 365 days,
rounded up in the treasury's favor; it is 0 for a commitment of 358 days or more. A deposit into an
existing lock reverts when that lock has expired or has under 28 days or over 365 days left, and the
deposit must be at least a tenth of `minLockAmount`. The net DUST after the toll must meet
`minLockAmount` for a new lock.

Quote any route before sending with `previewClaim(amount, lockTime, tokenId)` on the
`DustLockTransferStrategy`, which returns `penaltyAmount` and `netAmount`:

```typescript
import { Contract } from 'ethers';
import { dustLockTransferStrategyAbi } from '@neverland-money/contract-types';

const strategy = new Contract(transferStrategyAddress, dustLockTransferStrategyAbi, provider);
const [penaltyAmount, netAmount]: [bigint, bigint] = await strategy.previewClaim(
  claimAmountWei,
  35n * 86400n, // lockTime
  0n, // tokenId
);
```

### Raw Contract Access

Service classes that extend `AbiBaseService`, such as `DustIncentiveProvider`, expose their
underlying ethers contract and interface:

```typescript
import { DustIncentiveProvider } from '@neverland-money/contract-helpers';

const incentives = new DustIncentiveProvider({
  provider,
  dustIncentiveProviderAddress: controllerAddress, // DustRewardsController
});
const contract = incentives.getContract(); // the ethers Contract for this controller
const calldata = incentives.iface.encodeFunctionData('getRewardsList');
const rewardsList: string[] = await contract.getRewardsList();
```

## Development

Use Node `24` via the repository `.nvmrc` and Yarn `4.3.1` via Corepack. From the repository root:

```bash
yarn build
yarn test packages/contract-helpers
```

See the
[contributor guide](https://github.com/Neverland-Money/neverland-utilities/blob/main/CONTRIBUTING.md)
for installation, source maintenance, and the complete validation workflow.

### Repository Maintenance

The published package contains runtime builds, declarations, documentation and the retained license.
Source provenance and complete transaction regression vectors remain in the repository. For source
validation and generation, see the
[contributor guide](https://github.com/Neverland-Money/neverland-utilities/blob/main/CONTRIBUTING.md).

## Related Packages

- [`@neverland-money/address-book`](https://github.com/Neverland-Money/neverland-utilities/blob/main/packages/address-book/README.md):
  deployed contract addresses.
- [`@neverland-money/contract-types`](https://github.com/Neverland-Money/neverland-utilities/blob/main/packages/contract-types/README.md):
  typed contract ABIs.
- [`@neverland-money/math-utils`](https://github.com/Neverland-Money/neverland-utilities/blob/main/packages/math-utils/README.md):
  reserve, account, interest, and reward calculations.

## License And Notices

See
[LICENSE](https://github.com/Neverland-Money/neverland-utilities/blob/main/packages/contract-helpers/LICENSE).
Released under the MIT License, including retained Copyright (c) 2021 Aave attribution for
upstream-derived source.

<p>
  <a href="https://neverland.money"><img src="https://img.shields.io/badge/Website-neverland.money-480052?style=for-the-badge&logo=safari&logoColor=white" height="22" alt="Website"/></a>
  <a href="https://app.neverland.money"><img src="https://img.shields.io/badge/App-app.neverland.money-192170?style=for-the-badge&logo=ethereum&logoColor=white" height="22" alt="App"/></a>
  <a href="https://x.com/Neverland_Money"><img src="https://img.shields.io/badge/%F0%9D%95%8F-%40Neverland__Money-1DA1F2?style=for-the-badge" height="22" alt="X"/></a>
  <a href="https://discord.com/invite/neverland"><img src="https://img.shields.io/badge/Discord-Join%20Server-5865F2?style=for-the-badge&logo=discord&logoColor=white" height="22" alt="Discord"/></a>
</p>
