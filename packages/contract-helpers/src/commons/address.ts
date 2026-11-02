import { getAddress, isAddress, ZeroAddress } from 'ethers';
import { API_ETH_MOCK_ADDRESS } from './utils';

const NATIVE_SENTINEL = getAddress(API_ETH_MOCK_ADDRESS);

/** The checksummed form of any spelling ethers accepts: 0x hex in any case, unprefixed hex or ICAP. */
function canonicalAddress(value: unknown): string | undefined {
  return typeof value === 'string' && isAddress(value) ? getAddress(value) : undefined;
}

/** True for every spelling of address(0). A string that is not an address is never zero. */
export function isZeroAddress(value: unknown): value is string {
  return canonicalAddress(value) === ZeroAddress;
}

/** True for every spelling of the API_ETH_MOCK_ADDRESS native sentinel. */
export function isNativeSentinel(value: unknown): value is string {
  return canonicalAddress(value) === NATIVE_SENTINEL;
}

/**
 * Reject a beneficiary or recipient that would credit or pay address(0) or the keyless native
 * sentinel. A value that is not an address, such as an omitted '', is left to the caller.
 */
export function assertBeneficiary(value: unknown, name: string): void {
  if (isZeroAddress(value)) throw new TypeError(`${name} must not be the zero address`);
  if (isNativeSentinel(value)) {
    throw new TypeError(`${name} must not be the native sentinel ${API_ETH_MOCK_ADDRESS}`);
  }
}

/** The checksummed gateway; throws when it is unset, malformed, address(0) or the native sentinel in any spelling. */
export function nonzeroGatewayAddress(value: unknown): string {
  const gateway = canonicalAddress(value);
  if (gateway === undefined || gateway === ZeroAddress) {
    throw new TypeError('WETH_GATEWAY must be a nonzero Ethereum address');
  }

  if (gateway === NATIVE_SENTINEL) {
    throw new TypeError(`WETH_GATEWAY must not be the native sentinel ${API_ETH_MOCK_ADDRESS}`);
  }

  return gateway;
}
