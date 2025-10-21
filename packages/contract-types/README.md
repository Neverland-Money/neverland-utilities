# @neverland-money/contract-types

Typed ABIs for Neverland protocol smart contracts using ABIType.

## Installation

This package is part of the Neverland utilities monorepo and uses Yarn workspaces.

```bash
yarn install
```

## Available ABIs

- `dustLockAbi` - DustLock veNFT contract
- `erc20Abi` - Standard ERC20 token
- `wethGatewayLegacyAbi` - WETH Gateway for deposits/withdrawals
- `neverlandDustHelperAbi` - Helper contract for DUST operations
- `neverlandUiProviderAbi` - UI data provider
- `revenueRewardAbi` - Revenue reward distribution
- `multicall3Abi` - Multicall3 for batch calls
- `dustLockTransferStrategyAbi` - Transfer strategy for DustLock
- `dustRewardsControllerAbi` - Rewards controller

## Usage

### With Viem (Recommended)

```typescript
import { createPublicClient, http, getContract } from 'viem';
import { monad } from 'viem/chains';
import { dustLockAbi, erc20Abi } from '@neverland-money/contract-types';

// Create a client
const client = createPublicClient({
  chain: monad,
  transport: http()
});

// Get a typed contract instance
const dustLock = getContract({
  address: '0x...',
  abi: dustLockAbi,
  client
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
  NeverlandUiProviderAbi 
} from '@neverland-money/contract-types';

// Use types in your application
function createDustLockContract(address: string): Contract<DustLockAbi> {
  // ...
}
```

## Building

```bash
yarn build
```

## Type Checking

```bash
yarn check-types
```

## Benefits over Typechain

- ✅ **Zero runtime overhead** - just types
- ✅ **Works with Viem, Ethers v5, and Ethers v6**
- ✅ **No code generation needed**
- ✅ **Smaller bundle size**
- ✅ **Better type inference**
- ✅ **Easier to maintain**
- ✅ **Native JSON import support**

