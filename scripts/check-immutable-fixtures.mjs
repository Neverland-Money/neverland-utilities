import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const recorded = JSON.parse(
  readFileSync(new URL('./fixtures/immutable-sdk-data.json', import.meta.url), 'utf8'),
);

/** Recorded bytes are checked directly; no capture, formatting or expected-value derivation runs. */
export function verifyImmutableFixtures(directory = root, manifest = recorded) {
  assert.equal(manifest.schemaVersion, 1, 'Unsupported immutable fixture manifest');
  assert.ok(manifest.files.length > 0, 'Immutable fixture inventory must not be empty');
  assert.equal(manifest.files.length, manifest.fileCount, 'Incomplete immutable fixture inventory');
  const paths = new Set();
  for (const entry of manifest.files) {
    assert.ok(
      !entry.path.includes('\\') &&
        entry.path.split('/').every(part => part && part !== '.' && part !== '..'),
      `Invalid immutable fixture path: ${entry.path}`,
    );
    assert.ok(!paths.has(entry.path), `Duplicate immutable fixture path: ${entry.path}`);
    paths.add(entry.path);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.ok(entry.authority, `Missing immutable fixture authority: ${entry.path}`);
    const contents = readFileSync(resolve(directory, entry.path));
    const actual = createHash('sha256').update(contents).digest('hex');
    assert.equal(actual, entry.sha256, `Immutable fixture hash mismatch: ${entry.path}`);
    JSON.parse(contents.toString('utf8'));
  }

  return paths.size;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Verified ${verifyImmutableFixtures()} immutable SDK data files.`);
}
