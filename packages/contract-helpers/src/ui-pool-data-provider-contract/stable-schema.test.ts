import { OfflineProvider } from '../__tests__/offline-provider';
import { UiPoolDataProvider } from './index';

const address = '0x1111111111111111111111111111111111111111';

describe('legacy stable-debt ABI schema compatibility (Neverland stable borrowing is disabled)', () => {
  it.each([0n, 900719925474099312345678n])(
    'decodes synthetic principal/rate %s exactly',
    async amount => {
      const provider = new OfflineProvider();
      provider.mockContract({
        getUserReservesData: () => [
          [
            {
              underlyingAsset: address,
              scaledATokenBalance: 0n,
              usageAsCollateralEnabledOnUser: false,
              stableBorrowRate: amount,
              scaledVariableDebt: 0n,
              principalStableDebt: amount,
              stableBorrowLastUpdateTimestamp: 123n,
            },
          ],
          0n,
        ],
      });
      const helper = new UiPoolDataProvider({
        uiPoolDataProviderAddress: address,
        provider,
        chainId: 143,
      });
      const { userReserves } = await helper.getUserReservesHumanized({
        lendingPoolAddressProvider: address,
        user: address,
      });
      expect(userReserves[0]).toMatchObject({
        principalStableDebt: amount.toString(),
        stableBorrowRate: amount.toString(),
        stableBorrowLastUpdateTimestamp: 123,
      });
    },
  );

  it('rejects unsafe synthetic stable-debt timestamps instead of rounding', async () => {
    const provider = new OfflineProvider();
    provider.mockContract({
      getUserReservesData: () => [
        [
          {
            underlyingAsset: address,
            scaledATokenBalance: 0n,
            usageAsCollateralEnabledOnUser: false,
            stableBorrowRate: 0n,
            scaledVariableDebt: 0n,
            principalStableDebt: 0n,
            stableBorrowLastUpdateTimestamp: 9007199254740992n,
          },
        ],
        0n,
      ],
    });
    const helper = new UiPoolDataProvider({
      uiPoolDataProviderAddress: address,
      provider,
      chainId: 143,
    });
    await expect(
      helper.getUserReservesHumanized({ lendingPoolAddressProvider: address, user: address }),
    ).rejects.toThrow('overflow');
  });
});
