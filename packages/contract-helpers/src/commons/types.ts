import type { TransactionRequest } from 'ethers';
import type {
  LPBorrowParamsType,
  LPRepayParamsType,
  LPRepayWithATokensType,
  LPSignedRepayParamsType,
} from '../pool-contract/pool-types';
export { InterestRate } from '../interest-rate';
export enum eEthereumTxType {
  ERC20_APPROVAL = 'ERC20_APPROVAL',
  DLP_ACTION = 'DLP_ACTION',
  REWARD_ACTION = 'REWARD_ACTION',
}
export enum ProtocolAction {
  default = 'default',
  supply = 'supply',
  borrow = 'borrow',
  withdraw = 'withdraw',
  deposit = 'deposit',
  repay = 'repay',
  repayETH = 'repayETH',
  repayWithATokens = 'repayWithATokens',
  withdrawETH = 'withdrawETH',
  borrowETH = 'borrwoETH',
  supplyWithPermit = 'supplyWithPermit',
  repayWithPermit = 'repayWithPermit',
  approval = 'approval',
  creditDelegationApproval = 'creditDelegationApproval',
  setEModeUsage = 'setEModeUsage',
  claimRewards = 'claimRewards',
  setUsageAsCollateral = 'setUsageAsCollateral',
}

export type tEthereumAddress = string;

export enum ChainId {
  monad = 143,
  monad_testnet = 10143,
  mainnet = 1,
  ropsten = 3,
  rinkeby = 4,
  goerli = 5,
  kovan = 42,
  xdai = 100,
  polygon = 137,
  mumbai = 80001,
  avalanche = 43114,
  fuji = 43113, // avalanche test network
  arbitrum_one = 42161,
  arbitrum_goerli = 421613,
  arbitrum_sepolia = 421614,
  fantom = 250,
  fantom_testnet = 4002,
  optimism = 10,
  optimism_sepolia = 11155420,
  harmony = 1666600000,
  harmony_testnet = 1666700000,
  zkevm_testnet = 1402,
  sepolia = 11155111,
  scroll_alpha = 534353,
  scroll_sepolia = 534351,
  scroll = 534352,
  metis_andromeda = 1088,
  base = 8453,
  base_sepolia = 84532,
  bnb = 56,
  zksync = 324,
  linea = 59144,
  sonic = 146,
  celo = 42220,
  soneium = 1868,
}

export type GasRecommendationType = Record<
  string,
  {
    limit: string;
    recommended: string;
  }
>;

export type transactionType = TransactionRequest;

export type EthereumTransactionTypeExtended = {
  txType: eEthereumTxType;
  tx: () => Promise<transactionType>;
  gas: GasResponse;
};

export type TransactionGenerationMethod = {
  rawTxMethod: () => Promise<TransactionRequest>;
  from: tEthereumAddress;
  value?: string;
  gasSurplus?: number;
  action?: ProtocolAction;
};

export type TransactionGenerationMethodNew = {
  tx: TransactionRequest;
  gasSurplus?: number;
  action?: ProtocolAction;
  skipGasEstimation?: boolean;
};

export type GasType = {
  gasLimit: string | undefined;
  gasPrice: string;
};

export type GasResponse = (force?: boolean) => Promise<GasType | null>;

export type BorrowTxBuilder = {
  generateTxData: ({
    user,
    reserve,
    amount,
    interestRateMode,
    debtTokenAddress,
    onBehalfOf,
    referralCode,
  }: LPBorrowParamsType) => TransactionRequest;
};

export type RepayTxBuilder = {
  generateTxData: (params: LPRepayParamsType) => TransactionRequest;
  generateSignedTxData: (params: LPSignedRepayParamsType) => TransactionRequest;
};

export type RepayWithATokensTxBuilder = {
  generateTxData: (params: LPRepayWithATokensType) => TransactionRequest;
};

export const ChainIdToNetwork: Record<number, string> = {
  143: 'monad',
  10143: 'monad_testnet',
  1: 'mainnet',
  3: 'ropsten',
  4: 'rinkeby',
  5: 'goerli',
  42: 'kovan',
  100: 'xDAI',
  137: 'polygon',
  80001: 'mumbai',
  43114: 'avalanche',
  43113: 'fuji',
  42161: 'arbitrum_one',
  421613: 'arbitrum_goerli',
  421614: 'arbitrum_sepolia',
  250: 'fantom_opera',
  4002: 'fantom_testnet',
  10: 'optimism',
  11155420: 'optimism_sepolia',
  1666600000: 'harmony',
  1666700000: 'harmony_testnet',
  11155111: 'sepolia',
  534353: 'scroll_alpha',
  534351: 'scroll_sepolia',
  534352: 'scroll',
  1088: 'metis_andromeda',
  8453: 'base',
  84532: 'base_sepolia',
  56: 'bnb',
  324: 'zksync',
  59144: 'linea',
  146: 'sonic',
  42220: 'celo',
  1868: 'soneium',
};
