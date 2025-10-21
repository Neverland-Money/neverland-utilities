# Usage Examples

## Basic Contract Interaction

### Reading Contract State

```typescript
import { createPublicClient, http } from 'viem';
import { monad } from 'viem/chains';
import { dustLockAbi, erc20Abi } from '@neverland-money/contract-types';

const client = createPublicClient({
  chain: monad,
  transport: http()
});

// Read DustLock NFT balance
const nftBalance = await client.readContract({
  address: '0x...',
  abi: dustLockAbi,
  functionName: 'balanceOfNFT',
  args: [tokenId]
});

// Read ERC20 balance
const tokenBalance = await client.readContract({
  address: '0x...',
  abi: erc20Abi,
  functionName: 'balanceOf',
  args: ['0xUserAddress']
});
```

### Writing to Contracts

```typescript
import { createWalletClient, custom } from 'viem';
import { monad } from 'viem/chains';
import { dustLockAbi } from '@neverland-money/contract-types';

const walletClient = createWalletClient({
  chain: monad,
  transport: custom(window.ethereum)
});

// Create a lock
const hash = await walletClient.writeContract({
  address: '0x...',
  abi: dustLockAbi,
  functionName: 'createLock',
  args: [amount, duration]
});
```

## Multicall Pattern

```typescript
import { createPublicClient, http } from 'viem';
import { monad } from 'viem/chains';
import { multicall3Abi, erc20Abi } from '@neverland-money/contract-types';

const client = createPublicClient({
  chain: monad,
  transport: http()
});

// Batch multiple calls in one RPC request
const results = await client.multicall({
  contracts: [
    {
      address: '0xToken1',
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: ['0xUser']
    },
    {
      address: '0xToken2',
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: ['0xUser']
    }
  ]
});

console.log('Token1 balance:', results[0].result);
console.log('Token2 balance:', results[1].result);
```

## Event Listening

```typescript
import { createPublicClient, http, parseAbiItem } from 'viem';
import { monad } from 'viem/chains';
import { dustLockAbi } from '@neverland-money/contract-types';

const client = createPublicClient({
  chain: monad,
  transport: http()
});

// Watch for Deposit events
const unwatch = client.watchContractEvent({
  address: '0x...',
  abi: dustLockAbi,
  eventName: 'Deposit',
  onLogs: logs => {
    logs.forEach(log => {
      console.log('New deposit:', {
        provider: log.args.provider,
        tokenId: log.args.tokenId,
        value: log.args.value
      });
    });
  }
});

// Later: unwatch()
```

## UI Data Provider Pattern

```typescript
import { createPublicClient, http } from 'viem';
import { monad } from 'viem/chains';
import { neverlandUiProviderAbi } from '@neverland-money/contract-types';

const client = createPublicClient({
  chain: monad,
  transport: http()
});

// Get comprehensive protocol data in one call
const reservesData = await client.readContract({
  address: '0x...',
  abi: neverlandUiProviderAbi,
  functionName: 'getReservesData',
  args: [poolAddressesProvider]
});

// Data is fully typed
reservesData.forEach(reserve => {
  console.log('Reserve:', reserve.symbol);
  console.log('Total Supply:', reserve.totalSupply);
  console.log('Available Liquidity:', reserve.availableLiquidity);
});
```

## Rewards Claiming

```typescript
import { createWalletClient, custom } from 'viem';
import { monad } from 'viem/chains';
import { dustRewardsControllerAbi } from '@neverland-money/contract-types';

const walletClient = createWalletClient({
  chain: monad,
  transport: custom(window.ethereum)
});

const [account] = await walletClient.getAddresses();

// Claim all rewards for a user
const hash = await walletClient.writeContract({
  address: '0x...',
  abi: dustRewardsControllerAbi,
  functionName: 'claimAllRewards',
  args: [assets, account],
  account
});

console.log('Claim transaction:', hash);
```

## Type-Safe Contract Factory

```typescript
import { getContract, type PublicClient } from 'viem';
import { dustLockAbi, erc20Abi } from '@neverland-money/contract-types';

export function createDustLockContract(
  address: `0x${string}`,
  client: PublicClient
) {
  return getContract({
    address,
    abi: dustLockAbi,
    client
  });
}

export function createERC20Contract(
  address: `0x${string}`,
  client: PublicClient
) {
  return getContract({
    address,
    abi: erc20Abi,
    client
  });
}

// Usage
const dustLock = createDustLockContract('0x...', client);
const balance = await dustLock.read.balanceOfNFT([tokenId]); // Fully typed!
```

## React Hook Example

```typescript
import { useContractRead } from 'wagmi';
import { dustLockAbi } from '@neverland-money/contract-types';

export function useDustLockBalance(tokenId: bigint) {
  return useContractRead({
    address: '0x...',
    abi: dustLockAbi,
    functionName: 'balanceOfNFT',
    args: [tokenId],
    watch: true // Subscribe to updates
  });
}

// In component
function MyComponent() {
  const { data: balance, isLoading } = useDustLockBalance(1n);
  
  if (isLoading) return <div>Loading...</div>;
  return <div>Balance: {balance?.toString()}</div>;
}
```

## Error Handling

```typescript
import { createPublicClient, http, ContractFunctionExecutionError } from 'viem';
import { dustLockAbi } from '@neverland-money/contract-types';

try {
  const result = await client.readContract({
    address: '0x...',
    abi: dustLockAbi,
    functionName: 'balanceOfNFT',
    args: [tokenId]
  });
} catch (error) {
  if (error instanceof ContractFunctionExecutionError) {
    console.error('Contract error:', error.message);
    console.error('Function:', error.functionName);
    console.error('Args:', error.args);
  }
}
```

