import type { Provider, TransactionRequest } from 'ethers';

/** Lending gas policy. Native helpers retain the base service's direct estimate. */
export const estimateGas = async (
  tx: TransactionRequest,
  provider: Provider,
  gasSurplus = 30,
): Promise<bigint> => {
  if (!Number.isSafeInteger(gasSurplus) || gasSurplus < 0)
    throw new RangeError('Gas surplus must be a nonnegative safe integer');
  const estimated = await provider.estimateGas(tx);
  return estimated + (estimated * BigInt(gasSurplus)) / 100n;
};

export const estimateGasByNetwork = estimateGas;
