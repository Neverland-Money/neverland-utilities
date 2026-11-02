import { getAddress, isAddress, ZeroAddress } from 'ethers';
import { InterestRate } from '../commons/types';
import { API_ETH_MOCK_ADDRESS } from '../commons/utils';

export const UINT256_MAX = 2n ** 256n - 1n;

/** Neverland lending has no stable debt, so every mode except Stable selects variable debt (2), as the gateway does. */
export function legacyRateMode(value: InterestRate | undefined): 1 | 2 {
  return value === InterestRate.Stable ? 1 : 2;
}

export function assertErc20Reserve(reserve: string, method: string): void {
  if (reserve.toLowerCase() === API_ETH_MOCK_ADDRESS.toLowerCase()) {
    throw new TypeError(`${method} requires the wrapped token; the native sentinel is unsupported`);
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

/**
 * A positive raw uint256 amount for builders whose protocol action rejects zero. Callers that
 * support the '-1' maximum map it to MaxUint256 first; blank, signed and prefixed strings throw.
 */
export function positiveRawAmount(value: unknown, name = 'amount'): bigint {
  const amount = BigInt(unsignedDecimal(value, name));
  if (amount === 0n) throw new RangeError(`${name} must be positive`);
  return amount;
}

export function address(value: string, name: string): string {
  if (typeof value !== 'string' || !isAddress(value)) {
    throw new TypeError(`${name} must be an Ethereum address`);
  }

  return getAddress(value);
}

/**
 * The checksummed form of a pool, token or user address. Throws for an unset or malformed value,
 * address(0) and the native sentinel, so a populated `to` can never be empty (which would make the
 * request a contract creation) or an unprefixed or ICAP spelling that ethers resolves through ENS.
 */
export function finiteAddress(value: string, name: string): string {
  const normalized = address(value, name);
  if (
    normalized === ZeroAddress ||
    normalized.toLowerCase() === API_ETH_MOCK_ADDRESS.toLowerCase()
  ) {
    throw new TypeError(
      `${name} must be a nonzero ERC20/pool/user address; native sentinels are unsupported`,
    );
  }

  return normalized;
}
