# @neverland-money/address-book

Deployed contract addresses for Neverland on Monad mainnet (chain 143). The values match the Smart
Contracts page of docs.neverland.money and were checked against the chain.

## Usage

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

## What is in `NeverlandMonadMainnet`

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
| `UTILITIES`           | Pendle maturity gateway and the nLOAZND redemption contract                     |
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

## Related Packages

- `@neverland-money/contract-types` - Typed ABIs
- `@neverland-money/contract-helpers` - Helper classes that take these addresses
