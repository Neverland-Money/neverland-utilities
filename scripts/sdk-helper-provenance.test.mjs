import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertHelperOutputPath } from './sdk-helper-output-policy.mjs';
import { assertHelperSourcePolicy } from './sdk-helper-source-policy.mjs';

const provenance = JSON.parse(
  readFileSync(
    new URL('../packages/contract-helpers/upstream-provenance.json', import.meta.url),
    'utf8',
  ),
);

test('accepts the complete finite retained/omitted original manifest policy', () => {
  assertHelperSourcePolicy(provenance);
});
test('rejects an extra reasoned omission of a retained ERC20 implementation', () => {
  const changed = structuredClone(provenance);
  const index = changed.source.vendoredFiles.findIndex(
    entry => entry.originalPath === 'erc20-contract/index.ts',
  );
  const [removed] = changed.source.vendoredFiles.splice(index, 1);
  changed.source.omittedFiles.push({
    originalPath: removed.originalPath,
    reason: 'Arbitrary deletion with a reason is still forbidden',
  });
  assert.throws(() => assertHelperSourcePolicy(changed), /finite reviewed source policy/);
});
test('rejects source archive identity drift even if mappings are unchanged', () => {
  const changed = structuredClone(provenance);
  changed.upstream.sourceArchiveSha256 = '0'.repeat(64);
  assert.throws(() => assertHelperSourcePolicy(changed), /archive identity/);
});

test('permits only canonical native incentive output filenames', () => {
  for (const build of ['cjs', 'esm'])
    for (const name of ['index', 'types'])
      for (const extension of ['js', 'js.map', 'd.ts', 'd.ts.map'])
        assertHelperOutputPath(
          `dist/${build}/ui-incentive-data-provider-contract/${name}.${extension}`,
        );
});

test('retains removed helper family rejection around the native incentive exception', () => {
  for (const family of [
    'aave-v3',
    'typechain',
    'umbrella',
    'paraswap',
    'governance',
    'staking',
    'faucet',
    'migration',
    'synthetix',
    'rollups',
    'permissions-manager',
    'cl-feed-registry',
    'token-wrapper',
    'ui-incentive-data-provider',
    'v3-ui-incentive-data-provider-contract',
  ])
    assert.throws(() => assertHelperOutputPath(`dist/cjs/${family}/index.js`), /Removed helper/);
  for (const path of [
    'dist/cjs/ui-incentive-data-provider-contract/typechain/index.js',
    'dist/esm/ui-incentive-data-provider-contract/legacy.js',
    'dist/cjs/ui-incentive-data-provider-contract/index.test.js',
    'dist/cjs/ui-incentive-data-provider-contract/index.js.bak',
    'dist/cjs/aave-v3/ui-incentive-data-provider-contract/index.js',
    'dist/cjs/legacy-ui-incentive-data-provider-contract/index.js',
  ])
    assert.throws(() => assertHelperOutputPath(path), /Removed helper/);
});
