# Neverland Address Book

<p>
  <a href="./README.md"><img src="https://img.shields.io/badge/Neverland%20Address%20Book-v1.0.1%20%C2%B7%20Monad%20mainnet%20%28143%29%20%C2%B7%20MIT-192170?style=for-the-badge" alt="Neverland Address Book v1.0.1 - Monad mainnet (143) - MIT"/></a>
</p>

Deployed contract addresses for Neverland on Monad mainnet (chain 143). The values match the Smart
Contracts page of docs.neverland.money and were checked against the chain.

## Package

The package is published as:

```bash
npm install @neverland-money/address-book
```

The published package includes:

- `dist/esm/`: ES module build, used by bundlers through the `module` field.
- `dist/cjs/`: CommonJS build, used by `require` through the `main` field.
- `README.md`: this file.

Example import:

```typescript
import { NeverlandMonadMainnet } from '@neverland-money/address-book';

const { CHAIN_ID, LENDING_POOL, DUST_LOCK_ADDRESS, ASSETS, ISOLATED_MARKETS } =
  NeverlandMonadMainnet;

const usdc = ASSETS.USDC;
usdc.UNDERLYING; // reserve token
usdc.N_TOKEN; // nToken
usdc.VARIABLE_DEBT_TOKEN;
usdc.INTEREST_RATE_STRATEGY;
usdc.WRAPPED_TOKEN; // ERC-4626 wrapper of the nToken (absent for hMON)

ISOLATED_MARKETS.YUZU.LENDING_POOL; // an isolated market's pool
```

## Exports

The flat constants and `ASSETS` describe the main lending market and use the names the Neverland app
uses (`LENDING_POOL`, `DUST_LOCK_ADDRESS`, `NEVERLAND_UI_PROVIDER`, and so on).
`WALLET_BALANCE_PROVIDER` and `UI_POOL_DATA_PROVIDER` are shared by every market on the chain.

| Export                | Contents                                                                        |
| --------------------- | ------------------------------------------------------------------------------- |
| `ASSETS`              | The 14 main-market reserves, keyed by upper-cased symbol (`XAUT0`)              |
| `LENDING`             | Registry, data provider, configurator, ACL manager, oracle, setup helper        |
| `SELF_REPAYING_LOANS` | UserVault registry, factory and beacon                                          |
| `LEADERBOARD`         | Leaderboard contracts, the DUST/USDC pair and partner NFT collections           |
| `ORACLES`             | Ratio, yield-bearing, governed and Pendle PT oracle adapters                    |
| `PRICE_FEEDS`         | Chainlink feeds and exchange-rate legs read by the oracles                      |
| `UTILITIES`           | Pendle maturity gateway, Pendle AUSD leveragers, nLOAZND redemption             |
| `LIBRARIES`           | Pool and configurator logic libraries, DustLock and UI provider libraries       |
| `IMPLEMENTATIONS`     | Current implementation behind each proxy and the UserVault beacon               |
| `RATE_STRATEGIES`     | The interest rate strategies used by the main market                            |
| `GOVERNANCE`          | Timelocks, ProxyAdmins and the Governance, Sentinel, Revenue and Treasury Safes |
| `ISOLATED_MARKETS`    | Pendle AUSD, Pendle shMON and Yuzu: pool, infrastructure and reserves           |

Always interact with proxy addresses. `IMPLEMENTATIONS`, `LIBRARIES` and the base token
implementations change when a contract is upgraded. Reserve keys inside `ISOLATED_MARKETS` are the
upper-cased token symbol with non-alphanumerics replaced by underscores (`PT_AUSD_17DEC2026`).
Pendle PT reserves are listed until they are removed from their pool, and a PT stays exit-only after
its maturity.

Stable debt tokens are legacy: stable borrowing is disabled.

## Development

Use Node `24` via the repository `.nvmrc`. Build and test from the repository root:

```bash
yarn install
yarn build
yarn test packages/address-book
```

## Layout

- `src/addresses/`: one file per deployment, currently `NeverlandMonadMainnet.ts`.
- `src/index.ts`: namespace export of each deployment.
- `src/index.test.ts`: tests for the exports.
- `dist/`: generated build output, not committed.

## Related Packages

- `@neverland-money/contract-types`: typed ABIs.
- `@neverland-money/contract-helpers`: helper classes that take these addresses.

## License And Notices

See [LICENSE](../../LICENSE). Released under the MIT License.

<p>
  <a href="https://neverland.money"><img src="https://img.shields.io/badge/Website-neverland.money-480052?style=for-the-badge&logo=safari&logoColor=white" height="22" alt="Website"/></a>
  <a href="https://app.neverland.money"><img src="https://img.shields.io/badge/App-app.neverland.money-192170?style=for-the-badge&logo=ethereum&logoColor=white" height="22" alt="App"/></a>
  <a href="https://x.com/Neverland_Money"><img src="https://img.shields.io/badge/%F0%9D%95%8F-%40Neverland__Money-1DA1F2?style=for-the-badge" height="22" alt="X"/></a>
  <a href="https://discord.com/invite/neverland"><img src="https://img.shields.io/badge/Discord-Join%20Server-5865F2?style=for-the-badge&logo=discord&logoColor=white" height="22" alt="Discord"/></a>
</p>
