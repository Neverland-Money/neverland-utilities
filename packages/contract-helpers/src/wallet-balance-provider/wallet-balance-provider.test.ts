import { getAddress } from 'ethers';
import { OfflineProvider } from '../__tests__/offline-provider';
import { WalletBalanceProvider } from '.';

describe('WalletBalanceProvider', () => {
  const mockValidEthereumAddress = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984';
  const mockInvalidEthereumAddress = '0x0';

  const createValidInstance = () => {
    const provider = new OfflineProvider();
    const instance = new WalletBalanceProvider({
      walletBalanceProviderAddress: mockValidEthereumAddress,
      provider,
    });
    provider.mockContract({
      balanceOf: async () => 123n,
      batchBalanceOf: async () => [7n, 9n],
      getUserWalletBalances: async () => [[mockValidEthereumAddress], [55n]],
    });

    return instance;
  };

  describe('balanceOf', () => {
    it('should throw if user is not a valid ethereum address', async () => {
      const instance = createValidInstance();
      await expect(
        instance.balanceOf(mockInvalidEthereumAddress, mockValidEthereumAddress),
      ).rejects.toThrow('User address is not a valid ethereum address');
    });

    it('should throw if token is not a valid ethereum address', async () => {
      const instance = createValidInstance();
      await expect(
        instance.balanceOf(mockValidEthereumAddress, mockInvalidEthereumAddress),
      ).rejects.toThrow('Token address is not a valid ethereum address');
    });

    it('should not throw if user and token are a valid ethereum address', async () => {
      const instance = createValidInstance();
      await expect(
        instance.balanceOf(mockValidEthereumAddress, mockValidEthereumAddress),
      ).resolves.toBe(123n);
    });
  });

  describe('batchBalanceOf', () => {
    it('should throw if one of the user addresses is not a valid ethereum address', async () => {
      const instance = createValidInstance();
      await expect(
        instance.batchBalanceOf(
          [mockInvalidEthereumAddress, mockValidEthereumAddress],
          [mockValidEthereumAddress],
        ),
      ).rejects.toThrow('One of the user address is not a valid ethereum address');
    });

    it('should throw if one of the token addresses is not a valid ethereum address', async () => {
      const instance = createValidInstance();
      await expect(
        instance.batchBalanceOf(
          [mockValidEthereumAddress],
          [mockInvalidEthereumAddress, mockValidEthereumAddress],
        ),
      ).rejects.toThrow('One of the token address is not a valid ethereum address');
    });

    it('should not throw if users and tokens are a all valid ethereum address', async () => {
      const instance = createValidInstance();
      await expect(
        instance.batchBalanceOf([mockValidEthereumAddress], [mockValidEthereumAddress]),
      ).resolves.toEqual([7n, 9n]);
    });

    it('should not throw if users and tokens and blockHash are a all valid', async () => {
      const instance = createValidInstance();
      await expect(
        instance.batchBalanceOf([mockValidEthereumAddress], [mockValidEthereumAddress], {
          blockTag: 'latest',
        }),
      ).resolves.toEqual([7n, 9n]);
    });
  });

  describe('getUserWalletBalancesForLendingPoolProvider', () => {
    it('should throw if user is not a valid ethereum address', async () => {
      const instance = createValidInstance();
      await expect(
        instance.getUserWalletBalancesForLendingPoolProvider(
          mockInvalidEthereumAddress,
          mockValidEthereumAddress,
        ),
      ).rejects.toThrow('User address is not a valid ethereum address');
    });

    it('should throw if lendingPoolAddressProvider is not a valid ethereum address', async () => {
      const instance = createValidInstance();
      await expect(
        instance.getUserWalletBalancesForLendingPoolProvider(
          mockValidEthereumAddress,
          mockInvalidEthereumAddress,
        ),
      ).rejects.toThrow('Lending pool address provider is not a valid ethereum address');
    });

    it('should not throw if user and lendingPoolAddressProvider are a valid ethereum address', async () => {
      const instance = createValidInstance();
      const [tokens, balances] = await instance.getUserWalletBalancesForLendingPoolProvider(
        mockValidEthereumAddress,
        mockValidEthereumAddress,
      );
      expect([...tokens]).toEqual([getAddress(mockValidEthereumAddress)]);
      expect([...balances]).toEqual([55n]);
    });
  });
});
