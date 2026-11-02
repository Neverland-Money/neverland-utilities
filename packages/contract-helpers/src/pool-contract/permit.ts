import { address, UINT256_MAX, unsignedDecimal } from './validation';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface BuildErc2612PermitTypedDataParams {
  domain: {
    name: string;
    version: string;
    chainId: string | number;
    verifyingContract: string;
  };
  owner: string;
  spender: string;
  valueRaw: string;
  nonceRaw: string;
  deadline: string | number;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Public interface retains consumer declaration merging.
export interface Erc2612PermitTypedData {
  domain: {
    name: string;
    version: string;
    chainId: string;
    verifyingContract: string;
  };
  types: { Permit: Array<{ name: string; type: string }> };
  primaryType: 'Permit';
  message: {
    owner: string;
    spender: string;
    value: string;
    nonce: string;
    deadline: string;
  };
}

/**
 * Build ERC-2612 typed data without probing, signing, or assuming token support.
 * Domain name/version must be supplied and verified by the caller. Numeric
 * message values and domain.chainId are exact decimal strings for ethers.
 */
export function buildErc2612PermitTypedData({
  domain,
  owner,
  spender,
  valueRaw,
  nonceRaw,
  deadline,
}: BuildErc2612PermitTypedDataParams): Erc2612PermitTypedData {
  for (const field of ['name', 'version'] as const) {
    if (typeof domain[field] !== 'string' || domain[field].trim().length === 0) {
      throw new TypeError(`domain.${field} must be an explicit nonempty string`);
    }
  }

  const chainId = unsignedDecimal(domain.chainId, 'domain.chainId', UINT256_MAX, true);
  if (chainId === '0') throw new RangeError('domain.chainId must be positive');
  return {
    domain: {
      name: domain.name,
      version: domain.version,
      chainId,
      verifyingContract: address(domain.verifyingContract, 'domain.verifyingContract'),
    },
    types: {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Permit',
    message: {
      owner: address(owner, 'owner'),
      spender: address(spender, 'spender'),
      value: unsignedDecimal(valueRaw, 'valueRaw', UINT256_MAX - 1n),
      nonce: unsignedDecimal(nonceRaw, 'nonceRaw'),
      deadline: unsignedDecimal(deadline, 'deadline', UINT256_MAX, true),
    },
  };
}
