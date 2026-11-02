import BigNumber from 'bignumber.js';
import { type BigNumberValue, valueToBigNumber, valueToZDBigNumber } from './bignumber';
import { SECONDS_PER_YEAR, LTV_PRECISION } from './constants';
import * as RayMath from './ray.math';

type CalculateCompoundedInterestRequest = {
  rate: BigNumberValue;
  currentTimestamp: number;
  lastUpdateTimestamp: number;
};

export function calculateCompoundedInterest({
  rate,
  currentTimestamp,
  lastUpdateTimestamp,
}: CalculateCompoundedInterestRequest): BigNumber {
  const timeDelta = valueToZDBigNumber(currentTimestamp - lastUpdateTimestamp);
  if (timeDelta.isZero()) return RayMath.RAY;
  const rateBN = valueToZDBigNumber(rate);
  // MathUtils.sol: retain the annual-rate multiplication before each division.
  const powerTwo = RayMath.rayMul(rateBN, rateBN).dividedToIntegerBy(
    valueToZDBigNumber(SECONDS_PER_YEAR).pow(2),
  );
  const powerThree = RayMath.rayMul(powerTwo, rateBN).dividedToIntegerBy(SECONDS_PER_YEAR);
  const second = timeDelta
    .multipliedBy(timeDelta.minus(1))
    .multipliedBy(powerTwo)
    .dividedToIntegerBy(2);
  const third = timeDelta
    .multipliedBy(timeDelta.minus(1))
    .multipliedBy(timeDelta.gt(2) ? timeDelta.minus(2) : 0)
    .multipliedBy(powerThree)
    .dividedToIntegerBy(6);
  return RayMath.RAY.plus(rateBN.multipliedBy(timeDelta).dividedToIntegerBy(SECONDS_PER_YEAR))
    .plus(second)
    .plus(third);
}

type CompoundedBalanceRequest = {
  principalBalance: BigNumberValue;
  reserveIndex: BigNumberValue;
  reserveRate: BigNumberValue;
  lastUpdateTimestamp: number;
  currentTimestamp: number;
};

export function getCompoundedBalance({
  principalBalance: _principalBalance,
  reserveIndex,
  reserveRate,
  lastUpdateTimestamp,
  currentTimestamp,
}: CompoundedBalanceRequest): BigNumber {
  const principalBalance = valueToZDBigNumber(_principalBalance);
  if (principalBalance.eq('0')) {
    return principalBalance;
  }

  const compoundedInterest = calculateCompoundedInterest({
    rate: reserveRate,
    currentTimestamp,
    lastUpdateTimestamp,
  });
  const cumulatedInterest = RayMath.rayMul(compoundedInterest, reserveIndex);
  return RayMath.rayMulCeil(principalBalance, cumulatedInterest);
}

type LinearInterestRequest = {
  rate: BigNumberValue;
  currentTimestamp: number;
  lastUpdateTimestamp: number;
};

export function calculateLinearInterest({
  rate,
  currentTimestamp,
  lastUpdateTimestamp,
}: LinearInterestRequest): BigNumber {
  const timeDelta = valueToZDBigNumber(currentTimestamp - lastUpdateTimestamp);
  return valueToZDBigNumber(rate)
    .multipliedBy(timeDelta)
    .dividedToIntegerBy(SECONDS_PER_YEAR)
    .plus(RayMath.RAY);
}

type ReserveNormalizedIncomeRequest = {
  rate: BigNumberValue;
  index: BigNumberValue;
  lastUpdateTimestamp: number;
  currentTimestamp: number;
};
export function getReserveNormalizedIncome({
  rate,
  index,
  lastUpdateTimestamp,
  currentTimestamp,
}: ReserveNormalizedIncomeRequest): BigNumber {
  if (valueToZDBigNumber(rate).eq('0')) {
    return valueToZDBigNumber(index);
  }

  const cumulatedInterest = calculateLinearInterest({
    rate,
    currentTimestamp,
    lastUpdateTimestamp,
  });

  return RayMath.rayMul(cumulatedInterest, index);
}

type LinearBalanceRequest = {
  balance: BigNumberValue;
  index: BigNumberValue;
  rate: BigNumberValue;
  lastUpdateTimestamp: number;
  currentTimestamp: number;
};
export function getLinearBalance({
  balance,
  index,
  rate,
  lastUpdateTimestamp,
  currentTimestamp,
}: LinearBalanceRequest) {
  return RayMath.rayMulFloor(
    balance,
    getReserveNormalizedIncome({
      rate,
      index,
      lastUpdateTimestamp,
      currentTimestamp,
    }),
  );
}

type HealthFactorFromBalanceRequest = {
  collateralBalanceMarketReferenceCurrency: BigNumberValue;
  borrowBalanceMarketReferenceCurrency: BigNumberValue;
  currentLiquidationThreshold: BigNumberValue;
};

export function calculateHealthFactorFromBalances({
  borrowBalanceMarketReferenceCurrency,
  collateralBalanceMarketReferenceCurrency,
  currentLiquidationThreshold,
}: HealthFactorFromBalanceRequest): BigNumber {
  if (valueToBigNumber(borrowBalanceMarketReferenceCurrency).eq(0)) {
    return valueToBigNumber('-1'); // Invalid number
  }

  const debt = valueToBigNumber(borrowBalanceMarketReferenceCurrency);
  // Aggregate integer inputs reproduce GenericLogic's wadDiv then /10000 order.
  // Fractional inputs remain accepted for synthetic previews; see README limits.
  return valueToBigNumber(collateralBalanceMarketReferenceCurrency)
    .multipliedBy(currentLiquidationThreshold)
    .multipliedBy(RayMath.WAD)
    .plus(debt.dividedToIntegerBy(2))
    .dividedToIntegerBy(debt)
    .dividedToIntegerBy(10 ** LTV_PRECISION)
    .shiftedBy(-18);
}

type HealthFactorFromBalanceBigUnitsRequest = {
  collateralBalanceMarketReferenceCurrency: BigNumberValue;
  borrowBalanceMarketReferenceCurrency: BigNumberValue;
  currentLiquidationThreshold: BigNumberValue;
};
export function calculateHealthFactorFromBalancesBigUnits({
  collateralBalanceMarketReferenceCurrency,
  borrowBalanceMarketReferenceCurrency,
  currentLiquidationThreshold,
}: HealthFactorFromBalanceBigUnitsRequest): BigNumber {
  return calculateHealthFactorFromBalances({
    collateralBalanceMarketReferenceCurrency,
    borrowBalanceMarketReferenceCurrency,
    currentLiquidationThreshold: valueToBigNumber(currentLiquidationThreshold)
      .shiftedBy(LTV_PRECISION)
      .decimalPlaces(0, BigNumber.ROUND_DOWN),
  });
}

type AvailableBorrowsMarketReferenceCurrencyRequest = {
  collateralBalanceMarketReferenceCurrency: BigNumberValue;
  borrowBalanceMarketReferenceCurrency: BigNumberValue;
  currentLtv: BigNumberValue;
};

export function calculateAvailableBorrowsMarketReferenceCurrency({
  collateralBalanceMarketReferenceCurrency,
  borrowBalanceMarketReferenceCurrency,
  currentLtv,
}: AvailableBorrowsMarketReferenceCurrencyRequest): BigNumber {
  if (valueToZDBigNumber(currentLtv).eq(0)) {
    return valueToZDBigNumber('0');
  }

  const availableBorrowsMarketReferenceCurrency = valueToZDBigNumber(
    collateralBalanceMarketReferenceCurrency,
  )
    .multipliedBy(currentLtv)
    .shiftedBy(LTV_PRECISION * -1)
    .integerValue(BigNumber.ROUND_FLOOR)
    .minus(borrowBalanceMarketReferenceCurrency);
  return availableBorrowsMarketReferenceCurrency.gt('0')
    ? availableBorrowsMarketReferenceCurrency
    : valueToZDBigNumber('0');
}

type MarketReferenceCurrencyAndUsdBalanceRequest = {
  balance: BigNumberValue;
  priceInMarketReferenceCurrency: BigNumberValue;
  marketReferenceCurrencyDecimals: number;
  decimals: number;
  marketReferencePriceInUsdNormalized: BigNumberValue;
};

type MarketReferenceAndUsdBalanceResponse = {
  marketReferenceCurrencyBalance: BigNumber;
  usdBalance: BigNumber;
};
/**
 * @returns non humanized/normalized values for usd/marketReference
 */
export function getMarketReferenceCurrencyAndUsdBalance({
  balance,
  priceInMarketReferenceCurrency,
  marketReferenceCurrencyDecimals,
  decimals,
  marketReferencePriceInUsdNormalized,
}: MarketReferenceCurrencyAndUsdBalanceRequest): MarketReferenceAndUsdBalanceResponse {
  const marketReferenceCurrencyBalance = valueToZDBigNumber(balance)
    .multipliedBy(priceInMarketReferenceCurrency)
    .shiftedBy(decimals * -1);
  const usdBalance = marketReferenceCurrencyBalance
    .multipliedBy(marketReferencePriceInUsdNormalized)
    .shiftedBy(marketReferenceCurrencyDecimals * -1);
  return { marketReferenceCurrencyBalance, usdBalance };
}
