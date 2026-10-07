# Release validation: 2026-10-07

Build and npm consumption checks pass. The branch does **not** meet a zero-vulnerability release
policy: contract-helpers still installs the ethers v5 vulnerability chain, and workspace tooling
still installs vulnerable braces. Nothing was committed, pushed, merged, or published during this
validation.

Scope: `feat/contract-types-1.1.0`, starting at `57a814f1667b0285b67edf333dae58ab0401e53c`, plus the
local dependency, packaging, release, and validation changes described below. Environment: Node
24.15.0, Yarn 4.3.1, npm 11.12.1, TypeScript 5.9.3, Linux x64.

## Release candidates

| Package          | Version | npm runtime audit | Status                                      |
| ---------------- | ------- | ----------------- | ------------------------------------------- |
| contract-types   | 1.1.0   | 0 vulnerabilities | Build and package checks pass               |
| address-book     | 1.0.2   | 0 vulnerabilities | Build and package checks pass               |
| contract-helpers | 1.0.2   | Vulnerable ethers | Hold release; ethers v6 would require 2.0.0 |

The helper version is provisional pending the ethers decision. Updating helper code to ethers v6
changes its public provider and numeric types; it should not be shipped as a patch release. The
known DustAPRCalculator issue remains separate.

## Fixes made during validation

- Refreshed workspace dependencies and the committed Yarn lockfile/cache. Lerna moved to 10.0.1 to
  replace vulnerable archive dependencies and its old Nx dependency family. viem now has a
  published-package minimum of 2.57.3, which installs patched ws 8.21.0. abitype and tslib minimums
  are 1.3.0 and 2.8.1.
- Added targeted tooling resolutions for patched plugin-kit, js-yaml, pacote, and undici versions.
  Replaced Istanbul's js-yaml 3 dependency with patched js-yaml 4, removing its vulnerable
  argparse/sprintf-js chain. Verified the actual Istanbul YAML loader and Unicorn disable-comment
  rule against their updated dependencies. These resolutions protect the workspace; they are not
  presented as protection for npm consumers.
- Fixed all three `check-types` scripts. They previously forwarded a literal `--` to TypeScript and
  failed with `TS5023: Unknown compiler option '--'`. They now check both module formats directly.
- Declared abitype directly in contract-helpers. A real nested npm installation reproduced seven
  declaration errors before this fix; the same installation and strict compilation passed afterward.
  The package regression check also failed when this dependency was temporarily removed, then passed
  after restoration.
- Prepared address-book and contract-helpers 1.0.2 manifests, changelogs, and README badges.
  Included the address-book changelog in its tarball, removed stale helper git metadata, and made
  helpers require contract-types 1.1.0.
- Added `yarn test:packages` and a CI step. The check packs all three workspaces, verifies
  entrypoints and build contents, installs the tarballs with nested dependencies in an isolated npm
  project, exercises public imports and Pool calldata, and compiles public declarations in three
  modes.

## Validation results

| Check                                     | Result                                     |
| ----------------------------------------- | ------------------------------------------ |
| `yarn install --immutable`                | Pass                                       |
| Clean `yarn build`                        | All three CJS/ESM builds pass              |
| `yarn check-types`                        | All three packages pass                    |
| `yarn tsc -p tsconfig.test.json --noEmit` | Pass                                       |
| `yarn test --runInBand`                   | 9 suites, 185 tests pass                   |
| `yarn test:packages`                      | Pass; missing-dependency mutation rejected |
| Prettier on PR and validation files       | Pass                                       |
| `git diff --check`                        | Pass                                       |
| `yarn lint`                               | Existing ESLint configuration failure      |
| `yarn npm audit --all --recursive --json` | Four security entries remain; nonzero exit |

Lint does not run because ESLint 9 expects `eslint.config.js`, while the repository only contains
`.eslintrc.js`. The same configuration mismatch exists on main (`eslint: ^9.38.0`); this validation
ran the current checkout, not a separate main installation. Four additional Yarn audit entries are
package deprecation notices, distinct from the four security advisories below. Existing nonfatal
tooling peer-dependency warnings remain; isolated public declaration checks passed with
`skipLibCheck: false`.

Additional isolated consumer checks passed:

- Actual npm tarball installations outside the workspace, without source or dependency symlinks,
  using both hoisted and nested layouts.
- All 53 ABI families and two aliases through CommonJS; named public native Node imports from all
  three packages; an actual esbuild browser ESM bundle selecting every package's `dist/esm`
  entrypoint and retaining all 55 ABI values unchanged; the bundle was executed under Node.
- Strict public declarations in classic Node/CommonJS, Bundler/ESNext, and NodeNext modes, including
  every canonical ABI/type alias, Pool argument and nested return inference, and rejected invalid
  function names and numeric types.
- ethers v5 and v6 Interfaces for every ABI, supply calldata against an independent selector/word
  fixture, independent nested reserve return decoding, Supply event decoding, and inherited
  SafeERC20 custom error decoding. viem `readContract` decoded a mocked `eth_call`; no live RPC or
  deployed-contract execution was claimed.
- DustLock and ClaimRewards helper transaction construction from the installed package.
- All 50 source-backed ABI arrays matched the retained compiler artifacts, including compiler
  metadata where provided. The original nine arrays/export names matched a fresh npm 1.0.1 tarball.
  These artifacts were compiled earlier in this implementation session; this validation compared
  them again rather than recompiling Solidity.
- Both builds' ABI JSON, JavaScript, declarations, declared entrypoints, and provenance were
  present; no source, tests, generator scripts, or stale outputs were shipped.

## ABI provenance

The complete per-family source paths, artifact paths, entry counts, hashes, and compiler settings
are recorded in `packages/contract-types/abi-provenance.json`.

The lending Pool came from Neverland lending revision `a26582fcc24df718a57efd505d51d8cdeeed388d`,
lending-core 1.1.0, using `npm run compile` / `SKIP_LOAD=true hardhat compile` with Hardhat 2.26.3
and solc 0.8.10+commit.fc410830, optimizer 100000, London. Its complete implementation ABI contains
48 functions, 16 events, one constructor, and no custom errors; the implementation uses string
revert codes. Implementation/inherited getters and Neverland synchronization functions are present.

Other pinned sources: Neverland contracts `71c2d0658d6e12e61018156808f1bd6e9a24675c`, wrapped tokens
`5c6a9ed564f9f41308103c1be26d4731883d146c`, Aave periphery
`9afa82664affda1af6f472dfa9492b5feb0d32a9`, and OpenZeppelin contracts v5
`5fd1781b1454fd1ef8e722282f86f9293cacf256`. Three legacy standard/gateway snapshots retain their
published 1.0.1 provenance; their original compiler revision is unknown and is not invented.

## Remaining security findings

The full workspace audit fell from 151 security advisory entries to four, without ignored advisories
or severity exclusions. Fresh contract-types and address-book runtime audits are clean. The
installed helper dependency tree reports 16 affected package entries, all caused by these ethers v5
dependencies:

- elliptic 6.6.1: [GHSA-848j-6mx2-7j84](https://github.com/advisories/GHSA-848j-6mx2-7j84), low, no
  patched release. Latest ethers v5 remains 5.8.0 and installs this version.
- ws 8.18.0: [GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx), moderate, and
  [GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p), high. Fixed ws releases
  exist, but ethers v5 pins the vulnerable version exactly.

Tooling also retains braces 3.0.3 through micromatch:
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), high. The latest published
braces release is still affected. Eliminating this requires replacing the dependency chain or a
reviewed upstream fix; a version refresh alone cannot resolve it.

## Release handoff

1. Resolve the remaining security findings before treating the whole branch as cleared under a
   zero-vulnerability policy. The ethers v6 migration decision is pending.
2. Review and commit the local changes, then rerun GitHub CI/CodeRabbit for that committed revision.
   Previous PR checks do not cover these uncommitted changes.
3. Before publication, delete all package dist directories, build, run tests and package checks, and
   audit the final dependency tree again. Publish contract-types before helpers because helpers now
   require 1.1.0. Follow the repository's manually versioned `lerna publish from-package` workflow
   and release-tag conventions. Publication and tagging remain Catalyst's steps.

Detailed command logs, audit JSON, compiler comparison fixtures, consumer projects, bundle metadata,
packed file inventories, and tarballs are retained locally in `/tmp/contract-types-premerge.5CYLzG`.

Validated tarball SHA-256 values:

- `neverland-money-contract-types-1.1.0.tgz`:
  `31e47c7ed3fd9f7431273a7f196be762b1ea822e8f538c1eab43cc1fc77f338b`
- `neverland-money-address-book-1.0.2.tgz`:
  `a98e7091bc4381c152351e47c08bac210c82cc75709f1178341fabdd767e0614`
- `neverland-money-contract-helpers-1.0.2.tgz`:
  `2922c6629bc61d32be12f2192e7776c855d5f05c142a32a5cb90155ac166c95c`

## Changed files in this validation

- `package.json`, `yarn.lock`, and `.yarn/cache/`: dependency refresh and targeted tooling
  resolutions.
- All three package manifests: repaired checks and dependency minimums; patch versions for the other
  packages.
- Package changelogs and address-book/helper README badges: release metadata.
- `scripts/check-packages.mjs`, `.github/workflows/ci.yml`, and root `README.md`: npm regression
  coverage.
- `VALIDATION.md`: evidence and release hold details.
