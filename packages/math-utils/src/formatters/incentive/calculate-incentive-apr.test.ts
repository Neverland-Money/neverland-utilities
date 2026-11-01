import { ReserveIncentiveMock, UserReserveMock } from '../../mocks';
import { calculateReserveDebt } from '../reserve/calculate-reserve-debt';
import { calculateIncentiveAPR } from './calculate-incentive-apr';

describe('calculateIncentiveAPR', () => {
  const userReserveMock = new UserReserveMock().supply(100).variableBorrow(50);
  const reserveIncentiveMock = new ReserveIncentiveMock();
  it('calculates incentives APR', () => {
    const { totalLiquidity } = calculateReserveDebt(userReserveMock.reserve, 1);
    const result = calculateIncentiveAPR({
      emissionPerSecond:
        reserveIncentiveMock.reserveIncentive.aIncentiveData.rewardsTokenInformation[0]
          .emissionPerSecond,
      rewardTokenPriceInMarketReferenceCurrency:
        reserveIncentiveMock.reserveIncentive.aIncentiveData.rewardsTokenInformation[0]
          .rewardPriceFeed,
      totalTokenSupply: totalLiquidity.toString(),
      priceInMarketReferenceCurrency: userReserveMock.reserve.priceInMarketReferenceCurrency,
      decimals: userReserveMock.reserve.decimals,
      rewardTokenDecimals:
        reserveIncentiveMock.reserveIncentive.aIncentiveData.rewardsTokenInformation[0]
          .rewardTokenDecimals,
    });

    expect(result).toEqual('0.000021024');
  });

  it('does not report infinite APR for an empty or unpriced supply', () => {
    const request = {
      emissionPerSecond: '1000000000000000000',
      rewardTokenPriceInMarketReferenceCurrency: '1',
      totalTokenSupply: '0',
      priceInMarketReferenceCurrency: '1',
      decimals: 18,
      rewardTokenDecimals: 18,
    };
    expect(calculateIncentiveAPR(request)).toBe('0');
    expect(
      calculateIncentiveAPR({
        ...request,
        totalTokenSupply: '1',
        priceInMarketReferenceCurrency: '0',
      }),
    ).toBe('0');
  });
});
