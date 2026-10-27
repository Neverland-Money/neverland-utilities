import { OfflineProvider } from '../__tests__/offline-provider';
import { estimateGas, estimateGasByNetwork } from './gas-station';

describe('gasStation', () => {
  const provider: OfflineProvider = new OfflineProvider();
  const tx = {};
  jest.spyOn(provider, 'estimateGas').mockImplementation(async () => Promise.resolve(BigInt(100)));
  describe('estimateGas', () => {
    it('Expects to use default surplus', async () => {
      const gas = await estimateGas(tx, provider);
      expect(gas).toEqual(BigInt(130));
    });
    it('Expects to use specified surplus', async () => {
      const gas = await estimateGas(tx, provider, 10);
      expect(gas).toEqual(BigInt(110));
    });
  });
  describe('estimateGasByNetwork', () => {
    it('Expects to use default surplus', async () => {
      const gas = await estimateGasByNetwork(tx, provider);
      expect(gas).toEqual(BigInt(130));
    });
    it('Expects to use specified surplus', async () => {
      const gas = await estimateGasByNetwork(tx, provider, 10);
      expect(gas).toEqual(BigInt(110));
    });
  });
});
