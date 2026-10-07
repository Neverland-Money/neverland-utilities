# Neverland Contract Types

<p>
  <a href="./README.md"><img src="https://img.shields.io/badge/Neverland%20Contract%20Types-v2.0.0%20%C2%B7%20Monad%20mainnet%20%28143%29%20%C2%B7%20MIT-192170?style=for-the-badge" alt="Neverland Contract Types v2.0.0 - Monad mainnet (143) - MIT"/></a>
</p>

Compiled ABIs and precise TypeScript types for Neverland's public contracts, lending core, wrapped
tokens, and integration periphery. Runtime ABIs work with viem and ethers; ABI-derived type
utilities support viem integrations. Contract addresses live in `address-book`, and operational
helpers live in `contract-helpers`.

## Package

The package is published as:

```bash
npm install @neverland-money/contract-types
```

The published package includes:

- `dist/esm/`: ES module build, used by bundlers through the `module` field.
- `dist/cjs/`: CommonJS build, used by `require` through the `main` field.
- `README.md`, `CHANGELOG.md`, and `abi-provenance.json`.

Example import:

```typescript
import { dustLockAbi, erc20Abi, poolAbi } from '@neverland-money/contract-types';
```

## Available ABIs

The package exports 53 ABI families and two aliases. Each ABI export has a corresponding type alias,
such as `poolAbi` / `PoolAbi`. ABIs include inherited functions, events, errors, and constructors
from their compiled artifacts. Exported administration functions still require the permissions
enforced by the contracts.

### Lending Core

| ABI export                              | Contract                             |
| --------------------------------------- | ------------------------------------ |
| `aTokenAbi`                             | `AToken`                             |
| `aaveOracleAbi`                         | `AaveOracle`                         |
| `aaveProtocolDataProviderAbi`           | `AaveProtocolDataProvider`           |
| `aclManagerAbi`                         | `ACLManager`                         |
| `defaultReserveInterestRateStrategyAbi` | `DefaultReserveInterestRateStrategy` |
| `poolAbi`                               | `Pool`                               |
| `poolAddressesProviderAbi`              | `PoolAddressesProvider`              |
| `poolAddressesProviderRegistryAbi`      | `PoolAddressesProviderRegistry`      |
| `poolConfiguratorAbi`                   | `PoolConfigurator`                   |
| `stableDebtTokenAbi`                    | `StableDebtToken`                    |
| `variableDebtTokenAbi`                  | `VariableDebtToken`                  |

### Wrapped Tokens

| ABI export               | Contract              |
| ------------------------ | --------------------- |
| `stataOracleAbi`         | `StataOracle`         |
| `staticATokenFactoryAbi` | `StaticATokenFactory` |
| `staticATokenLMAbi`      | `StaticATokenLM`      |

### Lending Periphery

| ABI export                     | Contract                    |
| ------------------------------ | --------------------------- |
| `uiIncentiveDataProviderV3Abi` | `UiIncentiveDataProviderV3` |
| `uiPoolDataProviderV3Abi`      | `UiPoolDataProviderV3`      |
| `walletBalanceProviderAbi`     | `WalletBalanceProvider`     |
| `wrappedTokenGatewayV3Abi`     | `WrappedTokenGatewayV3`     |

### DUST And veDUST

| ABI export                   | Contract                  |
| ---------------------------- | ------------------------- |
| `dustAbi`                    | `Dust`                    |
| `dustLockAbi`                | `DustLock`                |
| `dustLockLegendaryLedgerAbi` | `DustLockLegendaryLedger` |

### Emissions

| ABI export                    | Contract                   |
| ----------------------------- | -------------------------- |
| `dustLockTransferStrategyAbi` | `DustLockTransferStrategy` |
| `dustRewardsControllerAbi`    | `DustRewardsController`    |

### Revenue Rewards

| ABI export         | Contract        |
| ------------------ | --------------- |
| `revenueRewardAbi` | `RevenueReward` |

### Self-Repaying Loans

| ABI export             | Contract            |
| ---------------------- | ------------------- |
| `userVaultAbi`         | `UserVault`         |
| `userVaultFactoryAbi`  | `UserVaultFactory`  |
| `userVaultRegistryAbi` | `UserVaultRegistry` |

### Gateways And UI Helpers

| ABI export                          | Contract                         |
| ----------------------------------- | -------------------------------- |
| `neverlandAssetRedemptionAbi`       | `NeverlandAssetRedemption`       |
| `neverlandDustHelperAbi`            | `NeverlandDustHelper`            |
| `neverlandNativeGatewayAbi`         | `NeverlandNativeGateway`         |
| `neverlandPendleLeveragerAbi`       | `NeverlandPendleLeverager`       |
| `neverlandPendleMaturityGatewayAbi` | `NeverlandPendleMaturityGateway` |
| `neverlandProfileItemsSellerAbi`    | `NeverlandProfileItemsSeller`    |
| `neverlandUiProviderAbi`            | `NeverlandUiProvider`            |

### Governance

| ABI export                       | Contract                      |
| -------------------------------- | ----------------------------- |
| `neverlandTimelockControllerAbi` | `NeverlandTimelockController` |

### Leaderboard

| ABI export                  | Contract                 |
| --------------------------- | ------------------------ |
| `epochManagerAbi`           | `EpochManager`           |
| `leaderboardConfigAbi`      | `LeaderboardConfig`      |
| `leaderboardKeeperAbi`      | `LeaderboardKeeper`      |
| `nftPartnershipRegistryAbi` | `NFTPartnershipRegistry` |
| `specialEditionRegistryAbi` | `SpecialEditionRegistry` |
| `votingPowerMultiplierAbi`  | `VotingPowerMultiplier`  |

### Oracles

| ABI export                         | Contract                        |
| ---------------------------------- | ------------------------------- |
| `governedPriceOracleAbi`           | `GovernedPriceOracle`           |
| `hardcodedPriceOracleAbi`          | `HardcodedPriceOracle`          |
| `marketHoursPriceAdapterAbi`       | `MarketHoursPriceAdapter`       |
| `pendlePtDiscountOracleAdapterAbi` | `PendlePtDiscountOracleAdapter` |
| `ratioOracleAggregatorAbi`         | `RatioOracleAggregator`         |
| `sessionCalendarAbi`               | `SessionCalendar`               |
| `yieldBearingOracleAdapterAbi`     | `YieldBearingOracleAdapter`     |

### Market Safety

| ABI export               | Contract              |
| ------------------------ | --------------------- |
| `marketHoursSentinelAbi` | `MarketHoursSentinel` |

### Standard And Legacy Interfaces

| ABI export             | Contract            |
| ---------------------- | ------------------- |
| `erc20Abi`             | `ERC20`             |
| `erc4626Abi`           | `IERC4626`          |
| `multicall3Abi`        | `Multicall3`        |
| `wethGatewayLegacyAbi` | `WETHGatewayLegacy` |

### Aliases

- `staticATokenAbi` / `StaticATokenAbi` aliases `staticATokenLMAbi` / `StaticATokenLMAbi`.
- `dustLockLegendaryGatewayAbi` / `DustLockLegendaryGatewayAbi` aliases `dustLockLegendaryLedgerAbi`
  / `DustLockLegendaryLedgerAbi`. The canonical source now names this contract
  `DustLockLegendaryLedger`; the alias supports the name used by frontend integrations.

## Usage

### With Viem (Recommended)

```typescript
import { createPublicClient, http, getContract } from 'viem';
import { monad } from 'viem/chains';
import { dustLockAbi, erc20Abi } from '@neverland-money/contract-types';

// Create a client
const client = createPublicClient({
  chain: monad,
  transport: http(),
});

// Get a typed contract instance
const dustLock = getContract({
  address: '0x...',
  abi: dustLockAbi,
  client,
});

// Call contract methods with full type safety
const balance = await dustLock.read.balanceOfNFT([tokenId]);
const supply = await dustLock.read.totalSupply();
```

### With Ethers v6

```typescript
import { ethers } from 'ethers';
import { dustLockAbi } from '@neverland-money/contract-types';

const provider = new ethers.JsonRpcProvider('https://rpc.monad.xyz');
const contract = new ethers.Contract('0x...', dustLockAbi, provider);

// TypeScript infers types from the ABI
const balance = await contract.balanceOfNFT(tokenId);
```

### With Ethers v5

```typescript
import { ethers } from 'ethers';
import { dustLockAbi } from '@neverland-money/contract-types';

const provider = new ethers.providers.JsonRpcProvider('https://rpc.monad.xyz');
const contract = new ethers.Contract('0x...', dustLockAbi as any, provider);

const balance = await contract.balanceOfNFT(tokenId);
```

### Type Exports

All ABI exports preserve literal function names, arguments, returns, events, and errors. The runtime
imports the ABI JSON; the generated readonly literal type enables viem inference without embedding a
second runtime ABI array.

```typescript
import {
  poolAbi,
  type PoolAbi,
  type ContractFunctionArgs,
  type ContractFunctionReturnType,
  type ContractEventArgsFromTopics,
} from '@neverland-money/contract-types';
import { encodeFunctionData } from 'viem';

type SupplyArgs = ContractFunctionArgs<PoolAbi, 'nonpayable', 'supply'>;
type ReserveData = ContractFunctionReturnType<PoolAbi, 'view', 'getReserveData'>;
type SupplyEvent = ContractEventArgsFromTopics<PoolAbi, 'Supply'>;

const args: SupplyArgs = [assetAddress, 1_000_000n, userAddress, 0];
const calldata = encodeFunctionData({ abi: poolAbi, functionName: 'supply', args });
```

The package also exports `ContractFunctionName`, `ContractEventName`, `ContractEventArgs`,
`ContractConstructorArgs`, `ContractErrorName`, and `ContractErrorArgs`. `ContractEventArgs`
describes indexed event filters; `ContractEventArgsFromTopics` describes decoded event values. These
ABI-derived types use wire values, including `bigint` for large Solidity integers. Application
models that format amounts or combine several reads belong in the consuming application or
`contract-helpers`.

### Migrating From 1.0.1

Version 2.0.0 preserves the existing ABI JSON values and export names. ABI constants and aliases now
have exact readonly literal types, so callers get precise function, argument, and return inference.
This also changes public type assignability: cloning an ABI with `Array.from` preserves its runtime
entries but returns an array that cannot be assigned to a fixed tuple such as `Erc20Abi`. Use the
general `Abi` type for cloned or reconstructed arrays:

```typescript
import { erc20Abi, type Erc20Abi } from '@neverland-money/contract-types';
import type { Abi } from 'abitype';

const exactSnapshot: Erc20Abi = erc20Abi;
const clonedAbi: Abi = Array.from(erc20Abi);
```

Pass the exported ABI directly to viem when exact function and argument inference is needed.
Misspelled methods and invalid arguments that the previous general `Abi` casts accepted now produce
compiler errors.

## Benefits Over Typechain

- Zero runtime overhead, just types.
- Works with Viem, Ethers v5, and Ethers v6.
- No code generation needed.
- Smaller bundle size.
- Better type inference.
- Easier to maintain.
- Native JSON import support.

## Development

Use Node `24` via the repository `.nvmrc`. Build and test from the repository root:

```bash
yarn install
yarn build
yarn test packages/contract-types
yarn workspace @neverland-money/contract-types check:abis
```

## Layout

- `src/abis/*.json`: the ABI files, copied from compiled `neverland-contracts` and
  `neverland-lending` sources.
- `src/abis/*.ts`: generated typed exports and the public ABI barrel.
- `src/types.ts`: generated ABI type aliases and viem type utilities.
- `abi-provenance.json`: source revisions, compiler settings, artifact paths, and ABI hashes.
- `scripts/generate-abis.mjs`: artifact import, typed export generation, and stale-output checking.
- `src/abis/abis.test.ts`: tests for the ABIs.
- `dist/`: generated build output, not committed.

## ABI Provenance And Generation

[`abi-provenance.json`](./abi-provenance.json) records every family, its compiled artifact path,
source revision, compiler and settings, ABI entry counts, and SHA-256 of the compact JSON array. The
existing nine ABI families retain their published 1.0.1 runtime values.

| Source                   | Pinned revision                            | Generation                                                      |
| ------------------------ | ------------------------------------------ | --------------------------------------------------------------- |
| Neverland lending        | `a26582fcc24df718a57efd505d51d8cdeeed388d` | Hardhat 2.26.3, Solidity 0.8.10, optimizer 100,000 runs, London |
| Neverland contracts      | `71c2d0658d6e12e61018156808f1bd6e9a24675c` | Forge 1.5.1, Solidity 0.8.30, optimizer 200 runs, Cancun        |
| Neverland wrapped tokens | `5c6a9ed564f9f41308103c1be26d4731883d146c` | Forge 1.5.1, Solidity 0.8.35, optimizer 200,000 runs, Prague    |
| Aave V3 periphery        | `9afa82664affda1af6f472dfa9492b5feb0d32a9` | Forge 1.5.1, Solidity 0.8.35, optimizer 200 runs, Cancun        |
| OpenZeppelin IERC4626    | `5fd1781b1454fd1ef8e722282f86f9293cacf256` | Forge 1.5.1, Solidity 0.8.35, optimizer 200 runs, Cancun        |

The periphery and OpenZeppelin revisions are submodules pinned by the Neverland contracts revision.
Forge builds used isolated output and cache directories; the wrapped-token build used a clean source
archive. The Pool ABI was generated with `npm run compile` (`SKIP_LOAD=true hardhat compile`) from a
clean lending source archive. Its complete `Pool.sol:Pool` ABI has 48 functions, 16 events, and a
constructor. That revision uses string revert codes and declares no custom ABI errors.

`erc20Abi`, `multicall3Abi`, and `wethGatewayLegacyAbi` are retained from the published 1.0.1
package; their original compiler revisions were not recorded. ERC-4626 comes from the compiled
OpenZeppelin `IERC4626` interface, including inherited ERC20 and metadata methods. All other
families come from complete implementation artifacts. Source-backed coverage includes contracts
prepared for future integrations. An export does not establish that a contract is deployed,
activated, or available in every market; use `address-book` and deployment records to choose an
address.

To update an ABI, first compile its pinned source using the source's recorded generation method.
When changing source revisions, update the source metadata and compiler settings as well. Import all
recorded artifacts for that source, then regenerate the TypeScript exports:

```bash
# Run from packages/contract-types. Paths point at freshly compiled artifact directories.
node scripts/generate-abis.mjs --import neverland-lending /path/to/lending/artifacts
node scripts/generate-abis.mjs --import neverland-contracts /path/to/contracts/out
node scripts/generate-abis.mjs --import neverland-wrapped-tokens /path/to/wrapped-tokens/out
node scripts/generate-abis.mjs --import aave-v3-periphery /path/to/periphery/out
node scripts/generate-abis.mjs --import openzeppelin-contracts-v5 /path/to/standards/out

yarn generate:abis
yarn check:abis
```

Imports copy each artifact's entire `abi` array without filtering entries and update its hash.
`check:abis` rejects ABI drift and stale generated modules, barrels, or type aliases; it runs before
the package build. All JSON ABIs remain included in both build directories.

## Related Packages

- `@neverland-money/address-book`: deployed contract addresses.
- `@neverland-money/contract-helpers`: helper classes that use these ABIs.

## License And Notices

See [LICENSE](../../LICENSE). Released under the MIT License.

<p>
  <a href="https://neverland.money"><img src="https://img.shields.io/badge/Website-neverland.money-480052?style=for-the-badge&logo=safari&logoColor=white" height="22" alt="Website"/></a>
  <a href="https://app.neverland.money"><img src="https://img.shields.io/badge/App-app.neverland.money-192170?style=for-the-badge&logo=ethereum&logoColor=white" height="22" alt="App"/></a>
  <a href="https://x.com/Neverland_Money"><img src="https://img.shields.io/badge/%F0%9D%95%8F-%40Neverland__Money-1DA1F2?style=for-the-badge" height="22" alt="X"/></a>
  <a href="https://discord.com/invite/neverland"><img src="https://img.shields.io/badge/Discord-Join%20Server-5865F2?style=for-the-badge&logo=discord&logoColor=white" height="22" alt="Discord"/></a>
</p>
