# Prepared releases: 2026-10-07

Prepared on `release/contract-types-helpers-2.0.0`, following the merge of PR #3 at
`7ba8a3665f2d089c713c357b527c3cba34104ca6`. Initial release preparation made no Git writes. The
October 8 CodeRabbit follow-up fixes the root ethers v6 example, restores ESLint execution, and
records the configured UI contract address when a bundle read fails. Nothing has been published.

The three npm packages build and pass isolated consumption checks with zero production
vulnerabilities. The workspace still has an unpatched tooling advisory and does **not** meet the
requested zero-vulnerability policy. Publication remains on hold until that issue is resolved.

## Versions

| Package                             | Published baseline | Prepared version | Change                                      |
| ----------------------------------- | ------------------ | ---------------- | ------------------------------------------- |
| `@neverland-money/contract-types`   | 1.0.1              | 2.0.0            | Exact ABI types change public assignability |
| `@neverland-money/contract-helpers` | 1.0.1              | 2.0.0            | ethers v6 providers and bigint values       |
| `@neverland-money/address-book`     | 1.0.1              | 1.0.2            | Packaging and dependency fixes              |

The unpublished contract-types 1.1.0 and helper 1.0.2 candidates are superseded. The private root
package stays at 0.1.0; Lerna uses independent package versions. Manifest versions, changelog
headings, README badges, and packed versions agree. Helpers require contract-types `^2.0.0` and
ethers `^6.17.0`; neither dependency uses a local workspace path in the published manifest.

## Consumer migration

Contract-types retains all 53 ABI families, two aliases, and the original nine runtime ABI values.
Existing constants and aliases now have exact readonly literal types. For example,
`const copy: Erc20Abi = Array.from(erc20Abi)` compiles with the published 1.0.1 declarations but
fails with the new tuple type. Use the general `Abi` type from a directly declared abitype
dependency for reconstructed arrays, or use the exact exported snapshot for viem inference. See
`packages/contract-types/README.md` for the migration example and ABI provenance.

Helpers now accept ethers v6 providers and signers and return native bigint values for raw contract
integers, rewards, balances, UI numeric fields, and gas estimates. Humanized strings and numbers
keep their existing representations. Populated transactions use ethers v6 `TransactionRequest`,
static multicalls use `method.staticCall`, and fee reads use `getFeeData`. Update provider imports,
BigNumber arithmetic, and raw-result JSON serialization as described in
`packages/contract-helpers/README.md` and the
[ethers migration guide](https://docs.ethers.org/v6/migrating/).

The known DustAPRCalculator issue remains separate. Its calls, formula, and inactive fallback are
preserved while its numeric operations are adapted to ethers v6. No address values or ABI JSON
snapshots changed during this preparation.

## Validation

Revalidated locally on October 8 after the CodeRabbit follow-up.

Environment: Node 24.15.0, Yarn 4.3.1, npm 11.12.1, TypeScript 5.9.3, Linux x64.

| Check                                     | Result                                              |
| ----------------------------------------- | --------------------------------------------------- |
| `yarn install --immutable`                | Pass; existing nonfatal peer warnings               |
| Clean `yarn build`                        | All three CJS/ESM builds pass, no cache hits        |
| `yarn check-types`                        | All three packages pass                             |
| `yarn tsc -p tsconfig.test.json --noEmit` | Pass                                                |
| `yarn test --runInBand`                   | 13 suites, 201 tests pass                           |
| `yarn test:packages`                      | Pass, including zero production advisories          |
| Isolated npm production audit             | Zero vulnerabilities                                |
| Browser ESM bundle and execution          | All three ESM entrypoints and 55 ABI exports        |
| Prettier on all changed text files        | Pass                                                |
| `git diff --check HEAD`                   | Pass                                                |
| ESLint configuration smoke checks         | Pass; JS, TS, JSON, Jest globals, generated ignores |
| Full source ESLint scan                   | Runs; 601 errors, 6 warnings, zero fatal errors     |
| Full workspace Yarn audit                 | One security advisory; four deprecations            |

The package checker now verifies release metadata, tarball versions and contents, public CJS and
native Node imports, Pool calldata, ethers v6 public numeric types, and strict declarations in Node,
Bundler, and NodeNext resolution modes. It audits the nested npm consumer's production dependencies
and rejects any advisories. New migration coverage exercises gas estimation and fee data, gateway
transaction population, static multicall timestamps, safe integer conversion, revenue aggregation,
and the unchanged APR fallback. The bigint balance regression failed against ethers v5 before the
migration and passes with ethers v6.

The UI diagnostic regression uses a real ethers v6 contract and a rejected provider call. It failed
with an undefined contract address before the fix and passes with `contract.target`. An isolated
install of the new helper tarball also preserves the error, user address, and nullable return while
logging the configured contract address.

An additional isolated consumer executed actual ethers v6 balance reads against a mocked call,
populated a gateway deposit, bundled every package through `dist/esm`, and retained all 55 ABI
values. This is local build and consumer evidence; no live RPC, deployment, publication, or new
GitHub CI results are claimed. Solidity artifacts were not recompiled in this preparation.

`VALIDATION.md` remains the historical validation of the merged ABI expansion. Its candidate
versions and ethers v5 release hold have been superseded by this document.

## Remaining release holds

The full workspace audit reports braces 3.0.3 through micromatch 4.0.8:
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), high severity. Both are
still the latest npm releases, and the advisory lists no patched braces version. Removing this
requires a maintained replacement for the affected tooling dependency chain or a reviewed upstream
fix. No advisories or severity levels were ignored or excluded from the workspace audit. The
elliptic and pinned WebSocket advisories from ethers v5 are no longer present.

The legacy ESLint configuration failed before linting with an invalid `__esModule` property from the
modern XO preset. The follow-up replaces it with `eslint.config.mjs`, retains XO and Prettier rules
and the existing overrides, declares the imported `globals` dependency, and uses the existing test
TypeScript project. Generated ABI and build files are ignored. Quoted workspace lint globs ensure
ESLint visits root source files and nested tests. CodeRabbit's ESLint tool remains enabled.

ESLint now completes source analysis, but the restored rules report 601 errors and 6 warnings across
33 authored TypeScript files. `yarn lint` remains nonzero because of those source diagnostics, not a
configuration or dependency failure. A passing lint gate requires separate source cleanup or a
reviewed lint-policy change; neither is represented as completed here.

## Operator release steps

Resolve the workspace security hold, complete the follow-up PR and its CI checks, and merge the
release preparation into `main`. Restage the final edits before committing if files were staged
while preparation was still running. Before publication, rebuild from a clean output directory:

```bash
yarn install --immutable
yarn exec rimraf packages/address-book/dist packages/contract-types/dist packages/contract-helpers/dist
yarn build
yarn check-types
yarn tsc -p tsconfig.test.json --noEmit
yarn test --runInBand
yarn test:packages
yarn lint
yarn npm audit --all --recursive
```

After the release holds are resolved and the working tree is clean, Catalyst can publish the
manifest versions with `yarn release:prepared`. This runs `lerna publish from-package` without
another version increment. Both release configurations now name `main`. The existing
`release:latest` script derives new versions and should not be used for these prepared versions.
Contract-types must be available before helpers because helpers depend on its new major version.

After successful npm publication, create and push the corresponding release tags:

- `@neverland-money/contract-types@2.0.0`
- `@neverland-money/contract-helpers@2.0.0`
- `@neverland-money/address-book@1.0.2`

## Prepared artifacts

Tarballs, package inventories, the isolated consumer, production audit, and bundle metadata are
retained in `/tmp/neverland-rabbit-release-4-PVj24f` for the October 8 follow-up. Validation logs
and workspace audit evidence are under its `validation` directory. The earlier artifacts in
`/tmp/neverland-release-prep-GY7eA5` describe the original preparation and are superseded. These
temporary artifacts are local evidence, not committed package contents. Repack and revalidate if a
package manifest, README, changelog, or build changes.

| Tarball                                      | Files | SHA-256                                                            |
| -------------------------------------------- | ----- | ------------------------------------------------------------------ |
| `neverland-money-contract-types-2.0.0.tgz`   | 558   | `081f6d0976720fbdbf7b9e1ab0010ef39a919d3f7e1853303eca7514b6b9405b` |
| `neverland-money-contract-helpers-2.0.0.tgz` | 139   | `7178d5c1fa5112f2c14c786cf35d06734eba40ce24ce9295f5fd2c22506ca890` |
| `neverland-money-address-book-1.0.2.tgz`     | 19    | `dc94eaa72a107946b86045aaf8068de4cad2baf93d7424a00fa022adc2dea496` |
