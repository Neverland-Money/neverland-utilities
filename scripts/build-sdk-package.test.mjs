import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { SourceMap } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildSdkPackage } from './build-sdk-package.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'sdk-module-build-'));
  const directory = join(root, 'packages', 'fixture');
  mkdirSync(join(directory, 'src', 'nested'), { recursive: true });
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: 'fixture' }));
  writeFileSync(
    join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        moduleResolution: 'Bundler',
        target: 'ES2022',
        rootDir: 'src',
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        resolveJsonModule: true,
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
        types: [],
      },
      include: ['src/**/*.ts'],
    }),
  );
  writeFileSync(
    join(directory, 'src', 'index.ts'),
    [
      "export { answer } from './nested';",
      "export type Value = import('./nested').Value;",
      "import data from './data.json';",
      'export { data };',
      "export async function load() { return import('./nested'); }",
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(directory, 'src', 'nested', 'index.ts'),
    'export const answer = 42; export type Value = number;\n',
  );
  writeFileSync(join(directory, 'src', 'data.json'), '{"value":7}\n');
  return { root, directory };
}

test('emits executable CJS/ESM graphs, import types, JSON attributes and deterministic compiler maps', () => {
  const { root, directory } = fixture();
  try {
    const source = readFileSync(join(directory, 'src/index.ts'), 'utf8');
    buildSdkPackage('fixture', root);
    const esm = readFileSync(join(directory, 'dist/esm/index.js'), 'utf8');
    const declaration = readFileSync(join(directory, 'dist/esm/index.d.ts'), 'utf8');
    assert.match(esm, /from "\.\/nested\/index\.js"/);
    assert.match(esm, /import\("\.\/nested\/index\.js"\)/);
    assert.match(esm, /with \{ type: "json" \}/);
    assert.match(declaration, /import\("\.\/nested\/index\.js"\)/);
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "const x = await import('./dist/esm/index.js'); if (x.answer !== 42 || x.data.value !== 7 || (await x.load()).answer !== 42) throw Error('ESM');",
      ],
      { cwd: directory },
    );
    execFileSync(
      process.execPath,
      [
        '-e',
        "const x = require('./dist/cjs/index.js'); if (x.answer !== 42 || x.data.value !== 7) throw Error('CJS');",
      ],
      { cwd: directory },
    );
    for (const extension of ['js', 'd.ts']) {
      const emitted = readFileSync(join(directory, `dist/esm/index.${extension}`), 'utf8');
      const lines = emitted.split('\n');
      const line = lines.findIndex(value => value.includes('function load'));
      const column = lines[line].indexOf('load');
      const map = new SourceMap(
        JSON.parse(readFileSync(join(directory, `dist/esm/index.${extension}.map`), 'utf8')),
      );
      const location = map.findEntry(line, column);
      assert.equal(location.originalLine, 4);
      assert.ok(location.originalSource.endsWith('/src/index.ts'));
    }

    const before = Object.fromEntries(
      readdirSync(join(directory, 'dist'), { recursive: true, withFileTypes: true })
        .filter(e => e.isFile())
        .map(e => {
          const file = join(e.parentPath, e.name);
          return [file, readFileSync(file, 'utf8')];
        }),
    );
    buildSdkPackage('fixture', root);
    for (const [file, bytes] of Object.entries(before))
      assert.equal(readFileSync(file, 'utf8'), bytes);
    assert.equal(readFileSync(join(directory, 'src/index.ts'), 'utf8'), source);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects an unresolved source edge before emitting a package graph', () => {
  const { root, directory } = fixture();
  try {
    writeFileSync(join(directory, 'src/index.ts'), "export * from './missing';\n");
    assert.throws(() => buildSdkPackage('fixture', root), /Cannot find module/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
