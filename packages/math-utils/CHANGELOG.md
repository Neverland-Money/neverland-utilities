# Change Log

## [1.0.1] (2026-11-03)

- Replace BigInt exponentiation in buffered repayment and DUST APR calculations with bundle-safe
  exact integer construction. This prevents client bundlers from emitting `Math.pow` with BigInt
  arguments; calculation results and validation limits are unchanged.
- Export `pow10(exponent)` for exact nonnegative safe integer powers of ten.

## [1.0.0] (2026-11-02)

- Fork Aave `@aave/math-utils` 1.36.1 (MIT, Copyright (c) 2021 Aave). The fork keeps upstream's
  public functions, signatures, decimal-string inputs, `bignumber.js` return shapes and deep paths,
  but some same-signature functions return different values, to match Neverland lending-core 1.1.0
  integer arithmetic. Do not assume numeric parity with upstream.
- `getLinearBalance` floors with `rayMulFloor`, where upstream rounded half-up. Debt balances use
  ceiling rounding (`getCompoundedBalance` and the user-reserve `variableBorrows` use `rayMulCeil`).
  `calculateLinearInterest` and `calculateCompoundedInterest` follow the lending-core integer
  interest terms in `MathUtils.sol` order instead of upstream's ray-division and binomial path.
- Add the directional RAY exports `rayMulFloor`, `rayMulCeil`, `rayDivFloor` and `rayDivCeil`. They
  accept `BigNumberValue`, return `BigNumber`, and reject negative, fractional and nonfinite
  operands and zero divisors.
- `ComputedUserReserve` gains required `normalizedIncome` and `normalizedVariableDebt`, integer RAY
  strings at the same `currentTimestamp` as the balances. Code that builds computed reserves by hand
  must now supply both.
- Add optional formatter inputs: `legacyEMode` on `formatUserSummary` and
  `formatUserSummaryAndIncentives`, and `currentStableDebt` and `borrowingEnabledOnUser` on
  `UserReserveData`. Summaries gain an optional `poolAccountData` output with the six raw
  `Pool.getUserAccountData` values. `LegacyEMode.ltv` and `liquidationThreshold` accept numbers or
  strings, so the `UiPoolDataProvider` decoder's numeric `eModeLtv` and `eModeLiquidationThreshold`
  pass through unchanged.
- `formatUserSummary` throws when `userEmodeCategoryId` is nonzero and no E-mode category data
  reached the formatter: no `legacyEMode`, and no formatted reserve has `eModes`. Without the guard,
  every collateral would silently use its ordinary LTV and liquidation threshold.
- `formatUserSummary` and `formatUserSummaryAndIncentives` now throw when a user reserve with a
  balance, debt or enabled collateral or borrowing flag matches no formatted reserve, matches more
  than one, or shares its asset with another user reserve, rather than omitting or double-counting
  that position. An amount that is not an unsigned decimal integer string counts as a balance. User
  reserves with zero balances and both flags off may be absent from `formattedReserves`: they are
  skipped, and a repeated copy counts once. Pass the complete `getUserReservesData` result for the
  market; the formatter cannot detect an entry that the caller removed.
- Incentive APR now becomes zero at `emissionEndTimestamp`, using the formatter's `currentTimestamp`
  or an optional timestamp on direct incentive calculations. Direct callers without a timestamp use
  wall-clock time. Zero or unpriced supply now yields zero APR instead of `Infinity`. The
  `calculateIncentiveAPR` and `emissionAprPercent` kernels take no time input and do not consider
  the distribution end; callers must check it.
- `MarketAPR` gains `totalSupplyUSD`, the USD supply behind a live APR, so averages across markets
  can weight by USD instead of raw token units.
- Declare `bignumber.js` (`^9.3.1`) and `tslib` as direct dependencies for independent tarball
  installation; upstream listed `bignumber.js` as a peer dependency. Retain the imported BigNumber
  constructor type in emitted declarations.
- Keep complete reserve, account and incentive expectations with immutable upstream source
  identities.
- Export pure veDUST display estimates with explicit time, raw bigint annualization, and emission
  percent APR while preserving the existing SDK number rounding and nonfinite behavior.
- Export `calculateMarketAPRFromInputs` for exact DUST market APR inputs, token-decimal
  normalization, and explicit time; distinguish dormant emissions from unresolved inputs.
- Add `calculateBufferedRepayAmount` for finite raw-unit variable-debt repayment, with a bounded
  horizon, strict uint128/uint256 validation, logarithmic ceiling-ray exponentiation, and a
  documented upper-bound proof across arbitrary reserve updates and stored-index ages.
