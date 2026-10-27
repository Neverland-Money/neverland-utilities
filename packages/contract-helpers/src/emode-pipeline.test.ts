import { formatReserves, formatUserSummary } from '@neverland-money/math-utils';
import { synthesizeEModesFromReserves } from '.';

const RAY = `1${'0'.repeat(27)}`;
const ONE_TOKEN = `1${'0'.repeat(18)}`;
const PRICE_ONE = '100000000';

/** A reserve shaped like UiPoolDataProvider.getReservesHumanized output on lending-core 1.1. */
function reserve(originalId: number, eModeCategoryId: number, baseLTVasCollateral = '6500') {
  const underlyingAsset = `0x${(originalId + 0xa0).toString(16).padStart(40, '0')}`;
  return {
    originalId,
    id: underlyingAsset,
    symbol: `R${originalId}`,
    name: `Reserve ${originalId}`,
    decimals: 18,
    underlyingAsset,
    usageAsCollateralEnabled: baseLTVasCollateral !== '0',
    borrowingEnabled: true,
    reserveFactor: '0',
    baseLTVasCollateral,
    liquidityIndex: RAY,
    reserveLiquidationThreshold: '7000',
    reserveLiquidationBonus: '10500',
    variableBorrowIndex: RAY,
    variableBorrowRate: '0',
    availableLiquidity: `1000000${ONE_TOKEN.slice(1)}`,
    liquidityRate: '0',
    totalScaledVariableDebt: '0',
    lastUpdateTimestamp: 1000,
    borrowCap: '0',
    supplyCap: '0',
    debtCeiling: '0',
    debtCeilingDecimals: 2,
    isolationModeTotalDebt: '0',
    unbacked: '0',
    virtualAccActive: false,
    virtualUnderlyingBalance: '0',
    priceInMarketReferenceCurrency: PRICE_ONE,
    eModeCategoryId,
    eModeLtv: 8800,
    eModeLiquidationThreshold: 9000,
    eModeLiquidationBonus: 10100,
    eModeLabel: 'MON LSTs',
  };
}

function summary(
  reserves: Array<ReturnType<typeof reserve>>,
  eModes?: ReturnType<typeof synthesizeEModesFromReserves>,
) {
  const formattedReserves = formatReserves({
    reserves,
    eModes,
    currentTimestamp: 1000,
    marketReferencePriceInUsd: PRICE_ONE,
    marketReferenceCurrencyDecimals: 8,
  });
  return {
    formattedReserves,
    request: {
      currentTimestamp: 1000,
      marketReferencePriceInUsd: PRICE_ONE,
      marketReferenceCurrencyDecimals: 8,
      formattedReserves,
      userEmodeCategoryId: 1,
      userReserves: [
        {
          underlyingAsset: reserves[0].underlyingAsset,
          scaledATokenBalance: `100${ONE_TOKEN.slice(1)}`,
          usageAsCollateralEnabledOnUser: true,
          scaledVariableDebt: '0',
        },
        {
          underlyingAsset: reserves[1].underlyingAsset,
          scaledATokenBalance: '0',
          usageAsCollateralEnabledOnUser: false,
          scaledVariableDebt: `80${ONE_TOKEN.slice(1)}`,
        },
      ],
    },
  };
}

describe('E-mode decoder to formatter pipeline', () => {
  it('rebuilds categories from embedded reserve fields', () => {
    const eModes = synthesizeEModesFromReserves([reserve(0, 1), reserve(1, 1), reserve(2, 0)]);
    expect(eModes).toEqual([
      {
        id: 1,
        eMode: {
          ltv: '8800',
          liquidationThreshold: '9000',
          liquidationBonus: '10100',
          label: 'MON LSTs',
          collateralBitmap: `${'0'.repeat(254)}11`,
          borrowableBitmap: `${'0'.repeat(254)}11`,
        },
      },
    ]);
  });

  it('reproduces GenericLogic account values for an E-mode user', () => {
    const reserves = [reserve(0, 1), reserve(1, 1)];
    const { request } = summary(reserves, synthesizeEModesFromReserves(reserves));
    const result = formatUserSummary(request);
    // GenericLogic: HF = 100 * 0.90 / 80, available borrows = 100 * 0.88 - 80.
    expect(result.healthFactor).toBe('1.125');
    expect(result.currentLiquidationThreshold).toBe('0.9');
    expect(result.currentLoanToValue).toBe('0.88');
    expect(result.availableBorrowsUSD).toBe('8');
  });

  it('applies category parameters to a member collateral with a zero base LTV', () => {
    const reserves = [reserve(0, 1, '0'), reserve(1, 1)];
    const eModes = synthesizeEModesFromReserves(reserves);
    expect(eModes[0].eMode.collateralBitmap.endsWith('11')).toBe(true);
    const result = formatUserSummary(summary(reserves, eModes).request);
    expect(result.currentLoanToValue).toBe('0.88');
    expect(result.healthFactor).toBe('1.125');
  });

  it('refuses an E-mode user when no category data reached the formatter', () => {
    const { request } = summary([reserve(0, 1), reserve(1, 1)]);
    expect(() => formatUserSummary(request)).toThrow('has no E-mode category data');
  });

  it('accepts the decoder numeric fields as legacyEMode', () => {
    const reserves = [reserve(0, 1), reserve(1, 1)];
    const { request } = summary(reserves);
    const result = formatUserSummary({
      ...request,
      legacyEMode: {
        id: 1,
        ltv: reserves[0].eModeLtv,
        liquidationThreshold: reserves[0].eModeLiquidationThreshold,
      },
    });
    expect(result.healthFactor).toBe('1.125');
  });
});
