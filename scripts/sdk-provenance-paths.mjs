import assert from 'node:assert/strict';

export function assertRelativeSourcePath(value) {
  assert.equal(typeof value, 'string', 'Source path must be a string');
  assert.match(value, /^[^\\:]+$/, 'Source path must use relative POSIX segments');
  assert.ok(
    value.split('/').every(segment => segment && segment !== '.' && segment !== '..'),
    `Source path must be relative and contained: ${value}`,
  );
  return value;
}

/** Original archive names remain immutable; only this explicit mapping selects owned paths. */
export function vendoredPathMap(provenance) {
  assertRelativeSourcePath(provenance.source.vendoredDirectory);
  const originals = provenance.source.originalFiles.map(entry =>
    assertRelativeSourcePath(entry.path),
  );
  assert.equal(new Set(originals).size, originals.length, 'Duplicate original source path');
  const entries =
    provenance.source.vendoredFiles ??
    originals.map(path => ({
      originalPath: path,
      vendoredPath: path,
    }));
  const omitted = new Set();
  for (const { originalPath, reason } of provenance.source.omittedFiles ?? []) {
    assert.ok(originals.includes(originalPath), `Unknown omitted original: ${originalPath}`);
    assert.ok(!omitted.has(originalPath), `Duplicate omitted original: ${originalPath}`);
    assert.equal(typeof reason, 'string', 'Omission must have a reason');
    assert.ok(reason.trim().length > 0, `Unreasoned omitted original: ${originalPath}`);
    omitted.add(originalPath);
  }

  assert.equal(
    entries.length + omitted.size,
    originals.length,
    'Mapping/omission must cover every original',
  );
  const mapping = new Map();
  const targets = new Set();
  for (const { originalPath, vendoredPath } of entries) {
    assert.ok(originals.includes(originalPath), `Unknown original source: ${originalPath}`);
    assert.ok(!omitted.has(originalPath), `Original both mapped and omitted: ${originalPath}`);
    assert.ok(!mapping.has(originalPath), `Duplicate original mapping: ${originalPath}`);
    assertRelativeSourcePath(vendoredPath);
    assert.ok(!targets.has(vendoredPath.toLowerCase()), `Colliding vendored path: ${vendoredPath}`);
    mapping.set(originalPath, vendoredPath);
    targets.add(vendoredPath.toLowerCase());
  }

  for (const { path } of provenance.addedSupportFiles ?? []) {
    assertRelativeSourcePath(path);
    assert.ok(!targets.has(path.toLowerCase()), `Colliding support path: ${path}`);
    targets.add(path.toLowerCase());
  }

  return mapping;
}
