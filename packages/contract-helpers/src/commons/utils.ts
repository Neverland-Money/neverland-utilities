import { BigNumber as BigNumberJs } from 'bignumber.js';
import { MaxUint256 } from 'ethers';
import { type GasRecommendationType, ProtocolAction } from './types';

/** A private constructor keeps the default settings; a consumer's BigNumber.config cannot reach it. */
const ExactBigNumber = BigNumberJs.clone();
const MAX_UINT256 = new ExactBigNumber(MaxUint256.toString());
/**
 * Every base-10 spelling Number() accepts: surrounding whitespace, one sign and an exponent. The
 * digit run has one unambiguous split, so the match is linear: no digit can belong to two groups.
 */
const DECIMAL_AMOUNT = /^\s*([+-]?)(\d+(?:\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/;

export const valueToWei = (value: string, decimals: number): string => {
  const parts = DECIMAL_AMOUNT.exec(value);
  if (!parts) {
    throw new RangeError(`Amount ${value} must be a base-10 decimal number`);
  }

  const [, sign, digits, exponent = ''] = parts;
  const baseUnits = new ExactBigNumber(`${sign === '-' ? '-' : ''}${digits}${exponent}`).shiftedBy(
    decimals,
  );
  if (baseUnits.isLessThan(0)) {
    throw new RangeError(`Amount ${value} must not be negative`);
  }

  // An exponent overflow parses to Infinity, which also exceeds MaxUint256.
  if (baseUnits.isGreaterThan(MAX_UINT256)) {
    throw new RangeError(`Amount ${value} exceeds the uint256 range with ${decimals} decimals`);
  }

  // A nonzero amount that parses to zero fell below the exponent range.
  if (!baseUnits.isInteger() || (baseUnits.isZero() && /[1-9]/.test(digits))) {
    throw new RangeError(`Amount ${value} cannot be represented with ${decimals} decimals`);
  }

  return baseUnits.toFixed(0);
};

export const decimalsToCurrencyUnits = (value: string, decimals: number): string =>
  new ExactBigNumber(value).shiftedBy(decimals * -1).toFixed();
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
