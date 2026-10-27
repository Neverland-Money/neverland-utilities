import { neverlandUiProviderAbi } from '@neverland-money/contract-types';
import type { Abi, ExtractAbiFunctionNames } from 'abitype';
import { Interface } from 'ethers';
import { decodeAbiResult, type AbiDecodedOutputs } from '../commons/abi-types';
import type { DecodedUserEmissionBreakdown } from './types';

const METHOD = 'getUserEmissionBreakdown';
// Historical output fragments are used only to decode returned bytes.
const parallelAbi = [
  {
    type: 'function',
    name: METHOD,
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'assets', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
    ],
  },
] as const;
const fourFieldAbi = [
  {
    type: 'function',
    name: METHOD,
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: 'breakdown',
        type: 'tuple[]',
        components: [
          { name: 'asset', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'symbol', type: 'string' },
          { name: 'isDebt', type: 'bool' },
        ],
      },
    ],
  },
] as const;
const parallelInterface = new Interface(parallelAbi);
const fourFieldInterface = new Interface(fourFieldAbi);
const currentInterface = new Interface(neverlandUiProviderAbi);

function decodeCanonical<A extends Abi, N extends ExtractAbiFunctionNames<A>>(
  iface: Interface,
  abi: A,
  name: N,
  data: string,
): AbiDecodedOutputs<A, N> {
  const result = decodeAbiResult(iface, abi, name, data);
  const values: unknown = result;
  if (!Array.isArray(values) || iface.encodeFunctionResult(name, values).toLowerCase() !== data)
    throw new Error('Noncanonical emission breakdown encoding');
  return result;
}

/** Decode one exact historical/current output layout; unavailable metadata remains null. */
export function decodeUserEmissionBreakdown(data: string): DecodedUserEmissionBreakdown {
  const normalized = `0x${data.replace(/^0x/i, '')}`.toLowerCase();
  if (!/^0x(?:[\da-f]{2})+$/.test(normalized))
    throw new Error('Invalid emission breakdown hex data');

  const candidates: Array<() => DecodedUserEmissionBreakdown> = [
    () => {
      const result = decodeCanonical(parallelInterface, parallelAbi, METHOD, normalized);
      if (result.assets.length !== result.amounts.length)
        throw new Error('Mismatched legacy emission breakdown arrays');
      return {
        assets: Array.from(result.assets),
        amounts: Array.from(result.amounts),
        symbols: null,
        sides: null,
        resolved: null,
        enumerationResolved: null,
      };
    },
    () => {
      const result = decodeCanonical(fourFieldInterface, fourFieldAbi, METHOD, normalized);
      return {
        assets: Array.from(result.breakdown, row => row.asset),
        amounts: Array.from(result.breakdown, row => row.amount),
        symbols: Array.from(result.breakdown, row => row.symbol),
        sides: Array.from(result.breakdown, row => row.isDebt),
        resolved: null,
        enumerationResolved: null,
      };
    },
    () => {
      const result = decodeCanonical(currentInterface, neverlandUiProviderAbi, METHOD, normalized);
      return {
        assets: Array.from(result.breakdown, row => row.asset),
        amounts: Array.from(result.breakdown, row => row.amount),
        symbols: Array.from(result.breakdown, row => row.symbol),
        sides: Array.from(result.breakdown, row => row.isDebt),
        resolved: Array.from(result.breakdown, row => row.resolved),
        enumerationResolved: result.enumerationResolved,
      };
    },
  ];
  const matches: DecodedUserEmissionBreakdown[] = [];
  for (const candidate of candidates) {
    try {
      matches.push(candidate());
    } catch {
      // A candidate is accepted only after exact decoding and canonical re-encoding.
    }
  }

  if (matches.length !== 1)
    throw new Error('Unsupported, malformed, or ambiguous emission breakdown data');
  return matches[0];
}
