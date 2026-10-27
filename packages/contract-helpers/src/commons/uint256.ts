import { MaxUint256 } from 'ethers';
import type { BigNumberish } from 'ethers';

/** Parse exact uint256 inputs without ethers' permissive sign normalization. */
export function toUint256(value: BigNumberish, name: string): bigint {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new Error(`${name} must be a safe integer`);
  }

  if (typeof value === 'string' && value.trim().length === 0) {
    throw new Error(`${name} must not be blank`);
  }

  // BigInt() alone would also accept binary/octal prefixes and throw an unlabeled SyntaxError for
  // decimals or exponents.
  if (typeof value === 'string' && !/^\s*(?:\+?\d+|0[xX][\dA-Fa-f]+)\s*$/.test(value)) {
    throw new Error(`${name} must be a decimal or 0x-hex integer string`);
  }

  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') {
    throw new Error(`${name} must be a bigint, string, or safe integer`);
  }

  const parsed = BigInt(value);
  if (parsed < 0n || parsed > MaxUint256) {
    throw new Error(`${name} must be a uint256`);
  }

  return parsed;
}
