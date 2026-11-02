const SECONDS_PER_YEAR = 31_536_000;

export type VeDustPowerEstimateParams = {
  /** Human DUST units, not a raw token amount. */
  dustAmount: number;
  /** Lock end in Unix seconds. */
  endTimestamp: number;
  /** Caller-selected current time in Unix seconds. */
  currentTimestamp: number;
  isPermanent: boolean;
};

/** Two-decimal display estimate; does not reproduce on-chain integer checkpoints. */
export function estimateVeDustPower({
  dustAmount,
  endTimestamp,
  currentTimestamp,
  isPermanent,
}: VeDustPowerEstimateParams): number {
  if (isPermanent) return dustAmount;
  const remaining = Math.max(0, endTimestamp - currentTimestamp);
  const ve = dustAmount * (remaining / SECONDS_PER_YEAR);
  return Math.round(ve * 100) / 100;
}

/** Annualize raw token units before any conversion to a human-number amount. */
export function annualizeEmissionRaw(emissionPerSecond: bigint): bigint {
  return emissionPerSecond * BigInt(SECONDS_PER_YEAR);
}

/** Display percent APR from human token/USD units, retaining JavaScript number semantics. */
export function emissionAprPercent(
  annualEmissionTokens: number,
  rewardPriceUSD: number,
  tvlUSD: number,
): string {
  if (tvlUSD <= 0) return '0';
  const annualEmissionsUSD = annualEmissionTokens * rewardPriceUSD;
  const aprDecimal = annualEmissionsUSD / tvlUSD;
  return (aprDecimal * 100).toFixed(4);
}
