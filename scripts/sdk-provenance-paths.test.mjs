import assert from 'node:assert/strict';
import test from 'node:test';
import { vendoredPathMap } from './sdk-provenance-paths.mjs';

const fixture = () => ({
  source: {
    vendoredDirectory: 'src/vendor',
    originalFiles: [{ path: 'Original.ts' }, { path: 'Other.ts' }],
    vendoredFiles: [
      { originalPath: 'Original.ts', vendoredPath: 'original.ts' },
      { originalPath: 'Other.ts', vendoredPath: 'other.ts' },
    ],
  },
  addedSupportFiles: [{ path: 'support.ts' }],
});
test('maps immutable originals and permits legacy identity manifests', () => {
  assert.deepEqual(
    [...vendoredPathMap(fixture())],
    [
      ['Original.ts', 'original.ts'],
      ['Other.ts', 'other.ts'],
    ],
  );
  const legacy = fixture();
  delete legacy.source.vendoredFiles;
  assert.equal(vendoredPathMap(legacy).get('Original.ts'), 'Original.ts');
});
for (const [name, mutate] of [
  ['missing original mapping', value => value.source.vendoredFiles.pop()],
  [
    'duplicate original mapping',
    value => {
      value.source.vendoredFiles[1].originalPath = 'Original.ts';
    },
  ],
  [
    'unknown original mapping',
    value => {
      value.source.vendoredFiles[1].originalPath = 'Unknown.ts';
    },
  ],
  [
    'case-insensitive collision',
    value => {
      value.source.vendoredFiles[1].vendoredPath = 'ORIGINAL.ts';
    },
  ],
  [
    'support collision',
    value => {
      value.addedSupportFiles[0].path = 'ORIGINAL.ts';
    },
  ],
  ...['../outside.ts', '/outside.ts', 'a/../../outside.ts', 'a\\outside.ts', 'C:/outside.ts'].map(
    path => [
      `escaping target ${path}`,
      value => {
        value.source.vendoredFiles[0].vendoredPath = path;
      },
    ],
  ),
]) {
  test(`rejects ${name}`, () => {
    const value = fixture();
    mutate(value);
    assert.throws(() => vendoredPathMap(value));
  });
}

test('accounts for an explicitly reasoned omission without changing originals', () => {
  const value = fixture();
  value.source.vendoredFiles.pop();
  value.source.omittedFiles = [{ originalPath: 'Other.ts', reason: 'Obsolete upstream V2 pool.' }];
  assert.deepEqual([...vendoredPathMap(value)], [['Original.ts', 'original.ts']]);
});
for (const [name, omissions] of [
  ['unknown omission', [{ originalPath: 'Missing.ts', reason: 'Removed' }]],
  ['unreasoned omission', [{ originalPath: 'Other.ts', reason: '  ' }]],
  [
    'duplicate omission',
    [
      { originalPath: 'Other.ts', reason: 'Removed' },
      { originalPath: 'Other.ts', reason: 'Removed twice' },
    ],
  ],
  ['mapped and omitted original', [{ originalPath: 'Original.ts', reason: 'Removed' }]],
]) {
  test(`rejects ${name}`, () => {
    const value = fixture();
    value.source.vendoredFiles.pop();
    value.source.omittedFiles = omissions;
    assert.throws(() => vendoredPathMap(value));
  });
}
