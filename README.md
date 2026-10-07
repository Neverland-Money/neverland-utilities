# Neverland Utilities

<p>
  <a href="./README.md"><img src="https://img.shields.io/badge/Neverland%20Utilities-3%20packages%20%C2%B7%20Monad%20mainnet%20%C2%B7%20Node%2024%20%C2%B7-192170?style=for-the-badge" alt="Neverland Utilities - 3 packages - Monad mainnet - Node 24"/></a>
</p>

TypeScript packages for integrating with the Neverland lending protocol on Monad: typed ABIs,
deployed contract addresses, and helper classes for the contracts the Neverland app uses.

This repository is a Yarn workspace managed with Lerna. Each package is versioned and published
independently under the `@neverland-money` scope.

## Packages

The packages are published as:

```bash
npm install @neverland-money/address-book @neverland-money/contract-types @neverland-money/contract-helpers
```

- `@neverland-money/address-book`: deployed addresses for Neverland on Monad mainnet (chain 143),
  covering the main market, the isolated markets, tokenomics, leaderboard, oracles, and governance.
- `@neverland-money/contract-types`: contract ABIs as JSON, typed with
  [ABIType](https://abitype.dev) for use with viem, ethers v5, and ethers v6.
- `@neverland-money/contract-helpers`: ethers v5 helper classes that read from and build
  transactions for the Neverland contracts. Depends on `contract-types`.

Each package ships an ESM build in `dist/esm` and a CommonJS build in `dist/cjs`. The `main` entry
points at the ESM build.

Example, reading a user's veDUST locks and UI data:

```ts
import { providers } from 'ethers';
import { NeverlandMonadMainnet } from '@neverland-money/address-book';
import { DustLockHelper, NeverlandUiService } from '@neverland-money/contract-helpers';

const provider = new providers.JsonRpcProvider('https://rpc.monad.xyz');
const { DUST_LOCK_ADDRESS, DUST_TOKEN_ADDRESS, NEVERLAND_UI_PROVIDER } = NeverlandMonadMainnet;
const user = '0x...';

const lock = new DustLockHelper({
  provider,
  lockAddress: DUST_LOCK_ADDRESS,
  dustTokenAddress: DUST_TOKEN_ADDRESS,
});
const locks = await lock.getUserLocks(user);

const ui = new NeverlandUiService(NEVERLAND_UI_PROVIDER, provider);
const bundle = await ui.getUiFullBundle(user);
```

See each package README for its full API.

## Source Of Truth

The packages mirror the deployed protocol, so they change when a contract is upgraded or deployed:

- ABIs are copied unchanged from the compiled `neverland-contracts` sources, and match the mainnet
  deployment records.
- Addresses are read from the chain and from the `neverland-contracts` deployment records, and match
  [docs.neverland.money](https://docs.neverland.money). Proxy implementations, logic libraries, and
  base token implementations change on every upgrade.
- Helpers cast ABIs to `Abi` and call contract methods by name, so the TypeScript build does not
  catch ABI drift. When an ABI changes, review the helpers that call it.

## Development

Use Node `24` via `.nvmrc` and Yarn `4.3.1` via Corepack.

```bash
nvm use
corepack enable
yarn install
yarn build
```

Yarn is configured with immutable installs, so a change to `yarn.lock` has to be committed. The Yarn
cache under `.yarn/cache` is committed as well. Installing on a different operating system swaps
platform-specific binaries in it, so check `git status` before committing.

Yarn does not run the `prebuild` clean hook, so stale files from deleted sources stay in `dist`.
Delete the build output before building anything you intend to publish:

```bash
rm -rf packages/*/dist
yarn build
```

## Layout

- `packages/address-book/`: deployed addresses, one file per deployment under `src/addresses/`.
- `packages/contract-types/`: ABI JSON files and their typed exports under `src/abis/`.
- `packages/contract-helpers/`: helper classes, one folder per contract under
  `src/<Name>-contract/`, plus shared code in `src/commons/`.
- `lerna.json`: Lerna configuration with independent versioning.
- `tsconfig.json`: TypeScript configuration shared by every package.
- `dist/`: generated build output inside each package, not committed.

## Release

Set each package version and its changelog entry first, then publish the versions already in the
manifests:

```bash
rm -rf packages/*/dist
yarn build
yarn lerna publish from-package
```

`from-package` does not create git tags, so tag each release afterwards as
`@neverland-money/<package>@<version>`. The `release:latest` script runs
`lerna publish --conventional-commits`, which derives new versions from commit messages and requests
npm provenance, so it is meant for CI rather than for publishing versions that were set by hand.

## License

See [LICENSE](./LICENSE). Released under the MIT License.

<p>
  <a href="https://neverland.money"><img src="https://img.shields.io/badge/Website-neverland.money-480052?style=for-the-badge&logo=safari&logoColor=white" height="22" alt="Website"/></a>
  <a href="https://app.neverland.money"><img src="https://img.shields.io/badge/App-app.neverland.money-192170?style=for-the-badge&logo=ethereum&logoColor=white" height="22" alt="App"/></a>
  <a href="https://x.com/Neverland_Money"><img src="https://img.shields.io/badge/%F0%9D%95%8F-%40Neverland__Money-1DA1F2?style=for-the-badge" height="22" alt="X"/></a>
  <a href="https://discord.com/invite/neverland"><img src="https://img.shields.io/badge/Discord-Join%20Server-5865F2?style=for-the-badge&logo=discord&logoColor=white" height="22" alt="Discord"/></a>
</p>
