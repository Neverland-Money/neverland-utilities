import {
  AbiBaseService,
  DustLockHelper,
  ERC20Service,
  ERC20_2612Service,
  NeverlandUiService,
  Pool,
  PoolBundle,
  UiPoolDataProvider,
  WETHGatewayLegacyAdapter,
} from '@neverland-money/contract-helpers';
import type { UiPoolDataProviderContext } from '@neverland-money/contract-helpers';
import type {
  AbiContract,
  AbiDecodedOutputs,
} from '@neverland-money/contract-helpers/dist/__BUILD__/commons/abi-types.js';
import type { LPSupplyWithPermitType } from '@neverland-money/contract-helpers/dist/__BUILD__/pool-contract/pool-types.js';
import { Pool as DeepPool } from '@neverland-money/contract-helpers/dist/__BUILD__/pool-contract/pool.js';
import { UiPoolDataProvider as DeepReader } from '@neverland-money/contract-helpers/dist/__BUILD__/ui-pool-data-provider-contract/index.js';
import {
  type dustRewardsControllerAbi,
  erc20Abi,
  type multicall3Abi,
  type revenueRewardAbi,
} from '@neverland-money/contract-types';
import type {
  Contract,
  ContractTransactionResponse,
  Interface,
  Network,
  Provider,
  SignatureLike,
  TransactionRequest,
} from 'ethers';

declare const provider: Provider;
declare const signature: SignatureLike;
declare const signedSupply: LPSupplyWithPermitType;
type ExpectTrue<T extends true> = T;
type RewardsData = AbiDecodedOutputs<typeof dustRewardsControllerAbi, 'getRewardsData'>;
type RewardTokens = AbiDecodedOutputs<typeof revenueRewardAbi, 'getRewardTokens'>;
type Aggregate = AbiContract<typeof multicall3Abi, 'aggregate3'>['aggregate3'];
type Approve = AbiContract<typeof erc20Abi, 'approve'>['approve'];
type Decimals = AbiContract<typeof erc20Abi, 'decimals'>['decimals'];
export type AbiResultConsumerChecks = [
  ExpectTrue<'' extends keyof RewardsData ? false : true>,
  ExpectTrue<RewardsData[2] extends bigint ? true : false>,
  ExpectTrue<RewardTokens['tokens'] extends string[] ? true : false>,
  ExpectTrue<RewardTokens[0] extends string[] ? true : false>,
  ExpectTrue<ReturnType<Aggregate> extends Promise<ContractTransactionResponse> ? true : false>,
  ExpectTrue<
    ReturnType<Aggregate['staticCall']> extends Promise<
      Array<{ success: boolean; returnData: string }>
    >
      ? true
      : false
  >,
  ExpectTrue<ReturnType<Approve> extends Promise<ContractTransactionResponse> ? true : false>,
  ExpectTrue<ReturnType<Approve['staticCall']> extends Promise<boolean> ? true : false>,
  ExpectTrue<ReturnType<Decimals> extends Promise<bigint> ? true : false>,
  ExpectTrue<ReturnType<Decimals['staticCall']> extends Promise<bigint> ? true : false>,
];
const address = '0x0000000000000000000000000000000000000001';
const context: UiPoolDataProviderContext = {
  provider,
  chainId: 143,
  uiPoolDataProviderAddress: address,
};
const constructed0 = new UiPoolDataProvider(context);
const constructed1 = new DeepReader(context);
const constructed2 = new Pool(provider, { POOL: address });
const constructed3 = new DeepPool(provider, { POOL: address });
const constructed4 = new PoolBundle(provider, { POOL: address });
const constructed5 = new ERC20_2612Service(provider);
const constructed6 = new WETHGatewayLegacyAdapter(provider, undefined, address);
const constructed7 = new DustLockHelper({
  provider,
  lockAddress: address,
  dustTokenAddress: address,
});
const constructed8 = new NeverlandUiService(address, provider);
signedSupply.signature = signature;
const base = new AbiBaseService(provider, erc20Abi);
const outputProvider: Provider = base.provider;
const outputNetwork: Promise<Network> = base.provider.getNetwork();
const outputContract: Contract = base.getContractInstance(address);
const outputInterface: Interface = base.iface;
const outputTransaction: TransactionRequest = new ERC20Service(provider).approveTxData({
  user: address,
  token: address,
  spender: address,
  amount: '1',
});
export const consumerTypes = [
  constructed0,
  constructed1,
  constructed2,
  constructed3,
  constructed4,
  constructed5,
  constructed6,
  constructed7,
  constructed8,
  outputProvider,
  outputNetwork,
  outputContract,
  outputInterface,
  outputTransaction,
];
