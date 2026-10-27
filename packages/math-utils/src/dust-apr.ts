import { annualizeEmissionRaw } from './neverland';

const UINT256_MAX = 2n ** 256n - 1n;
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
const USD8 = 100_000_000n;
/** DUST emissions are raw 18-decimal units; this kernel does not generalize reward decimals. */
const DUST_DECIMALS = 18;

export type DustMarketAPRInputs = {
  emissionPerSecond: bigint;
  distributionEnd: bigint;
  nowSeconds: bigint;
  totalSupplyRaw?: bigint;
  assetDecimals?: number;
  rewardPriceUsd8?: bigint;
  assetPriceUsd8?: bigint;
};

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Preserve the public interface and consumer declaration merging.
export interface MarketAPR {
  apr: number;
  isActive: boolean;
  emissionPerSecond: string;
  distributionEnd: number;
  totalSupply?: string;
  annualEmissions?: string;
  /**
   * USD value of the supply, the APR's denominator: supply normalized to 18 decimals times the
   * asset USD8 price, as a decimal string truncated to 18 decimals (for example '1000000.0').
   * Present only on live results, like `totalSupply`; weight cross-market averages by it.
   */
  totalSupplyUSD?: string;
}

/** An unreadable or invalid input is distinct from a resolved dormant campaign. */
export class UnresolvedDustAPRInputError extends Error {
  readonly reason: string;
  override readonly cause?: unknown;

  constructor(reason: string, cause?: unknown) {
    super(`DUST APR input unresolved: ${reason}`);
    this.name = 'UnresolvedDustAPRInputError';
    this.reason = reason;
    this.cause = cause;
  }
}

function uint256(value: unknown, field: string): bigint {
  if (typeof value !== 'bigint' || value < 0n || value > UINT256_MAX) {
    throw new UnresolvedDustAPRInputError(`${field} must be a nonnegative uint256 bigint`);
  }

  return value;
}

function positivePrice(value: unknown, field: string): bigint {
  if (typeof value !== 'bigint' || value <= 0n) {
    throw new UnresolvedDustAPRInputError(`${field} must be a positive USD8 bigint`);
  }

  return value;
}

/** Format an 18-decimal fixed-point value the way ethers `formatUnits(value, 18)` does. */
function formatUsd18(value: bigint): string {
  const unit = 10n ** BigInt(DUST_DECIMALS);
  const fraction = (value % unit).toString().padStart(DUST_DECIMALS, '0').replace(/0+$/, '');
  return `${(value / unit).toString()}.${fraction || '0'}`;
}

function safeNumber(value: bigint, field: string): number {
  if (value > MAX_SAFE_INTEGER) {
    throw new UnresolvedDustAPRInputError(`${field} exceeds the safe integer display range`);
  }

  return Number(value);
}

/**
 * Annualized DUST percent APR, truncated to two decimals in the app's integer operation order.
 * Raw DUST emissions use 18 decimals. Asset supply uses its own decimals and exact USD8 prices.
 * Dormant campaigns omit the unread supply and annual projection; live unresolved inputs throw.
 * Intermediate offchain products intentionally have no uint256 cap.
 */
export function calculateMarketAPRFromInputs(input: DustMarketAPRInputs): MarketAPR {
  if (!input || typeof input !== 'object') {
    throw new UnresolvedDustAPRInputError('market APR inputs are missing');
  }

  const emissionPerSecond = uint256(input.emissionPerSecond, 'emissionPerSecond');
  const distributionEnd = uint256(input.distributionEnd, 'distributionEnd');
  const nowSeconds = uint256(input.nowSeconds, 'nowSeconds');
  const displayedEnd = safeNumber(distributionEnd, 'distributionEnd');
  const base = {
    emissionPerSecond: emissionPerSecond.toString(),
    distributionEnd: displayedEnd,
  };
  if (emissionPerSecond === 0n || distributionEnd <= nowSeconds) {
    return { apr: 0, isActive: false, ...base };
  }

  const totalSupplyRaw = uint256(input.totalSupplyRaw, 'totalSupplyRaw');
  const { assetDecimals } = input;
  if (
    typeof assetDecimals !== 'number' ||
    !Number.isInteger(assetDecimals) ||
    assetDecimals < 0 ||
    assetDecimals > 255
  ) {
    throw new UnresolvedDustAPRInputError('assetDecimals must be an integer in 0..255');
  }

  const rewardPriceUsd8 = positivePrice(input.rewardPriceUsd8, 'rewardPriceUsd8');
  const assetPriceUsd8 = positivePrice(input.assetPriceUsd8, 'assetPriceUsd8');
  const annualEmissions = annualizeEmissionRaw(emissionPerSecond);
  const annualRewardValue = (annualEmissions * rewardPriceUsd8) / USD8;
  const decimalGap = DUST_DECIMALS - assetDecimals;
  const scale = 10n ** BigInt(Math.abs(decimalGap));
  const normalizedSupply = decimalGap >= 0 ? totalSupplyRaw * scale : totalSupplyRaw / scale;
  const supplyValue = (normalizedSupply * assetPriceUsd8) / USD8;
  if (supplyValue <= 0n) {
    throw new UnresolvedDustAPRInputError('live emission over a zero denominator');
  }

  const aprScaled100 = (annualRewardValue * 10_000n) / supplyValue;
  return {
    ...base,
    apr: safeNumber(aprScaled100, 'APR') / 100,
    isActive: true,
    totalSupply: totalSupplyRaw.toString(),
    annualEmissions: annualEmissions.toString(),
    totalSupplyUSD: formatUsd18(supplyValue),
  };
}
