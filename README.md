# Neverland Utilities

<p>
  <a href="./README.md"><img src="https://img.shields.io/badge/Neverland%20Utilities-4%20packages%20%C2%B7%20Monad%20mainnet%20%C2%B7%20Node%2024%20%C2%B7-192170?style=for-the-badge" alt="Neverland Utilities - 4 packages - Monad mainnet - Node 24"/></a>
</p>

TypeScript packages for integrating with Neverland on Monad: deployed contract addresses, typed
ABIs, ethers 6 helpers, and calculations for lending, veDUST locks, and rewards.

This repository is a Yarn workspace managed with Lerna. Each package is versioned independently
under the `@neverland-money` scope.

## Packages

Install the packages you need:

```bash
npm install @neverland-money/address-book @neverland-money/contract-types @neverland-money/contract-helpers @neverland-money/math-utils
```

- [`@neverland-money/address-book`](packages/address-book/README.md): deployed addresses for
  Neverland on Monad mainnet (chain 143), covering the main market, isolated markets, tokenomics,
  leaderboard, oracles, and governance.
- [`@neverland-money/contract-types`](packages/contract-types/README.md): contract ABIs as JSON,
  typed with [ABIType](https://abitype.dev) for use with viem and ethers.
- [`@neverland-money/contract-helpers`](packages/contract-helpers/README.md): ethers 6 helpers that
  read from and build transactions for Neverland contracts, including lending pools, veDUST locks,
  rewards, and UI aggregation. Depends on `contract-types` and `math-utils`.
- [`@neverland-money/math-utils`](packages/math-utils/README.md): reserve and account formatters,
  interest and repayment calculations, and shared lock, reward, and APR math. Does not require a
  provider or ethers.

Each package ships an ESM build in `dist/esm` and a CommonJS build in `dist/cjs`, with TypeScript
declarations. Use the matching module format when importing deep paths. Native Node ESM deep paths
are supported for `contract-helpers` and `math-utils` only. The `dist/esm` builds of `address-book`
and `contract-types` are bundler-only: they use extensionless specifiers, and `contract-types`
imports JSON without import attributes. A native Node `import` of either package root loads its
CommonJS entrypoint, and deep paths should use `dist/cjs` there.

Example, reading a user's veDUST dashboard with complete pagination:

```ts
import { JsonRpcProvider } from 'ethers';
import { NeverlandMonadMainnet } from '@neverland-money/address-book';
import { NeverlandUiService } from '@neverland-money/contract-helpers';

const provider = new JsonRpcProvider('https://rpc.monad.xyz');
const { NEVERLAND_UI_PROVIDER } = NeverlandMonadMainnet;
const user = '0x...'; // Replace with the user's wallet address.

const ui = new NeverlandUiService(NEVERLAND_UI_PROVIDER, provider);
const dashboard = await ui.getUserDashboardWithPagination(user, 5, {
  requireComplete: true,
});
```

Complete pagination rejects missing or inconsistent token collections. Reward and price resolution
still have their own status fields; see the
[UI aggregation guide](packages/contract-helpers/README.md#ui-aggregation-neverlanduiservice).

See each package README for its API. The
[helper migration guide](packages/contract-helpers/README.md#breaking-migration-to-300) covers
ethers 6 signatures, canonical module paths, and changes to transaction builders.

## Source Of Truth

Contract integrations and calculations follow pinned source revisions:

- ABI source revisions, compiler settings, artifact paths, and hashes are recorded in
  [abi-provenance.json](packages/contract-types/abi-provenance.json). The ABI collection includes
  contracts prepared for future integrations; ABI availability does not establish deployment or
  activation.
- Deployment addresses are maintained in `address-book`. Update the corresponding address records
  when a contract is deployed or upgraded.
- Lending balance and account calculations follow the committed lending-core 1.1.0 integer
  arithmetic. The [math guide](packages/math-utils/README.md) documents rounding, input units, and
  formatter behavior.
- ABI usage checks, transaction encoding tests, and numerical regression tests cover the helper and
  math APIs. Deployed contract identity and application integration require separate verification.

## Development

Use Node `24` via `.nvmrc` and Yarn `4.3.1` via Corepack.

```bash
nvm use
corepack enable
yarn install --immutable
yarn build
yarn check-types
yarn lint
yarn format:check
yarn test
```

The Jest suites live next to the code they cover (`packages/*/src/**/*.test.ts`) and use offline
inputs or mocked contract reads. Lerna orchestrates package builds and type checks; ESLint checks
the maintained workspace source and tooling.

After building, run `yarn test:packages` to pack all four workspaces and install their tarballs in
an isolated consumer project. It checks package contents, CommonJS and ESM imports, deep paths,
browser bundling, transaction encoding, and public TypeScript declarations. The pull request
workflow runs the same gates as the validation sequence in the [release guide](RELEASE.md).

Yarn uses immutable installs, and `.yarn/cache` is committed alongside `yarn.lock`. Review both when
changing dependencies.

Every package build cleans its own `dist` first, so deleted or renamed source files cannot leave
stale artifacts. `yarn clean` also removes coverage output, and the release sequence still runs it
before `yarn build`:

```bash
yarn clean
yarn build
```

Generated ABIs are maintained by their generator. See the [contributor guide](CONTRIBUTING.md) for
generation commands and the complete validation workflow.

## Layout

- [`packages/address-book/`](packages/address-book/): deployed addresses under `src/addresses/`.
- [`packages/contract-types/`](packages/contract-types/): ABI JSON files and typed exports under
  `src/abis/`.
- [`packages/contract-helpers/`](packages/contract-helpers/): helpers in lowercase kebab-case
  folders, with shared code in `src/commons/` and the shared pool implementation in
  `src/pool-contract/`.
- [`packages/math-utils/`](packages/math-utils/): pure calculations and reserve, account, and
  incentive formatters.
- `lerna.json`: Lerna configuration with independent versioning.
- `tsconfig.json`: TypeScript configuration shared by the packages.
- `jest.config.js` and `tsconfig.test.json`: Jest and test TypeScript configuration.
- `.github/workflows/ci.yml`: the pull request workflow.
- `dist/`: generated build output inside each package, not committed.

## Release

Follow the [release guide](RELEASE.md) to prepare package versions, validate consumers, and publish
the prepared manifests. Keep each package's changelog and README aligned with its version and public
API.

## License And Notices

See [LICENSE](./LICENSE). Released under the MIT License. Package licenses retain the notices for
derived code.

<p>
  <a href="https://neverland.money"><img src="https://img.shields.io/badge/Website-neverland.money-480052?style=for-the-badge&logo=safari&logoColor=white" height="22" alt="Website"/></a>
  <a href="https://app.neverland.money"><img src="https://img.shields.io/badge/App-app.neverland.money-192170?style=for-the-badge&logo=ethereum&logoColor=white" height="22" alt="App"/></a>
  <a href="https://x.com/Neverland_Money"><img src="https://img.shields.io/badge/%F0%9D%95%8F-%40Neverland__Money-1DA1F2?style=for-the-badge" height="22" alt="X"/></a>
  <a href="https://discord.com/invite/neverland"><img src="https://img.shields.io/badge/Discord-Join%20Server-5865F2?style=for-the-badge&logo=discord&logoColor=white" height="22" alt="Discord"/></a>
</p>
