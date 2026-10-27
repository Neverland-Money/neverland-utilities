import { BigNumber as BigNumberJs } from 'bignumber.js';
import { MaxUint256 } from 'ethers';
import { type GasRecommendationType, ProtocolAction } from './types';

export const valueToWei = (value: string, decimals: number): string => {
  return new BigNumberJs(value).shiftedBy(decimals).toFixed(0);
};

export const decimalsToCurrencyUnits = (value: string, decimals: number): string =>
  new BigNumberJs(value).shiftedBy(decimals * -1).toFixed();
// .div(new BigNumberJs(10).pow(decimals)).toFixed();

export const getTxValue = (reserve: string, amount: string): string => {
  return reserve.toLowerCase() === API_ETH_MOCK_ADDRESS.toLowerCase()
    ? amount
    : DEFAULT_NULL_VALUE_ON_TX;
};

export const DEFAULT_NULL_VALUE_ON_TX = '0x00';
export const DEFAULT_APPROVE_AMOUNT = MaxUint256.toString();
export const MAX_UINT_AMOUNT =
  '115792089237316195423570985008687907853269984665640564039457584007913129639935';
export const SUPER_BIG_ALLOWANCE_NUMBER =
  '11579208923731619542357098500868790785326998466564056403945758400791';
export const API_ETH_MOCK_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

export const gasLimitRecommendations: GasRecommendationType = {
  [ProtocolAction.default]: {
    limit: '210000',
    recommended: '210000',
  },
  [ProtocolAction.approval]: {
    limit: '65000',
    recommended: '65000',
  },
  [ProtocolAction.creditDelegationApproval]: {
    limit: '55000',
    recommended: '55000',
  },
  [ProtocolAction.supply]: {
    limit: '300000',
    recommended: '300000',
  },
  [ProtocolAction.deposit]: {
    limit: '300000',
    recommended: '300000',
  },
  [ProtocolAction.borrow]: {
    limit: '400000',
    recommended: '400000',
  },
  [ProtocolAction.withdraw]: {
    limit: '230000',
    recommended: '300000',
  },
  [ProtocolAction.repay]: {
    limit: '300000',
    recommended: '300000',
  },
  [ProtocolAction.repayETH]: {
    limit: '350000',
    recommended: '300000',
  },
  [ProtocolAction.borrowETH]: {
    limit: '450000',
    recommended: '450000',
  },
  [ProtocolAction.withdrawETH]: {
    limit: '640000',
    recommended: '640000',
  },
  [ProtocolAction.supplyWithPermit]: {
    limit: '350000',
    recommended: '350000',
  },
  [ProtocolAction.repayWithPermit]: {
    limit: '350000',
    recommended: '350000',
  },
  [ProtocolAction.claimRewards]: {
    limit: '275000',
    recommended: '275000',
  },
  [ProtocolAction.setUsageAsCollateral]: {
    limit: '138000',
    recommended: '138000',
  },
  [ProtocolAction.repayWithATokens]: {
    limit: '300000',
    recommended: '300000',
  },
};

export function expectToBeDefined<T>(value: T | undefined): asserts value is T {
  if (value === undefined) {
    throw new Error('Expected value to be defined');
  }
}
