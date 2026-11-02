import assert from 'node:assert/strict';
/** Finite retained originals for the ethers 6 lending helpers.
 * The immutable original manifest digest pins the universe; changing this list is a reviewable policy change. */
export const helperOriginalTreeSha256 =
  'dccef910aeb5ad06c2fb14cbfd2c0591527fd5c491276b099645096505ae910d';
export const requiredHelperOriginals = [
  'baseDebtToken-contract/baseDebtToken.test.ts',
  'baseDebtToken-contract/index.ts',
  'commons/BaseService.test.ts',
  'commons/gasStation.test.ts',
  'commons/gasStation.ts',
  'commons/types.ts',
  'commons/utils.test.ts',
  'commons/utils.ts',
  'commons/validators/methodValidators.ts',
  'commons/validators/paramValidators.ts',
  'commons/validators/validations.ts',
  'commons/validators/validators.test.ts',
  'erc20-2612/erc20_2612.test.ts',
  'erc20-2612/index.ts',
  'erc20-contract/erc20.test.ts',
  'erc20-contract/index.ts',
  'v3-UiIncentiveDataProvider-contract/types.ts',
  'v3-UiPoolDataProvider-contract/types.ts',
  'v3-UiPoolDataProvider-legacy-contract/_mocks.ts',
  'v3-UiPoolDataProvider-legacy-contract/index.ts',
  'v3-UiPoolDataProvider-legacy-contract/legacyUiPoolDataProvider.test.ts',
  'v3-pool-contract-bundle/index.ts',
  'v3-pool-contract-bundle/pool-bundle.test.ts',
  'v3-pool-contract/index.ts',
  'v3-pool-contract/lendingPoolTypes.ts',
  'v3-pool-contract/pool.test.ts',
  'v3-wethgateway-contract/index.ts',
  'v3-wethgateway-contract/wethGateway.test.ts',
  'wallet-balance-provider/index.ts',
  'wallet-balance-provider/types/WalletBalanceProviderTypes.ts',
  'wallet-balance-provider/wallet-balance-provider.test.ts',
];

export function assertHelperSourcePolicy(provenance) {
  assert.equal(
    provenance.source.originalTreeSha256,
    helperOriginalTreeSha256,
    'Original source universe changed',
  );
  assert.equal(
    provenance.upstream.sourceArchiveSha256,
    '72ceafae1aafdae11058384da971b3c9cda859250618a0a91ca1cf87c4ee2690',
    'Original source archive identity changed',
  );
  assert.deepEqual(
    provenance.source.vendoredFiles.map(entry => entry.originalPath).sort(),
    requiredHelperOriginals,
    'Retained originals must match the finite reviewed source policy',
  );
  const expected = provenance.source.originalFiles
    .map(entry => entry.path)
    .filter(path => !requiredHelperOriginals.includes(path))
    .sort();
  assert.deepEqual(
    provenance.source.omittedFiles.map(entry => entry.originalPath).sort(),
    expected,
    'Only finite cleanup omissions are allowed',
  );
}
