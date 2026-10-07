# Prepared releases: 2026-10-07

Prepared on `release/contract-types-helpers-2.0.0`, following the merge of PR #3 at
`7ba8a3665f2d089c713c357b527c3cba34104ca6`. No staging, commits, pushes, tags, or publication were
performed by the release preparation agent.

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

Environment: Node 24.15.0, Yarn 4.3.1, npm 11.12.1, TypeScript 5.9.3, Linux x64.

| Check                                     | Result                                       |
| ----------------------------------------- | -------------------------------------------- |
| `yarn install --immutable`                | Pass; existing nonfatal peer warnings        |
| Clean `yarn build`                        | All three CJS/ESM builds pass, no cache hits |
| `yarn check-types`                        | All three packages pass                      |
| `yarn tsc -p tsconfig.test.json --noEmit` | Pass                                         |
| `yarn test --runInBand`                   | 13 suites, 200 tests pass                    |
| `yarn test:packages`                      | Pass, including zero production advisories   |
| Isolated npm production audit             | Zero vulnerabilities                         |
| Browser ESM bundle and execution          | All three ESM entrypoints and 55 ABI exports |
| Prettier on all changed text files        | Pass                                         |
| `git diff --check HEAD`                   | Pass                                         |
| `yarn lint`                               | Existing ESLint configuration failure        |
| Full workspace Yarn audit                 | One security advisory; four deprecations     |

The package checker now verifies release metadata, tarball versions and contents, public CJS and
native Node imports, Pool calldata, ethers v6 public numeric types, and strict declarations in Node,
Bundler, and NodeNext resolution modes. It audits the nested npm consumer's production dependencies
and rejects any advisories. New migration coverage exercises gas estimation and fee data, gateway
transaction population, static multicall timestamps, safe integer conversion, revenue aggregation,
and the unchanged APR fallback. The bigint balance regression failed against ethers v5 before the
migration and passes with ethers v6.

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

ESLint 9 expects `eslint.config.js`, while the repository still uses `.eslintrc.js`. `yarn lint`
fails before linting sources; this configuration mismatch predates the release preparation. Build,
type, unit, and package checks pass, but lint is not reported as passing.

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
retained in `/tmp/neverland-release-prep-GY7eA5`. Command logs are under
`/tmp/neverland-release-*.log`; workspace audit evidence is `/tmp/neverland-ethers-v6-audit.jsonl`.
These temporary artifacts are local evidence, not committed package contents. Repack and revalidate
if a package manifest, README, changelog, or build changes.

| Tarball                                      | Files | SHA-256                                                            |
| -------------------------------------------- | ----- | ------------------------------------------------------------------ |
| `neverland-money-contract-types-2.0.0.tgz`   | 558   | `8f681e93310fe8e62f9f3558fe86db2cf66deab00abe0f37ebf5a2952efb65eb` |
| `neverland-money-contract-helpers-2.0.0.tgz` | 139   | `dad45ba5ab05e89e88a598a631f91cd68b0894f9c672b88ee7b03c9a71878679` |
| `neverland-money-address-book-1.0.2.tgz`     | 19    | `a98e7091bc4381c152351e47c08bac210c82cc75709f1178341fabdd767e0614` |
