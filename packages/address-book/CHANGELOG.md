# Change Log

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.0.1](https://github.com/Neverland-Money/neverland-utilities/compare/@neverland-money/address-book@1.0.0...@neverland-money/address-book@1.0.1) (2026-10-07)

### Bug Fixes

- **address-book:** point `main` at the CommonJS build and add a `module` entry for the ESM build.
  `main` used to point at the ESM build, so `require('@neverland-money/address-book')` failed in
  Node. Bundlers still use the ESM build.
- **address-book:** declare `tslib` as a dependency. The CommonJS build loads it, so requiring
  `dist/cjs` failed with `Cannot find module 'tslib'` unless something else had installed it.

# [1.0.0](https://github.com/Neverland-Money/neverland-utilities/compare/@neverland-money/address-book@0.2.0...@neverland-money/address-book@1.0.0) (2026-10-07)

### ⚠ BREAKING CHANGES

- **address-book:** the package root no longer re-exports flat constants. Import the namespace
  instead: `NeverlandMonadMainnet`. Anything that read `CHAIN_ID`, `ASSETS` and the rest from the
  root now needs `NeverlandMonadMainnet.CHAIN_ID` (the addresses are different).
- **address-book:** remove the Monad testnet addresses (`NeverlandMonadTestnet`). The Neverland
  testnet deployment no longer exists.

### Features

- **address-book:** add `NeverlandMonadMainnet` for Neverland on Monad mainnet (chain 143). It
  covers the main market (protocol addresses, `LENDING_POOL`, the 14 reserves with underlying,
  nToken, debt token, rate strategy and ERC-4626 wrapper addresses), the three isolated markets
  (Pendle AUSD, Pendle shMON, Yuzu) with their pools, infrastructure and reserves, and the
  leaderboard, self-repay, oracle, price feed, library, implementation and governance addresses,
  plus the two Pendle AUSD leveragers (PT-AUSD-8OCT2026 and PT-AUSD-17DEC2026).
- **address-book:** add a README.

# 0.2.0 (2025-10-29)

### Features

- **helpers:** add DustLockHelper and refactor DustIncentiveProvider; migrate to ABIType; pin
  yarn@4.3.1; monorepo scripts aligned with aave-utilities
  ([6f3c8da](https://github.com/Neverland-Money/neverland-utilities/commit/6f3c8da8fd7449db1be5e950d7b89250143c7a5c))
