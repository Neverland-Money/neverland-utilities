import {
  dustLockAbi,
  erc20Abi,
  wethGatewayLegacyAbi,
  neverlandDustHelperAbi,
  neverlandUiProviderAbi,
  revenueRewardAbi,
  multicall3Abi,
  dustLockTransferStrategyAbi,
  dustRewardsControllerAbi,
} from './abis';

// Export typed ABI types for use with Viem or other type-safe libraries
export type DustLockAbi = typeof dustLockAbi;
export type Erc20Abi = typeof erc20Abi;
export type WethGatewayLegacyAbi = typeof wethGatewayLegacyAbi;
export type NeverlandDustHelperAbi = typeof neverlandDustHelperAbi;
export type NeverlandUiProviderAbi = typeof neverlandUiProviderAbi;
export type RevenueRewardAbi = typeof revenueRewardAbi;
export type Multicall3Abi = typeof multicall3Abi;
export type DustLockTransferStrategyAbi = typeof dustLockTransferStrategyAbi;
export type DustRewardsControllerAbi = typeof dustRewardsControllerAbi;
