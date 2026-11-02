import { FeeData } from 'ethers';
import { OfflineProvider } from '../__tests__/offline-provider';
import { type ERC20_2612Interface, ERC20_2612Service } from '.';

describe('ERC20_2612', () => {
  const provider: OfflineProvider = new OfflineProvider();
  jest
    .spyOn(provider, 'getFeeData')
    .mockImplementation(async () => Promise.resolve(new FeeData(1n)));
  describe('Initialize', () => {
    it('Expects to be initialized correctly', () => {
      const instance: ERC20_2612Interface = new ERC20_2612Service(provider);
      expect(instance instanceof ERC20_2612Service).toEqual(true);
    });
  });
  describe('getNonce', () => {
    const token = '0x0000000000000000000000000000000000000001';
    const owner = '0x0000000000000000000000000000000000000002';

    afterEach(() => {
      jest.clearAllMocks();
    });
    it('Expects to get Nonce from nonces method', async () => {
      const nonceSpy = provider.mockContract({
        nonces: async () => Promise.resolve(BigInt('1')),
      });

      const instance: ERC20_2612Interface = new ERC20_2612Service(provider);
      const nonce = await instance.getNonce({ token, owner });
      expect(nonce).toEqual(1n);
      expect(nonceSpy).toHaveBeenCalled();
    });
    it('Expects to get null nonce if standard nonces is unsupported', async () => {
      const nonceSpy = provider.mockContract({
        async nonces() {
          throw new Error('Nonce read failed');
        },
      });

      const instance: ERC20_2612Interface = new ERC20_2612Service(provider);
      const nonce = await instance.getNonce({ token, owner });
      expect(nonce).toEqual(null);
      expect(nonceSpy).toHaveBeenCalledTimes(1);
    });
    it('Expects to fail if token is not eth address', async () => {
      const instance: ERC20_2612Interface = new ERC20_2612Service(provider);
      const token = 'asdf';
      await expect(async () => instance.getNonce({ token, owner })).rejects.toThrow(
        new Error(`Address: ${token} is not a valid ethereum Address`),
      );
    });
    it('Expects to fail if owner is not eth address', async () => {
      const instance: ERC20_2612Interface = new ERC20_2612Service(provider);
      const owner = 'asdf';
      await expect(async () => instance.getNonce({ token, owner })).rejects.toThrow(
        new Error(`Address: ${owner} is not a valid ethereum Address`),
      );
    });
  });
});
