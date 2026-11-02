# Neverland Contract Types

<p>
  <a href="https://github.com/Neverland-Money/neverland-utilities/blob/main/packages/contract-types/README.md"><img src="https://img.shields.io/badge/Neverland%20Contract%20Types-v3.0.0%20%C2%B7%20Monad%20mainnet%20%28143%29%20%C2%B7%20MIT-192170?style=for-the-badge" alt="Neverland Contract Types v3.0.0 - Monad mainnet (143) - MIT"/></a>
</p>

Compiled ABIs and precise TypeScript types for Neverland's public contracts, lending core, wrapped
tokens, and integration periphery. Runtime ABIs work with viem and ethers; ABI-derived type
utilities support viem integrations. Contract addresses live in `address-book`, and operational
helpers live in `contract-helpers`.

## Package

Install the package:

```bash
npm install @neverland-money/contract-types
```

The published package includes:

- `dist/esm/`: ES module build, used by bundlers through the `module` field.
- `dist/cjs/`: CommonJS build, used by `require` through the `main` field.
- `README.md`, `CHANGELOG.md` and `LICENSE`.

Source provenance, generator scripts and test fixtures stay in the repository. In particular,
`abi-provenance.json` is no longer published (2.0.0 shipped it); it stays in the repository.

The `dist/esm` build is for bundlers. Its relative imports are extensionless and its ABI modules
import JSON without import attributes, so native Node ESM cannot load its deep paths. A native Node
`import` of the package root loads the CommonJS entrypoint.

Example import:

```typescript
import { dustLockAbi, erc20Abi, poolAbi } from '@neverland-money/contract-types';
```

## Breaking Migration To 3.0.0

`aaveOracleAbi` / `AaveOracleAbi` become `lendingOracleAbi` / `LendingOracleAbi`;
`aaveProtocolDataProviderAbi` / `AaveProtocolDataProviderAbi` become `protocolDataProviderAbi` /
`ProtocolDataProviderAbi`, including module filenames. There are no aliases under the old names. ABI
bytes and original Solidity source/contract identifiers in provenance remain unchanged.
`abi-provenance.json` is no longer published; read it from the repository instead of importing it
from the package.

ABI-derived viem return types infer small integers as numbers. Ethers 6 returns bigint for every
integer width. The helpers use an outputs-only mapping at the ABI read boundary and checked metadata
conversions; do not cast raw ethers results directly to viem return types.

## Available ABIs

The package exports 53 ABI families and two aliases. Each ABI export has a corresponding type alias,
such as `poolAbi` / `PoolAbi`. ABIs include inherited functions, events, errors, and constructors
from their compiled artifacts. Exported administration functions still require the permissions
enforced by the contracts.

### Lending Core

| ABI export                              | Contract                             |
| --------------------------------------- | ------------------------------------ |
| `aTokenAbi`                             | `AToken`                             |
| `lendingOracleAbi`                      | `AaveOracle`                         |
| `protocolDataProviderAbi`               | `AaveProtocolDataProvider`           |
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

// Ethers 6 returns this integer read as a bigint.
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

## Compared With TypeChain

- No generated contract classes or factories. Each ABI is a plain JSON value that you pass to viem
  or ethers directly.
- The package is not types only. Each build ships every ABI as a JSON file, about 1 MB in total,
  plus a small JavaScript module per ABI that re-exports it. Import only the ABIs you need and
  measure your own bundle.
- Each ABI also has a generated readonly literal type, which gives viem exact function, argument and
  return inference.
- Tested with viem and ethers 6. Ethers 6 returns bigint for every integer width, so do not cast its
  results to viem's inferred return types.
- No code generation step in your project.

## Source Provenance

All JSON ABIs are included in both build directories. Their source revisions, compiler settings,
artifact paths and payload hashes are retained in the repository's
[ABI provenance](https://github.com/Neverland-Money/neverland-utilities/blob/main/packages/contract-types/abi-provenance.json),
which is not part of the published package. The generator checks those records before every package
build. Source maintenance and generation are documented in the
[contributor guide](https://github.com/Neverland-Money/neverland-utilities/blob/main/CONTRIBUTING.md).

ABI availability does not establish deployment or activation. Use `@neverland-money/address-book`
and deployment records to choose the correct market and contract address.

## Development

Use Node `24` via the repository `.nvmrc` and Yarn `4.3.1` via Corepack. From the repository root:

```bash
yarn build
yarn test packages/contract-types
```

See the
[contributor guide](https://github.com/Neverland-Money/neverland-utilities/blob/main/CONTRIBUTING.md)
for installation, source maintenance, and the complete validation workflow.

## Related Packages

- [`@neverland-money/address-book`](https://github.com/Neverland-Money/neverland-utilities/blob/main/packages/address-book/README.md):
  deployed contract addresses.
- [`@neverland-money/contract-helpers`](https://github.com/Neverland-Money/neverland-utilities/blob/main/packages/contract-helpers/README.md):
  ethers 6 helpers for Neverland contracts.
- [`@neverland-money/math-utils`](https://github.com/Neverland-Money/neverland-utilities/blob/main/packages/math-utils/README.md):
  reserve, account, interest, and reward calculations.

## License And Notices

See
[LICENSE](https://github.com/Neverland-Money/neverland-utilities/blob/main/packages/contract-types/LICENSE).
Released under the MIT License.

<p>
  <a href="https://neverland.money"><img src="https://img.shields.io/badge/Website-neverland.money-480052?style=for-the-badge&logo=safari&logoColor=white" height="22" alt="Website"/></a>
  <a href="https://app.neverland.money"><img src="https://img.shields.io/badge/App-app.neverland.money-192170?style=for-the-badge&logo=ethereum&logoColor=white" height="22" alt="App"/></a>
  <a href="https://x.com/Neverland_Money"><img src="https://img.shields.io/badge/%F0%9D%95%8F-%40Neverland__Money-1DA1F2?style=for-the-badge" height="22" alt="X"/></a>
  <a href="https://discord.com/invite/neverland"><img src="https://img.shields.io/badge/Discord-Join%20Server-5865F2?style=for-the-badge&logo=discord&logoColor=white" height="22" alt="Discord"/></a>
</p>
