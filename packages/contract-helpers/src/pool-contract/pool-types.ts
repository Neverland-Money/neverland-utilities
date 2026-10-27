import type { poolAbi } from '@neverland-money/contract-types';
import type { SignatureLike } from 'ethers';
import type { AbiReadOutputs } from '../commons/base-service';

import { type InterestRate, type tEthereumAddress } from '../commons/types';

export type LPSupplyParamsType = {
  user: tEthereumAddress;
  reserve: tEthereumAddress;
  amount: string;
  onBehalfOf?: tEthereumAddress;
  referralCode?: string;
};

export type LPSignedSupplyParamsType = LPSupplyParamsType & {
  signature: SignatureLike;
  deadline: string;
};

export type LPWithdrawParamsType = {
  user: tEthereumAddress;
  reserve: tEthereumAddress;
  amount: string;
  onBehalfOf?: tEthereumAddress;
  aTokenAddress?: tEthereumAddress;
};

export type LPBorrowParamsType = {
  user: tEthereumAddress;
  reserve: tEthereumAddress;
  amount: string;
  interestRateMode: InterestRate;
  debtTokenAddress?: tEthereumAddress;
  onBehalfOf?: tEthereumAddress;
  referralCode?: string;
};

export type LPRepayParamsType = {
  user: tEthereumAddress;
  reserve: tEthereumAddress;
  amount: string;
  interestRateMode: InterestRate;
  onBehalfOf?: tEthereumAddress;
};

export type LPSignedRepayParamsType = LPRepayParamsType & {
  signature: SignatureLike;
  deadline: string;
};

export type LPSetUsageAsCollateral = {
  user: tEthereumAddress;
  reserve: tEthereumAddress;
  usageAsCollateral: boolean;
};

export type LPSupplyWithPermitType = {
  user: tEthereumAddress;
  reserve: tEthereumAddress;
  onBehalfOf?: tEthereumAddress;
  amount: string;
  signature: SignatureLike;
  referralCode?: string;
  deadline: string;
};

export type LPRepayWithPermitParamsType = {
  user: tEthereumAddress;
  reserve: tEthereumAddress;
  amount: string;
  interestRateMode: InterestRate;
  onBehalfOf?: tEthereumAddress;
  signature: SignatureLike;
  deadline: string;
};

export type LPSetUserEModeType = {
  user: string;
  categoryId: number;
};

export type LPRepayWithATokensType = {
  user: string;
  reserve: string;
  amount: string;
  rateMode: InterestRate;
};

export type LPReserveData = AbiReadOutputs<typeof poolAbi, 'getReserveData'>[0];

export type PoolSupplyRawParams = {
  user: string;
  reserve: string;
  amountRaw: string;
  onBehalfOf?: string;
  referralCode?: string;
  zeroFirst?: boolean;
};

export type PoolRepayRawParams = {
  interestRateMode: InterestRate.Stable | InterestRate.Variable;
} & Omit<PoolSupplyRawParams, 'referralCode'>;

export type PoolPermitRawParams = {
  deadline: string | number;
  signature: SignatureLike;
};

export type PoolSupplyWithPermitRawParams = Omit<PoolSupplyRawParams, 'zeroFirst'> &
  PoolPermitRawParams;
export type PoolRepayWithPermitRawParams = Omit<PoolRepayRawParams, 'zeroFirst'> &
  PoolPermitRawParams;
