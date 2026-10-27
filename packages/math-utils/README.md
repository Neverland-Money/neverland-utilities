# Neverland Math Utils

<p>
  <a href="https://github.com/Neverland-Money/neverland-utilities/blob/main/packages/math-utils/README.md"><img src="https://img.shields.io/badge/Neverland%20Math%20Utils-v1.0.0%20%C2%B7%20Monad%20mainnet%20%28143%29%20%C2%B7%20MIT-192170?style=for-the-badge" alt="Neverland Math Utils v1.0.0 - Monad mainnet (143) - MIT"/></a>
</p>

`@neverland-money/math-utils` provides reserve, account, interest, incentive and repayment
calculations for Neverland. Balance and account math follows Neverland lending-core 1.1.0 integer
operation order, with decimal-string inputs and established `bignumber.js` return shapes. The
package is a fork of Aave `@aave/math-utils` 1.36.1: it keeps upstream's public functions, but it
does not return upstream's numbers for every call. See
[Differences From Aave math-utils](#differences-from-aave-math-utils).

## Package

Install the package:

```bash
npm install @neverland-money/math-utils
```

Example import:

```typescript
import { formatReserves, formatUserSummary, valueToBigNumber } from '@neverland-money/math-utils';
import type { CalculateReserveIncentivesResponse } from '@neverland-money/math-utils/dist/esm/formatters/incentive/calculate-reserve-incentives';
```

Root `import` selects matching ESM runtime/declarations; `require` selects CommonJS. Declaration
files ship beside both builds, with explicit module boundaries for NodeNext. Canonical calculator
deep paths accept both extensionless and explicit `.js` forms. Use `dist/esm` deep paths in ESM and
`dist/cjs` in CommonJS. Build-time TypeScript transforms emit native ESM specifiers and maps; the
numeric behavior and recorded financial fixture values are preserved across both builds.

## Differences From Aave math-utils

The fork keeps upstream's public function names, signatures, decimal-string inputs, `bignumber.js`
return shapes and deep paths. Some same-signature functions return different values, to match
Neverland lending-core 1.1.0, so do not assume numeric parity with upstream:

- `getLinearBalance` floors with `rayMulFloor`; upstream rounded half-up.
- Debt balances use ceiling rounding: `getCompoundedBalance` and the user-reserve `variableBorrows`
  use `rayMulCeil`.
- `calculateLinearInterest` and `calculateCompoundedInterest` follow the lending-core integer
  interest terms instead of upstream's ray-division and binomial path.
- `ComputedUserReserve` gains required `normalizedIncome` and `normalizedVariableDebt`.
- New directional RAY exports: `rayMulFloor`, `rayMulCeil`, `rayDivFloor` and `rayDivCeil`.
- New optional formatter inputs `legacyEMode`, `currentStableDebt` and `borrowingEnabledOnUser`, and
  a new optional `poolAccountData` output on account summaries.
- `formatUserSummary` throws when `userEmodeCategoryId` is nonzero and no E-mode category data
  reached the formatter.
- `LegacyEMode.ltv` and `liquidationThreshold` accept numbers or strings.
- `MarketAPR` gains `totalSupplyUSD`.
- `bignumber.js` is a direct dependency, `^9.3.1`; upstream listed it as a peer dependency.

## Neverland Integer Arithmetic

The arithmetic reference is `@neverland-money/lending-core@1.1.0`, committed revision
`a26582fcc24df718a57efd505d51d8cdeeed388d`. This source reference does not establish which revision
produced deployed bytecode. Source references below are relative to `contracts/protocol/libraries/`
at that revision; the regression vectors record exact source-file SHA-256 hashes.

Use integer decimal strings for raw token/base-currency units and RAY indexes/rates. Values above
`Number.MAX_SAFE_INTEGER` must not pass through JavaScript `number`. The four additive
`rayMulFloor`, `rayMulCeil`, `rayDivFloor`, and `rayDivCeil` exports accept the existing
`BigNumberValue` type and return `BigNumber`. They reject negative, fractional, nonfinite operands
and zero divisors. Calculations use arbitrary precision; they do not emulate Solidity overflow or
revert limits. Contract parity assumes valid nonnegative integer inputs and nonoverflowing Solidity
intermediates.

With `R=10^27`, `W=10^18`, `B=10000`, `Y=31536000`, and nonnegative elapsed seconds `t`:

```text
rayMulHalfUp(a,b) = floor((a*b + R/2)/R)
linearInterest   = R + floor(rate*t/Y)
p2               = floor(rayMulHalfUp(rate,rate)/(Y*Y))
p3               = floor(rayMulHalfUp(p2,rate)/Y)
compoundInterest = R + floor(rate*t/Y)
                   + floor(t*(t-1)*p2/2)
                   + floor(t*(t-1)*max(t-2,0)*p3/6)
normalizedIncome = rayMulHalfUp(linearInterest,storedLiquidityIndex)
normalizedDebt   = rayMulHalfUp(compoundInterest,storedVariableBorrowIndex)
supplyRaw        = floor(scaledSupply*normalizedIncome/R)
variableDebtRaw  = ceil(scaledVariableDebt*normalizedDebt/R)
```

At `t=0`, interest is `R` and the stored indexes are returned. Interest term order follows
`math/MathUtils.sol:23-34,50-85`; index multiplication remains half-up as in
`logic/ReserveLogic.sol:46-84`. Direct balance rounding follows `helpers/TokenMath.sol:35-60`. The
generic upstream `binomialApproximatedRayPow` and APY `calculateCompoundedRate` APIs retain upstream
behavior.

Each actual `formatUserSummary` / `formatUserSummaryAndIncentives` result has required top-level
`normalizedIncome: string` and `normalizedVariableDebt: string` on every `ComputedUserReserve`. They
use integer RAY `.toFixed(0)` serialization at exactly the same explicit `currentTimestamp` as its
balances. `UserReserveData` has no new required fields. Consumers manually constructing computed
output objects must include both indexes from the same snapshot before using an index-dependent
calculation.

The public deep raw `UserReserveSummaryResponse` keeps optional `BigNumber` index fields for source
compatibility. `generateUserReserveSummary` always supplies both. A manually constructed raw summary
passed to deep `formatUserReserve` must include both indexes for its balance snapshot; the formatter
throws if either is missing. It cannot recover the valuation timestamp from rounded balances.

## Account Values And Optional Legacy Inputs

`formatUserSummary` and its incentive entrypoint accept these additive optional inputs:

```typescript
import type { LegacyEMode, UserReserveData } from '@neverland-money/math-utils';

// Each raw user reserve; stable balance must already be current at currentTimestamp.
const userReserve: UserReserveData = {
  underlyingAsset: '0x0000000000000000000000000000000000000001',
  scaledATokenBalance: '0',
  usageAsCollateralEnabledOnUser: true,
  scaledVariableDebt: '0',
  currentStableDebt: '0', // Raw token units; omission asserts zero stable debt.
  borrowingEnabledOnUser: true, // Omission infers debt presence; explicit false is honored.
};

// Summary request, alongside the established userEmodeCategoryId. Each formatted reserve also
// carries an optional eModeCategoryId, inherited from ReserveData.
const legacyEMode: LegacyEMode = {
  id: 1, // Must equal userEmodeCategoryId.
  ltv: 9300, // Integer basis points, as a number or a string.
  liquidationThreshold: 9500, // Integer basis points, as a number or a string.
  priceInMarketReferenceCurrency: '100000000', // Already-resolved raw oracle price.
};
```

`LegacyEMode.ltv` and `liquidationThreshold` accept either a number or an integer string, so the
numeric `eModeLtv` and `eModeLiquidationThreshold` that the contract-helpers `UiPoolDataProvider`
decodes pass through without conversion.

When legacy context is supplied, every formatted reserve must provide membership, including category
`0`; missing membership is an error. A nonzero matching category supplies its risk parameters and
its nonzero shared price for both collateral and debt. An omitted/zero shared price uses each
ordinary asset price. Category zero never activates. Without legacy context, existing bitmap-based
eMode behavior remains available; legacy parity then requires equivalent membership and the absence
of an unrepresented shared-price override. See `logic/EModeLogic.sol:74-98` and
`logic/GenericLogic.sol:118-148`.

`formatUserSummary` and `formatUserSummaryAndIncentives` throw when `userEmodeCategoryId` is nonzero
and no E-mode category data reached the formatter: no `legacyEMode` was passed and none of the
formatted reserves carries `eModes`. Without the guard, every collateral would silently use its
ordinary LTV and liquidation threshold. Pass `eModes` to `formatReserves`, or `legacyEMode` to
`formatUserSummary`; the contract-helpers `getEModesHumanized` rebuilds the categories from reserve
data.

For each reserve, floor collateral base value and ceil the combined variable-plus-stable debt base
value once, after adding the raw token balances. Honor the user collateral/borrow flags; include
enabled collateral even if ordinary LTV or LT is zero. For totals `C,D` and weighted numerators
`weightedLTV=sum(collateralBase*effectiveLTV)` and `weightedLT=sum(collateralBase*effectiveLT)`:

```text
averageLTV  = C == 0 ? 0 : floor(weightedLTV/C)
averageLT   = C == 0 ? 0 : floor(weightedLT/C)
healthRaw   = D == 0 ? uint256.max
              : floor(floor((weightedLT*W + floor(D/2))/D)/B)
headroomRaw = max(floor(C*averageLTV/B)-D,0)
```

`poolAccountData` is optional on response interfaces for construction compatibility and is included
by actual formatters. It contains the six raw uint decimal strings from `Pool.getUserAccountData`:
`totalCollateralBase`, `totalDebtBase`, `availableBorrowsBase`, `currentLiquidationThreshold`,
`ltv`, and `healthFactor`. Its headroom is uncapped; its no-debt HF is `2^256-1`. Existing UI
`healthFactor` keeps `'-1'` with no debt, and existing available-borrow fields retain the
conservative isolation-ceiling cap. See `logic/GenericLogic.sol:86-175,195-270` and
`logic/PoolLogic.sol:199-212`. The headroom field does not establish transaction acceptance.

The standalone `calculateHealthFactorFromBalances` takes collateral/debt in the same units and LT in
basis points; its `BigUnits` variant takes LT as a ratio (for example `0.8`). It returns 18-decimal
WAD precision using integer wadDiv then `/10000`, preserving the `-1` sentinel. Decimal
synthetic-preview arguments remain accepted. Integer inputs with an exact effective threshold can
match the aggregate source formula; fractional inputs are display previews and cannot recover
per-reserve valuation rounding, weighted LT information lost by averaging, or oracle membership. Use
the formatter's raw account tuple for exact Pool comparisons.

## Verification Limits

Repository regressions compare the exported math with independent integer source formulas and saved
main/Pendle AUSD observations. Saved inputs do not establish current chain state or the source
revision of deployed bytecode. Observed stable-debt balances were zero; nonzero stable debt, shared
eMode prices, isolation ceilings and zero-LTV/LT collateral are covered by source-derived synthetic
cases, not a claim of nonzero-stable live parity.

Complete regression vectors retain token balances, all six account fields, same-timestamp indexes
and withdrawal burn/balance rounding. Two HF boundary states are explicitly hypothetical
source-formula expectations. See the
[contributor guide](https://github.com/Neverland-Money/neverland-utilities/blob/main/CONTRIBUTING.md)
for source maintenance and regression commands.

## Finite Variable-Debt Repayment Buffer

```typescript
import { calculateBufferedRepayAmount } from '@neverland-money/math-utils';
import type { CalculateBufferedRepayAmountParams } from '@neverland-money/math-utils';

const params: CalculateBufferedRepayAmountParams = {
  debtRaw: '1000000000000000000000000', // Current ceiled variable-debt balance, raw units.
  variableBorrowRateRay: '50000000000000000000000000', // Annual rate in RAY, 5%.
  windowSeconds: 600, // Optional; default 600, integer from 0 through 3600.
};
const amountRaw: string = calculateBufferedRepayAmount(params);
// '1000000951294211238855626'
```

This pure function returns an exact decimal integer string. Debt must be an unsigned decimal string
strictly below `uint256.max`; the annual rate must fit `uint128`, matching reserve storage. The
output must also be strictly below `uint256.max`, which is reserved as an unlimited sentinel. It
rejects malformed, negative, fractional, nonfinite, and overflowing inputs. No debt, rate, or amount
passes through JavaScript `number`. Zero rate or a zero-second horizon returns `debtRaw + 1`; zero
debt returns `'1'` by definition, and callers should skip the repayment transaction when debt is
zero.

The bound assumes a current debt snapshot already ceiled from scaled variable debt at its normalized
index, stored/normalized indexes at least RAY, no new debt, a supplied rate that does not increase,
and execution within the selected horizon measured from that snapshot. Source interest/index
operations must remain valid without on-chain overflow. The stored index may be arbitrarily old; its
age is not an input. This buffer covers variable debt only. A stale snapshot, later rate increase,
new debt, or execution after the horizon requires fresh preparation before signing. A permit
deadline is an independent expiry and does not refresh the debt snapshot. Check residual debt after
the receipt. This calculation does not establish token balance, allowance, or app readiness.

The assumption that the supplied rate does not increase is the one most likely to fail. The variable
borrow rate follows utilization, and ordinary third-party borrows or withdrawals between your quote
and execution raise it, which voids the bound. Quote as close to execution as you can, and re-quote
on every retry instead of reusing an earlier amount. Funds are never at risk: the Pool caps a
repayment at the actual debt, so a buffer above the debt costs nothing, and a buffer that falls
short repays less than the full debt and leaves dust debt.

Prepare one `const amountRaw` and reuse that immutable string for both permit `valueRaw` and
`Pool.repayWithPermitRaw({ amountRaw, ... })` in contract-helpers. The builders do not recalculate
it. Refresh/revalidate the snapshot and rate before signing; an existing signature must not be
paired with a newly calculated amount.

### Formula And Upper-Bound Derivation

Use native integer arithmetic, with `R=10^27`, `Y=31536000`, `ceilDiv(x,y)=ceil(x/y)`, and source
half-up ray multiplication `H(x,y)=floor((x*y+R/2)/R)`. For the supplied rate:

```text
a  = floor(rate/Y)
c2 = floor(H(rate,rate)/(Y*Y))
c3 = floor(H(c2,rate)/Y)
h  = max(ceilDiv(rate,Y), a>0 ? ceilDiv(c2*R,a) : 0,
         c2>0 ? ceilDiv(c3*R,c2) : 0)
F  = ceilDiv((R+h)*(R+1),R)

factor = ceilRayPow(F,windowSeconds)
amount = ceilDiv(currentDebt*factor,R)+1
```

`ceilRayPow` uses exponentiation by squaring, with `ceilDiv(x*y,R)` at every multiplication,
starting at factor R. It takes logarithmic time in the horizon. Each intermediate is checked against
`floor((uint256.max-2)*R/currentDebt)` before a further square/multiply; products are bounded rather
than constructing arbitrarily large powers. A bound above the finite range throws instead of
clamping. Zero debt/rate/time use the special cases above.

The proof follows `math/MathUtils.sol:50-84` and `logic/ReserveLogic.sol:96-106,293-305` at the
pinned Neverland 1.1.0 revision:

1. Source interest for integer age `n` is `I(n)=R+floor(rate*n/Y)+C(n,2)*c2+C(n,3)*c3`. Its linear
   increment is at most `ceil(rate/Y)`; also `I(n)>=R+n*a+C(n,2)*c2+C(n,3)*c3`.
2. By construction, `h>=ceil(rate/Y)`, `h*a/R>=c2`, and `h*c2/R>=c3`. When `a=0`, the source formula
   gives `c2=c3=0`; when `c2=0`, it gives `c3=0`. The source recurrence therefore satisfies
   `I(n+1)<=I(n)*(1+h/R)` at every age. Let `g=1+h/R`; then `I(age+k)<=I(age)*g^k`, including an
   already extrapolated starting snapshot.
3. Let the current normalized index be `N=H(J,I(age))` for stored index J. Each half-up error is at
   most one half. After `k>=1` seconds, the next index is at most
   `(N+1/2)*g^k+1/2 <= N*g^k*(1+1/R) <= N*[g*(1+1/R)]^k`, since `N>=R`. `F/R` is an upper bound for
   `g*(1+1/R)`. Apply this argument at each reserve update: any partition of the horizon is covered
   by the same `(F/R)^horizon` bound. Zero-duration updates do not grow the index.
4. Current debt is `D=ceil(scaledDebt*N/R)`, so future ceiled debt is at most
   `ceil(D*(F/R)^horizon)`. Ceiling every multiplication during exponentiation preserves that upper
   bound. One additional raw unit supplies the requested residual buffer.

A single three-term source accrual over the whole window is insufficient. For the example above,
`ceil(debt*I(600)/R)+1` is `1000000951294211238820297`, but two 300-second reserve updates yield
debt `1000000951294211238846829`: a shortfall of 26,532 atoms. The selected bound is
`1000000951294211238855626`. `src/repay.test.ts` pins these literal values and compares the actual
SDK function against independent integer source formulas over 4,860 partition/snapshot witnesses,
including unknown stored-index ages, one-second/irregular updates, high rates, half-up rounding,
mixed debt sizes, and 0/1/2/600/3600-second horizons. These deterministic tests support the
derivation; they are not execution or deployment evidence.

## Shared Neverland Display Calculations

These pure exports preserve existing SDK display behavior and take no provider or clock:

```typescript
import {
  estimateVeDustPower,
  annualizeEmissionRaw,
  emissionAprPercent,
} from '@neverland-money/math-utils';

const power = estimateVeDustPower({
  dustAmount: 123.45, // Human DUST units.
  endTimestamp: 1715768000, // Unix seconds.
  currentTimestamp: 1700000000, // Explicit caller-selected time.
  isPermanent: false,
}); // 61.73
const annualRaw = annualizeEmissionRaw(1000000n); // 31536000000000n
const apr = emissionAprPercent(100, 2, 1000); // '20.0000', percent.
```

`estimateVeDustPower` returns permanent amounts unchanged, including fractional precision. Timed
locks use `dustAmount * (max(0,end-current) / 31536000)`, then round to two decimal places. Values
beyond one year remain uncapped. This is a display estimate; JavaScript number rounding does not
reproduce raw on-chain voting-power checkpoints. Negative/nonfinite inputs retain their historical
number behavior; this extraction adds no validation policy.

`annualizeEmissionRaw` multiplies native bigint raw token units by exactly `31536000n`, before any
number conversion. `emissionAprPercent` takes annual emissions in human token units and price/TVL in
human USD units. It returns `'0'` when TVL is nonpositive; otherwise it evaluates
`(annualEmissionTokens * rewardPriceUSD / tvlUSD * 100).toFixed(4)` in that operation order. NaN and
Infinity retain JavaScript behavior. Callers keep their own price-availability and finite-TVL
policy. Token decimal formatting remains in the ethers v6 helper.

The corresponding `DustLockHelper` and `DustIncentiveProvider` static methods delegate to these
calculations. Their existing signatures and wall-clock behavior are preserved; an increase adds the
rounded contribution without rounding the sum again. When calling the pure functions directly,
choose an explicit timestamp and retain the application's finite-TVL and unresolved-price policy.
Week-aligned or duration-based voting-power calculations use different formulas.

## Exact DUST Market APR

`calculateMarketAPRFromInputs` accepts raw bigint quantities and explicit time, with DUST emissions
at 18 decimals and prices in USD with eight decimals:

```typescript
import { calculateMarketAPRFromInputs } from '@neverland-money/math-utils';

const result = calculateMarketAPRFromInputs({
  emissionPerSecond: 1000000000000000000n,
  distributionEnd: 200n,
  nowSeconds: 100n,
  totalSupplyRaw: 1000000000000n,
  assetDecimals: 6,
  rewardPriceUsd8: 1000000n,
  assetPriceUsd8: 100000000n,
});
// result.apr === 31.53 (percent)
// result.annualEmissions === '31536000000000000000000000'
// result.totalSupplyUSD === '1000000.0'
```

The calculation annualizes the current rate over 365 days, floors the annual reward's USD value,
normalizes supply to 18 decimals, then floors its USD value before dividing. Asset decimals above 18
floor during normalization. APR is truncated to two decimal places and rejects a result that cannot
be converted safely to a JavaScript number. Intermediate products use bigint without truncating to
uint256.

A live result also carries `totalSupplyUSD`: the supply normalized to 18 decimals times the asset's
USD8 price, as a decimal string truncated to 18 decimals. It is the APR's denominator. Weight
cross-market averages by it, because `totalSupply` is in each asset's own decimals and cannot be
compared across markets. Dormant results omit it, like `totalSupply`.

Zero emissions or an ended campaign return `isActive: false` and `apr: 0`, omitting unread
`totalSupply` and `annualEmissions`. Active campaigns require positive prices and a positive USD
denominator. Missing or invalid inputs reject with `UnresolvedDustAPRInputError`. A small active APR
may round down to zero with `isActive: true`. The existing `emissionAprPercent` display helper
retains its separate zero-TVL behavior.

## Development

Use Node `24` via the repository `.nvmrc` and Yarn `4.3.1` via Corepack. From the repository root:

```bash
yarn build
yarn test packages/math-utils
```

See the
[contributor guide](https://github.com/Neverland-Money/neverland-utilities/blob/main/CONTRIBUTING.md)
for installation, source maintenance, and the complete validation workflow.

## Related Packages

- [`@neverland-money/address-book`](https://github.com/Neverland-Money/neverland-utilities/blob/main/packages/address-book/README.md):
  deployed contract addresses.
- [`@neverland-money/contract-types`](https://github.com/Neverland-Money/neverland-utilities/blob/main/packages/contract-types/README.md):
  typed contract ABIs.
- [`@neverland-money/contract-helpers`](https://github.com/Neverland-Money/neverland-utilities/blob/main/packages/contract-helpers/README.md):
  ethers 6 helpers for Neverland contracts.

## License And Notices

See
[LICENSE](https://github.com/Neverland-Money/neverland-utilities/blob/main/packages/math-utils/LICENSE).
Released under the MIT License.

### Upstream Attribution

Derived from
[Aave utilities](https://github.com/aave/aave-utilities/tree/37dd3bab41c0bc4765b0254151cf6ed1d20b546f),
commit `37dd3bab41c0bc4765b0254151cf6ed1d20b546f`, npm `@aave/math-utils@1.36.1`. MIT, Copyright (c)
2021 Aave. The complete upstream notice ships in `LICENSE`. Original source identities and the
intentional Neverland adaptations are retained in the repository's
[source provenance](https://github.com/Neverland-Money/neverland-utilities/blob/main/packages/math-utils/upstream-provenance.json).
Source provenance and complete regression vectors are repository maintenance data; they are not
installed runtime entrypoints.

<p>
  <a href="https://neverland.money"><img src="https://img.shields.io/badge/Website-neverland.money-480052?style=for-the-badge&logo=safari&logoColor=white" height="22" alt="Website"/></a>
  <a href="https://app.neverland.money"><img src="https://img.shields.io/badge/App-app.neverland.money-192170?style=for-the-badge&logo=ethereum&logoColor=white" height="22" alt="App"/></a>
  <a href="https://x.com/Neverland_Money"><img src="https://img.shields.io/badge/%F0%9D%95%8F-%40Neverland__Money-1DA1F2?style=for-the-badge" height="22" alt="X"/></a>
  <a href="https://discord.com/invite/neverland"><img src="https://img.shields.io/badge/Discord-Join%20Server-5865F2?style=for-the-badge&logo=discord&logoColor=white" height="22" alt="Discord"/></a>
</p>
