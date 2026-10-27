# Contributing

## Workspace validation

Use Node 24 and the Yarn version pinned by `package.json`. From the repository root:

```bash
HUSKY=0 YARN_ENABLE_SCRIPTS=false yarn install --immutable --mode=skip-build
yarn clean
yarn build
yarn check-types
yarn check-types:fixtures
node ./node_modules/typescript/bin/tsc -p tsconfig.test.json --noEmit
yarn lint
yarn format:check
yarn test --runInBand
yarn test:validation
yarn test:sdk-fixtures
yarn check:sdk-provenance
yarn test:packages
```

The pull request workflow (`.github/workflows/ci.yml`) enforces the same gates in the same order. It
skips `yarn clean`, which a fresh checkout does not need, and runs `yarn test` without
`--runInBand`. Run the sequence locally before you push.

Lerna orchestrates the four package builds and type checks. Every package build removes its own
`dist` first. Root lint covers package source and tests, scripts, configuration, the ABI generator
and TypeScript consumer templates. Source-local `src/tsconfig.json` editor projects provide Jest
declarations and source aliases with `noEmit`; `scripts/fixtures/tsconfig.json` resolves the
consumer template's build placeholders. Production projects exclude tests and own build output.

The package check installs the current tarballs in a temporary consumer project. It checks CommonJS,
ESM and deep imports, browser execution, strict declarations, dependency identity, source isolation,
license notices and production dependency security. Set `NEVERLAND_PACKAGE_CHECK_DIR` to retain its
generated outputs.

## Generated files

The ABI generator owns `packages/contract-types/src/abis/*Abi.{json,ts}`, its barrel and
`packages/contract-types/src/types.ts`. Update ABI source metadata deliberately, then run the
canonical generator:

```bash
yarn workspace @neverland-money/contract-types generate:abis
yarn workspace @neverland-money/contract-types check:abis
```

`packages/contract-types/abi-provenance.json` records immutable contract source identities, compiler
settings and artifact paths. It stays in the repository and is not published. Import newly compiled
artifacts with `packages/contract-types/scripts/generate-abis.mjs --import <source> <artifact-root>`
using that recorded source. The generator copies complete ABI arrays, updates payload metadata and
formats generated TypeScript deterministically. Clean builds own all `dist` files.

## Regression data and source provenance

Complete math and financial vectors live in `packages/math-utils/src/__fixtures__/`. Complete helper
transaction vectors live in `packages/contract-helpers/src/__fixtures__/`. Each file records
immutable upstream or lending reference identities and a concrete expectation rationale. Financial
states preserve every reserve input used in account aggregates, including zero balances. The HF
boundary vectors explicitly describe hypothetical source-formula results.

Preserve numerical expectations independently of SDK execution. A deliberate expectation change
requires a source-based rationale, complete-object review and updated hashes in
`scripts/fixtures/immutable-sdk-data.json` and the package's source-provenance support records.
`yarn check:immutable-fixtures` verifies exact JSON bytes. Format and lint exclusions protect those
bytes and generator output; they do not exclude ordinary source, tests or documentation.

Each SDK package's `upstream-provenance.json` keeps immutable original archive and per-file hashes,
current source mappings, finite omission accounting and transformation reasons. Record maintained
changes using current transformed/support hashes. Preserve MIT attribution and original source
identities when a current module is renamed or an unsupported original is omitted.

Repository validation uses maintained files and offline test inputs. Application integration,
transaction execution and deployed contract identity require their own verification.

## Package documentation and dependencies

Each package README must contain `v<version>` for its manifest version, and the first `## [x]`
heading of each package changelog must equal that version in brackets; `yarn test:packages` checks
both. Package documents ship to npm, where repository-relative links do not resolve, so link to
other documents with absolute `https://github.com/Neverland-Money/neverland-utilities/blob/main/...`
URLs.

`lerna.json` sets `exact: true` for publishing, so Lerna writes exact versions for internal
dependencies when it versions packages. `contract-helpers` pins `contract-types` and `math-utils` to
exact versions in its manifest and must be released with matching versions. Third-party dependencies
such as `ethers`, `bignumber.js` and `reflect-metadata` stay caret ranges so consumers can share
compatible copies. Change dependency ranges together with `yarn.lock` and `.yarn/cache`.
