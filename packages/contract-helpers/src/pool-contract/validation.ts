import { getAddress, isAddress, ZeroAddress } from 'ethers';
import { InterestRate } from '../commons/types';

export const UINT256_MAX = 2n ** 256n - 1n;

/** Neverland lending has no stable debt, so every mode except Stable selects variable debt (2), as the gateway does. */
export function legacyRateMode(value: InterestRate | undefined): 1 | 2 {
  return value === InterestRate.Stable ? 1 : 2;
}

/** Reject the zero address where the Pool would otherwise credit or debit address(0). */
export function assertNonZeroAddress(value: string | undefined, name: string): void {
  if (typeof value === 'string' && value.toLowerCase() === ZeroAddress) {
    throw new TypeError(`${name} must not be the zero address`);
  }
}

export function unsignedDecimal(
  value: unknown,
  name: string,
  maximum = UINT256_MAX,
  allowNumber = false,
): string {
  let decimal: string;
  if (allowNumber && typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    decimal = value.toString();
  } else if (typeof value === 'string' && /^\d+$/.test(value)) {
    decimal = value.replace(/^0+(?=\d)/, '');
  } else {
    throw new TypeError(
      `${name} must be an unsigned decimal integer${allowNumber ? ' or safe integer number' : ' string'}`,
    );
  }

  if (decimal.length > maximum.toString().length || BigInt(decimal) > maximum) {
    throw new RangeError(`${name} is out of range`);
  }

  return decimal;
}

export function address(value: string, name: string): string {
  if (typeof value !== 'string' || !isAddress(value)) {
    throw new TypeError(`${name} must be an Ethereum address`);
  }

  return getAddress(value);
}
