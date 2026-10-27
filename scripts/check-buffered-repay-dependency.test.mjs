import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkBufferedRepayDependency as verify } from './check-buffered-repay-dependency.mjs';

const mathSource = fileURLToPath(new URL('../packages/math-utils', import.meta.url));
const sourceRequire = createRequire(
  new URL('../packages/math-utils/package.json', import.meta.url),
);
function fixture(context, mutate) {
  const directory = mkdtempSync(join(tmpdir(), 'neverland-buffer-dependency-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const helper = join(directory, 'node_modules/@neverland-money/contract-helpers');
  const rootMath = join(directory, 'node_modules/@neverland-money/math-utils');
  const localMath = join(helper, 'node_modules/@neverland-money/math-utils');
  for (const destination of [rootMath, localMath]) {
    cpSync(mathSource, destination, {
      recursive: true,
      filter: path => !path.split('/').includes('node_modules'),
    });
  }

  writeFileSync(join(directory, 'package.json'), '{"private":true}');
  writeFileSync(
    join(helper, 'package.json'),
    JSON.stringify({
      name: '@neverland-money/contract-helpers',
      version: '2.1.0',
      main: 'index.js',
      dependencies: { '@neverland-money/math-utils': '1.0.0' },
    }),
  );
  writeFileSync(
    join(helper, 'index.js'),
    "module.exports = { calculateBufferedRepayAmount: require('@neverland-money/math-utils').calculateBufferedRepayAmount };\n",
  );
  for (const dependency of ['bignumber.js', 'tslib']) {
    symlinkSync(
      dirname(sourceRequire.resolve(dependency)),
      join(directory, 'node_modules', dependency),
      'dir',
    );
  }

  mutate?.({ helper, rootMath, localMath });
  const consumerRequire = createRequire(join(directory, 'package.json'));
  const helperRequire = createRequire(join(helper, 'package.json'));
  return {
    consumerRequire,
    helperRequire,
    helpers: consumerRequire('@neverland-money/contract-helpers'),
    expectedVersion: '1.0.0',
  };
}

test('accepts separate identical math instances and checks helper-local re-export identity', context => {
  const params = fixture(context);
  assert.notEqual(
    params.consumerRequire('@neverland-money/math-utils').calculateBufferedRepayAmount,
    params.helperRequire('@neverland-money/math-utils').calculateBufferedRepayAmount,
  );
  verify(params);
});

test('rejects a helper wrapper instead of the helper-local function re-export', context => {
  const params = fixture(context, ({ helper }) => {
    writeFileSync(
      join(helper, 'index.js'),
      "module.exports = { calculateBufferedRepayAmount: (...args) => require('@neverland-money/math-utils').calculateBufferedRepayAmount(...args) };\n",
    );
  });
  assert.throws(() => verify(params), /helper-local re-export/);
});

for (const target of ['rootMath', 'localMath']) {
  test(`rejects the wrong ${target} version`, context => {
    const params = fixture(context, locations => {
      const path = join(locations[target], 'package.json');
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      manifest.version = '1.0.1';
      writeFileSync(path, JSON.stringify(manifest));
    });
    assert.throws(() => verify(params), /math version/);
  });
}

test('rejects a nonexact helper math dependency', context => {
  const params = fixture(context, ({ helper }) => {
    const path = join(helper, 'package.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    manifest.dependencies['@neverland-money/math-utils'] = '^1.0.0';
    writeFileSync(path, JSON.stringify(manifest));
  });
  assert.throws(() => verify(params), /exact math dependency/);
});

test('rejects different content even when the repayment output is unchanged', context => {
  const params = fixture(context, ({ localMath }) => {
    const path = join(localMath, 'dist/cjs/repay.js');
    writeFileSync(path, readFileSync(path, 'utf8') + '\n// Different package content.\n');
  });
  assert.throws(() => verify(params), /math package content/);
});

test('rejects identically wrong output in both same-version content-matching copies', context => {
  const params = fixture(context, ({ rootMath, localMath }) => {
    for (const location of [rootMath, localMath]) {
      const path = join(location, 'dist/cjs/repay.js');
      writeFileSync(
        path,
        readFileSync(path, 'utf8') + "\nexports.calculateBufferedRepayAmount = () => '2';\n",
      );
    }
  });
  assert.throws(() => verify(params), /buffer output/);
});
