import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

function packageContents(directory, prefix = '') {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (entry.name === 'node_modules') continue;
    const relative = prefix + entry.name;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...packageContents(path, relative + '/'));
    else files.push([relative, createHash('sha256').update(readFileSync(path)).digest('hex')]);
  }

  return files;
}

// npm's nested strategy can install identical versions at different paths.
// Identity is local to the helper's resolver; version/content/behavior cross copies.
export function checkBufferedRepayDependency({
  consumerRequire,
  helperRequire,
  helpers,
  expectedVersion,
}) {
  const name = '@neverland-money/math-utils';
  const math = consumerRequire(name);
  const helperMath = helperRequire(name);
  assert.equal(
    helpers.calculateBufferedRepayAmount,
    helperMath.calculateBufferedRepayAmount,
    'Incorrect helper-local re-export',
  );
  assert.equal(
    consumerRequire(`${name}/package.json`).version,
    expectedVersion,
    'Incorrect root math version',
  );
  assert.equal(
    helperRequire(`${name}/package.json`).version,
    expectedVersion,
    'Incorrect helper-local math version',
  );
  assert.equal(
    consumerRequire('@neverland-money/contract-helpers/package.json').dependencies[name],
    expectedVersion,
    'Helpers must declare the exact math dependency',
  );
  assert.deepEqual(
    packageContents(dirname(consumerRequire.resolve(`${name}/package.json`))),
    packageContents(dirname(helperRequire.resolve(`${name}/package.json`))),
    'Root/helper-local math package content differs',
  );
  for (const [debtRaw, variableBorrowRateRay, windowSeconds, expected] of [
    ['0', '0', 600, '1'],
    ['1000000', '50000000000000000000000000', 600, '1000002'],
    ['1000000000000000000', '50000000000000000000000000', 600, '1000000951294211240'],
    ['1000000000000000000000000', '50000000000000000000000000', 600, '1000000951294211238855626'],
    ['1000000000000000000', '0', 600, '1000000000000000001'],
    ['1000000000000000000', '50000000000000000000000000', 0, '1000000000000000001'],
  ]) {
    const params = { debtRaw, variableBorrowRateRay, windowSeconds };
    assert.equal(
      math.calculateBufferedRepayAmount(params),
      expected,
      'Incorrect root math buffer output',
    );
    assert.equal(
      helperMath.calculateBufferedRepayAmount(params),
      expected,
      'Incorrect helper-local math buffer output',
    );
  }
}
