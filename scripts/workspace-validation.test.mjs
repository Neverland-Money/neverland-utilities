import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { ESLint } from 'eslint';
import { getFileInfo } from 'prettier';
import ts from 'typescript';
import { verifyImmutableFixtures } from './check-immutable-fixtures.mjs';

const root = resolve(import.meta.dirname, '..');
const eslint = new ESLint({ cwd: root });

test('workspace lint covers maintained fork sources, tooling and TypeScript consumer templates', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.scripts.lint, 'eslint . --max-warnings=0');
  await Promise.all(
    [
      'packages/math-utils/src/ray.math.ts',
      'packages/contract-helpers/src/pool-contract/pool.ts',
      'packages/address-book/src/index.ts',
      'packages/contract-types/src/abis/abis.test.ts',
      'packages/contract-types/scripts/generate-abis.mjs',
      'scripts/check-packages.mjs',
      'eslint.config.mjs',
      'scripts/fixtures/sdk-node-next-provider.ts',
    ].map(async path => {
      assert.equal(await eslint.isPathIgnored(path), false, path);
    }),
  );

  const config = await eslint.calculateConfigForFile('scripts/fixtures/sdk-node-next-provider.ts');
  assert.equal(config.languageOptions.parser.meta.name, 'typescript-eslint/parser');
  assert.ok(config.languageOptions.parserOptions.project);
});

test('formatting and lint protect generator outputs and immutable complete regression vectors', async () => {
  await Promise.all(
    [
      'packages/contract-types/src/abis/poolAbi.json',
      'packages/contract-types/src/abis/poolAbi.ts',
      'packages/contract-types/src/abis/index.ts',
      'packages/contract-types/src/types.ts',
      ...immutable.files.map(entry => entry.path),
    ].map(async path => {
      assert.equal(await eslint.isPathIgnored(path), true, path);
      const info = await getFileInfo(resolve(root, path), {
        ignorePath: resolve(root, '.prettierignore'),
      });
      assert.equal(info.ignored, true, path);
    }),
  );
});

const immutable = JSON.parse(
  readFileSync(new URL('./fixtures/immutable-sdk-data.json', import.meta.url), 'utf8'),
);
test('immutable fixture gate verifies the complete protected regression vector inventory', () => {
  assert.equal(verifyImmutableFixtures(root), immutable.fileCount);
});
test('immutable fixture gate rejects even whitespace corruption of recorded bytes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'neverland-immutable-fixture-'));
  const entry = immutable.files[0];
  const file = join(directory, entry.path);
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, readFileSync(join(root, entry.path)));
    const manifest = { ...immutable, fileCount: 1, files: [entry] };
    assert.equal(verifyImmutableFixtures(directory, manifest), 1);
    writeFileSync(file, readFileSync(file, 'utf8') + '\n');
    assert.throws(
      () => verifyImmutableFixtures(directory, manifest),
      /Immutable fixture hash mismatch/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('integrator packages keep repository provenance and maintenance data out of published entrypoints', () => {
  for (const name of ['address-book', 'contract-types', 'contract-helpers', 'math-utils']) {
    const manifest = JSON.parse(
      readFileSync(resolve(root, 'packages', name, 'package.json'), 'utf8'),
    );
    for (const path of [...manifest.files, ...Object.keys(manifest.exports ?? {})]) {
      assert.doesNotMatch(
        path,
        /provenance|(?:^|\/)(?:__fixtures__|fixtures|scripts|__tests__)(?:\/|$)/,
        `${name}: maintenance entrypoint ${path}`,
      );
    }
  }
});

test('compiler configurations retain checked JSONC parsing with comments and trailing commas', async () => {
  await Promise.all(
    ['tsconfig.json', 'packages/math-utils/tsconfig.json'].map(path =>
      assert.doesNotReject(() => eslint.calculateConfigForFile(path)),
    ),
  );
  const [result] = await eslint.lintText(
    '{\n  // Compiler configuration supports JSONC.\n  "compilerOptions": { "strict": true, },\n}\n',
    { filePath: 'tsconfig.json' },
  );
  assert.equal(result.fatalErrorCount, 0);
  assert.equal(
    result.messages.some(message => message.fatal),
    false,
  );
});

test('editor discoverable projects own Jest tests while production projects exclude them', () => {
  for (const [name, relative] of [
    ['math-utils', 'bignumber.test.ts'],
    ['contract-helpers', 'commons/base-service.test.ts'],
    ['contract-types', 'abis/abis.test.ts'],
    ['address-book', 'index.test.ts'],
  ]) {
    const file = resolve(root, 'packages', name, 'src', relative);
    const configPath = ts.findConfigFile(dirname(file), ts.sys.fileExists);
    const read = ts.readConfigFile(configPath, ts.sys.readFile);
    assert.equal(read.error, undefined);
    const editor = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(configPath));
    assert.ok(editor.fileNames.includes(file), `${name}: editor project excludes test`);
    assert.ok(editor.options.types.includes('jest'), `${name}: editor lacks Jest declarations`);
    assert.equal(editor.options.noEmit, true, `${name}: editor project must not emit tests`);
    const productionPath = resolve(root, 'packages', name, 'tsconfig.json');
    const productionRead = ts.readConfigFile(productionPath, ts.sys.readFile);
    const production = ts.parseJsonConfigFileContent(
      productionRead.config,
      ts.sys,
      dirname(productionPath),
    );
    assert.equal(
      production.fileNames.includes(file),
      false,
      `${name}: production project includes test`,
    );
    assert.notEqual(production.options.noEmit, true, `${name}: production emission disabled`);
  }
});

test('editor discovers the consumer template project and its build placeholder aliases', () => {
  const file = resolve(root, 'scripts/fixtures/sdk-node-next-provider.ts');
  const configPath = ts.findConfigFile(dirname(file), ts.sys.fileExists);
  assert.equal(configPath, resolve(root, 'scripts/fixtures/tsconfig.json'));
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(read.error, undefined);
  const editor = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(configPath));
  assert.ok(editor.fileNames.includes(file));
  assert.equal(editor.options.noEmit, true);
  const result = ts.resolveModuleName(
    '@neverland-money/contract-helpers/dist/__BUILD__/pool-contract/pool.js',
    file,
    editor.options,
    ts.sys,
  );
  assert.equal(
    result.resolvedModule.resolvedFileName,
    resolve(root, 'packages/contract-helpers/src/pool-contract/pool.ts'),
  );
});

test('typed lint accepts built-in Error objects while rejecting non-error throws', async () => {
  await Promise.all(
    [
      'packages/math-utils/src/bignumber.test.ts',
      'packages/contract-helpers/src/commons/base-service.ts',
    ].map(async filePath => {
      const config = await eslint.calculateConfigForFile(filePath);
      assert.equal(config.rules['@typescript-eslint/only-throw-error'][0], 2);
      const [valid] = await eslint.lintText(
        'export function validThrow(): never { throw new Error("probe"); }\n',
        { filePath },
      );
      assert.equal(valid.fatalErrorCount, 0);
      assert.equal(
        valid.messages.filter(message => message.ruleId === '@typescript-eslint/only-throw-error')
          .length,
        0,
        `${filePath}: built-in Error must remain valid`,
      );
      const [invalid] = await eslint.lintText(
        'export function invalidThrow(): never { throw "probe"; }\n',
        { filePath },
      );
      assert.equal(invalid.fatalErrorCount, 0);
      assert.equal(
        invalid.messages.filter(message => message.ruleId === '@typescript-eslint/only-throw-error')
          .length,
        1,
        `${filePath}: non-error throw must remain rejected`,
      );
    }),
  );
});
