import vectors from './__fixtures__/financial-regression-vectors.json';
import { ReserveMock } from './mocks';
import {
  calculateCompoundedInterest,
  formatReserveUSD,
  formatUserSummary,
  getCompoundedBalance,
  getLinearBalance,
  getReserveNormalizedIncome,
  rayDivCeil,
  rayMul,
  valueToBigNumber,
} from './index';

type Market = (typeof vectors.markets)[number];
type Account = Market['accounts'][number];
type Reserve = Market['reserves'][number];
type Category = { id: number; ltv: string; liquidationThreshold: string; assetPrice?: string };
type Override = { asset: string; scaledATokenBalance: string; configuration: string };
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const units = (value: string, decimals: number) =>
  valueToBigNumber(value).shiftedBy(decimals).toFixed(0);

function reserveInput(reserve: Reserve) {
  const configuration = BigInt(reserve.configuration);
  const bits = (offset: number, width: number) =>
    ((configuration / 2n ** BigInt(offset)) % 2n ** BigInt(width)).toString();
  return {
    ...new ReserveMock({ decimals: reserve.decimals }).reserve,
    originalId: Number(reserve.id),
    id: reserve.asset,
    underlyingAsset: reserve.asset,
    usageAsCollateralEnabled: BigInt(reserve.ltv) > 0n,
    reserveFactor: bits(64, 16),
    baseLTVasCollateral: reserve.ltv,
    reserveLiquidationThreshold: reserve.liquidationThreshold,
    reserveLiquidationBonus: bits(32, 16),
    liquidityIndex: reserve.liquidityIndex,
    liquidityRate: reserve.currentLiquidityRate,
    variableBorrowIndex: reserve.variableBorrowIndex,
    variableBorrowRate: reserve.currentVariableBorrowRate,
    lastUpdateTimestamp: Number(reserve.lastUpdateTimestamp),
    eModeCategoryId: reserve.eModeCategory,
    priceInMarketReferenceCurrency: reserve.price,
    borrowCap: bits(80, 36),
    supplyCap: bits(116, 36),
    debtCeiling: bits(212, 40),
    isolationModeTotalDebt: reserve.isolationModeTotalDebt,
    unbacked: reserve.unbacked,
  };
}

// Only metadata and reserve-wide liquidity totals use neutral mock defaults.
// Every reserve remains in account valuation, including zero user balances.
function summaryInput(market: Market, account: Account, override?: Override) {
  const bitmap = BigInt(override?.configuration ?? account.configuration);
  const userEmodeCategoryId = Number(account.eModeCategoryId);
  const category: Category | undefined = market.categories.find(
    row => row.id === userEmodeCategoryId,
  );
  return {
    currentTimestamp: market.currentTimestamp,
    marketReferencePriceInUsd: '100000000',
    marketReferenceCurrencyDecimals: 8,
    userEmodeCategoryId,
    legacyEMode: category && {
      id: category.id,
      ltv: category.ltv,
      liquidationThreshold: category.liquidationThreshold,
      priceInMarketReferenceCurrency: category.assetPrice,
    },
    userReserves: account.reserves.map(position => {
      const reserve = market.reserves.find(row => same(row.asset, position.asset));
      if (!reserve) throw new Error(`Missing reserve ${position.asset}`);
      return {
        underlyingAsset: position.asset,
        scaledATokenBalance:
          override && same(override.asset, position.asset)
            ? override.scaledATokenBalance
            : position.scaledATokenBalance,
        scaledVariableDebt: position.scaledVariableDebt,
        currentStableDebt: position.currentStableDebt,
        usageAsCollateralEnabledOnUser: (bitmap / 2n ** (2n * BigInt(reserve.id) + 1n)) % 2n !== 0n,
        borrowingEnabledOnUser: (bitmap / 2n ** (2n * BigInt(reserve.id))) % 2n !== 0n,
      };
    }),
    formattedReserves: market.reserves.map(reserve =>
      formatReserveUSD({
        reserve: reserveInput(reserve),
        currentTimestamp: market.currentTimestamp,
        marketReferencePriceInUsd: '100000000',
        marketReferenceCurrencyDecimals: 8,
      }),
    ),
  };
}

function expectFormattedBalances(
  market: Market,
  account: Account,
  result: ReturnType<typeof formatUserSummary>,
  override?: { asset: string; expectedNTokenBalance: string },
) {
  for (const position of account.reserves) {
    const reserve = market.reserves.find(row => same(row.asset, position.asset));
    const row = result.userReservesData.find(row => same(row.underlyingAsset, position.asset));
    if (!reserve || !row) throw new Error(`Missing formatted reserve ${position.asset}`);
    expect(row.normalizedIncome).toBe(reserve.expectedNormalizedIncome);
    expect(row.normalizedVariableDebt).toBe(reserve.expectedNormalizedVariableDebt);
    expect(units(row.underlyingBalance, reserve.decimals)).toBe(
      override && same(override.asset, position.asset)
        ? override.expectedNTokenBalance
        : position.expectedNTokenBalance,
    );
    expect(units(row.variableBorrows, reserve.decimals)).toBe(position.expectedVTokenBalance);
    expect(position.currentStableDebt).toBe('0');
  }
}

function state(marketName: string, accountAddress: string, asset: string) {
  const market = vectors.markets.find(row => row.name === marketName);
  const account = market?.accounts.find(row => same(row.account, accountAddress));
  const reserve = market?.reserves.find(row => same(row.asset, asset));
  if (!market || !account || !reserve) throw new Error('Missing financial regression state');
  return { market, account, reserve };
}

for (const market of vectors.markets) {
  describe(`${market.name} financial regressions`, () => {
    for (const reserve of market.reserves) {
      const common = {
        currentTimestamp: market.currentTimestamp,
        lastUpdateTimestamp: Number(reserve.lastUpdateTimestamp),
      };
      it(`${reserve.asset} normalized income`, () => {
        expect(
          getReserveNormalizedIncome({
            ...common,
            rate: reserve.currentLiquidityRate,
            index: reserve.liquidityIndex,
          }).toFixed(0),
        ).toBe(reserve.expectedNormalizedIncome);
      });
      it(`${reserve.asset} normalized variable debt`, () => {
        const factor = calculateCompoundedInterest({
          ...common,
          rate: reserve.currentVariableBorrowRate,
        });
        expect(rayMul(factor, reserve.variableBorrowIndex).toFixed(0)).toBe(
          reserve.expectedNormalizedVariableDebt,
        );
      });
      it(`${reserve.asset} retains the zero stable-debt supply observation`, () => {
        expect(reserve.expectedStableDebtTotalSupply).toBe('0');
      });
      for (const account of market.accounts) {
        const position = account.reserves.find(row => same(row.asset, reserve.asset));
        if (!position) throw new Error(`Missing account reserve ${reserve.asset}`);
        it(`${account.account} ${reserve.asset} nToken floor balance`, () => {
          expect(
            getLinearBalance({
              ...common,
              balance: position.scaledATokenBalance,
              index: reserve.liquidityIndex,
              rate: reserve.currentLiquidityRate,
            }).toFixed(0),
          ).toBe(position.expectedNTokenBalance);
        });
        it(`${account.account} ${reserve.asset} vToken ceil balance`, () => {
          expect(
            getCompoundedBalance({
              ...common,
              principalBalance: position.scaledVariableDebt,
              reserveIndex: reserve.variableBorrowIndex,
              reserveRate: reserve.currentVariableBorrowRate,
            }).toFixed(0),
          ).toBe(position.expectedVTokenBalance);
        });
      }
    }

    for (const account of market.accounts) {
      it(`${account.account} six account fields, formatter balances, and same-timestamp indexes`, () => {
        const result = formatUserSummary(summaryInput(market, account));
        expect(result.poolAccountData).toEqual(account.expectedAccountData);
        expectFormattedBalances(market, account, result);
      });
    }
  });
}

describe('withdrawal rounding and health factors', () => {
  for (const fixture of vectors.withdrawals) {
    it(`${fixture.id}: ceiling burn and floor balance preserve the complete account tuple`, () => {
      const { market, account, reserve } = state(fixture.market, fixture.account, fixture.asset);
      const override = {
        asset: fixture.asset,
        scaledATokenBalance: fixture.observedInputOverrides.scaledATokenBalance,
        configuration: fixture.derivedInputOverrides.userConfiguration,
      };
      const result = formatUserSummary(summaryInput(market, account, override));
      expect(result.poolAccountData).toEqual(fixture.expectedAccountData);
      expect(
        result.healthFactor === '-1'
          ? (2n ** 256n - 1n).toString()
          : units(result.healthFactor, 18),
      ).toBe(fixture.expectedAccountData.healthFactor);
      expectFormattedBalances(market, account, result, {
        asset: fixture.asset,
        expectedNTokenBalance: fixture.observedInputOverrides.nTokenBalance,
      });
      const burned = rayDivCeil(fixture.withdrawalAmount, fixture.normalizedIncome).toFixed(0);
      expect(burned).toBe(
        (
          BigInt(fixture.pretransaction.scaledATokenBalance) -
          BigInt(fixture.observedInputOverrides.scaledATokenBalance)
        ).toString(),
      );
      const remaining = (
        BigInt(fixture.pretransaction.scaledATokenBalance) - BigInt(burned)
      ).toString();
      expect(remaining).toBe(fixture.observedInputOverrides.scaledATokenBalance);
      const balance = getLinearBalance({
        currentTimestamp: market.currentTimestamp,
        lastUpdateTimestamp: Number(reserve.lastUpdateTimestamp),
        balance: remaining,
        index: reserve.liquidityIndex,
        rate: reserve.currentLiquidityRate,
      }).toFixed(0);
      expect(balance).toBe(fixture.observedInputOverrides.nTokenBalance);
      expect((BigInt(fixture.nominalBalanceSubtraction) - BigInt(balance)).toString()).toBe(
        fixture.extraReductionBeyondNominal,
      );
    });
  }

  for (const fixture of vectors.healthFactorBoundaryCases) {
    it(`${fixture.id}: hypothetical source-formula state has HF below one`, () => {
      const { market, account, reserve } = state(fixture.market, fixture.account, fixture.asset);
      const result = formatUserSummary(
        summaryInput(market, account, {
          asset: fixture.asset,
          scaledATokenBalance: fixture.scaledATokenBalance,
          configuration: fixture.userConfiguration,
        }),
      );
      expect(result.poolAccountData).toEqual(fixture.expectedAccountData);
      expect(units(result.healthFactor, 18)).toBe(fixture.expectedAccountData.healthFactor);
      expect(BigInt(fixture.expectedAccountData.healthFactor)).toBeLessThan(10n ** 18n);
      expectFormattedBalances(market, account, result, fixture);
      expect(
        getLinearBalance({
          currentTimestamp: market.currentTimestamp,
          lastUpdateTimestamp: Number(reserve.lastUpdateTimestamp),
          balance: fixture.scaledATokenBalance,
          index: reserve.liquidityIndex,
          rate: reserve.currentLiquidityRate,
        }).toFixed(0),
      ).toBe(fixture.expectedNTokenBalance);
    });
  }
});
