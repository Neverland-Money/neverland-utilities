import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
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
