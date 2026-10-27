import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertHelperSourcePolicy } from './sdk-helper-source-policy.mjs';
import { vendoredPathMap } from './sdk-provenance-paths.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = value => createHash('sha256').update(value).digest('hex');
for (const name of ['math-utils', 'contract-helpers']) {
  const directory = join(root, 'packages', name);
  const provenance = JSON.parse(readFileSync(join(directory, 'upstream-provenance.json'), 'utf8'));
  const original = provenance.source.originalFiles;
  const paths = vendoredPathMap(provenance);
  const transformed = new Map(provenance.transformedFiles.map(entry => [entry.path, entry]));
  assert.equal(
    transformed.size,
    provenance.transformedFiles.length,
    `${name}: duplicate transformed source`,
  );
  for (const path of transformed.keys())
    assert.ok(paths.has(path), `${name}: unknown transformed original`);
  const originalDigest = hash(original.map(entry => `${entry.sha256}  ${entry.path}`).join('\n'));
  assert.equal(
    originalDigest,
    provenance.source.originalTreeSha256,
    `${name}: original manifest digest`,
  );
  if (name === 'contract-helpers') {
    assertHelperSourcePolicy(provenance);
  }

  for (const entry of original) {
    if (!paths.has(entry.path)) continue;
    const expected = transformed.get(entry.path);
    if (expected) assert.equal(expected.originalSha256, entry.sha256);
    const source = readFileSync(
      join(directory, provenance.source.vendoredDirectory, paths.get(entry.path)),
    );
    assert.equal(
      hash(source),
      expected?.vendoredSha256 ?? entry.sha256,
      `${name}: undocumented change to ${entry.path}`,
    );
  }

  for (const entry of provenance.addedSupportFiles ?? []) {
    assert.equal(
      hash(readFileSync(join(directory, provenance.source.vendoredDirectory, entry.path))),
      entry.sha256,
      `${name}: undocumented support file change ${entry.path}`,
    );
  }

  assert.equal(provenance.upstream.commit, '37dd3bab41c0bc4765b0254151cf6ed1d20b546f');
  assert.ok(readFileSync(join(directory, 'LICENSE'), 'utf8').includes('Copyright (c) 2021 Aave'));
  console.log(
    `${name}: verified ${paths.size} retained originals, ${(provenance.source.omittedFiles ?? []).length} explicit omissions, ${original.length} immutable manifest entries and ${transformed.size} transformed files.`,
  );
}
