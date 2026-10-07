# Neverland Contract Types

<p>
  <a href="./README.md"><img src="https://img.shields.io/badge/Neverland%20Contract%20Types-v1.0.1%20%C2%B7%20Monad%20mainnet%20%28143%29%20%C2%B7%20MIT-192170?style=for-the-badge" alt="Neverland Contract Types v1.0.1 - Monad mainnet (143) - MIT"/></a>
</p>

Typed ABIs for Neverland protocol smart contracts using ABIType.

## Package

The package is published as:

```bash
npm install @neverland-money/contract-types
```

The published package includes:

- `dist/esm/`: ES module build, used by bundlers through the `module` field.
- `dist/cjs/`: CommonJS build, used by `require` through the `main` field.
- `README.md` and `CHANGELOG.md`.

Example import:

```typescript
import { dustLockAbi, erc20Abi } from '@neverland-money/contract-types';
```

## Available ABIs

- `dustLockAbi`: DustLock veNFT contract
- `erc20Abi`: Standard ERC20 token
- `wethGatewayLegacyAbi`: WETH Gateway for deposits/withdrawals
- `neverlandDustHelperAbi`: Helper contract for DUST operations
- `neverlandUiProviderAbi`: UI data provider
- `revenueRewardAbi`: Revenue reward distribution
- `multicall3Abi`: Multicall3 for batch calls
- `dustLockTransferStrategyAbi`: Transfer strategy for DustLock
- `dustRewardsControllerAbi`: Rewards controller

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

```typescript
import type {
  DustLockAbi,
  Erc20Abi,
  NeverlandUiProviderAbi,
} from '@neverland-money/contract-types';

// Use types in your application
function createDustLockContract(address: string): Contract<DustLockAbi> {
  // ...
}
```

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
```

## Layout

- `src/abis/*.json`: the ABI files, copied from the compiled `neverland-contracts` sources.
- `src/abis/*.ts`: typed export for each ABI, and `src/abis/index.ts` re-exporting them.
- `src/types.ts`: ABI type aliases such as `DustLockAbi`.
- `src/abis/abis.test.ts`: tests for the ABIs.
- `dist/`: generated build output, not committed.

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
