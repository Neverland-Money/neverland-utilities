import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = mkdtempSync(join(tmpdir(), 'neverland-package-check-'));
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const run = (command, args, cwd = scratch) => {
  try {
    return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    process.stderr.write(error.stdout ?? '');
    process.stderr.write(error.stderr ?? '');
    throw error;
  }
};
const catalog = readJson(join(root, 'packages/contract-types/abi-provenance.json'));
const names = [...catalog.abis.map(entry => entry.export), ...Object.keys(catalog.aliases)];

try {
  const dependencies = {};
  for (const name of ['address-book', 'contract-types', 'contract-helpers']) {
    const directory = join(root, 'packages', name);
    const manifest = readJson(join(directory, 'package.json'));
    const [packed] = JSON.parse(
      run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', scratch], directory),
    );
    const files = new Set(packed.files.map(file => file.path));
    for (const entry of ['main', 'module', 'types']) {
      assert.ok(files.has(manifest[entry]), `${name}: missing ${entry} entrypoint`);
    }
    for (const file of files) {
      assert.ok(!file.startsWith('src/') && !file.includes('.test.'), `${name}: shipped ${file}`);
      if (!file.startsWith('dist/')) continue;
      const match = /^dist\/(cjs|esm)\/(.+)\.(js(?:\.map)?|d\.ts(?:\.map)?|json)$/.exec(file);
      assert.ok(match, `${name}: unexpected build output ${file}`);
      const source = `${match[2]}.${match[3] === 'json' ? 'json' : 'ts'}`;
      assert.ok(existsSync(join(directory, 'src', source)), `${name}: stale output ${file}`);
    }
    if (name === 'contract-types') {
      for (const build of ['cjs', 'esm']) {
        const jsonFiles = [...files].filter(
          file => file.startsWith(`dist/${build}/abis/`) && file.endsWith('.json'),
        );
        assert.equal(jsonFiles.length, catalog.abis.length, 'Unexpected ABI JSON count');
        for (const entry of catalog.abis) {
          for (const extension of ['json', 'js', 'd.ts']) {
            assert.ok(files.has(`dist/${build}/abis/${entry.export}.${extension}`));
          }
        }
      }
      assert.ok(files.has('abi-provenance.json'));
    }
    dependencies[manifest.name] = `file:${join(scratch, packed.filename)}`;
  }
  const rootManifest = readJson(join(root, 'package.json'));
  writeFileSync(
    join(scratch, 'package.json'),
    JSON.stringify({
      name: 'neverland-package-consumer',
      version: '1.0.0',
      private: true,
      dependencies,
      devDependencies: {
        typescript: rootManifest.devDependencies.typescript,
        '@types/node': rootManifest.devDependencies['@types/node'],
      },
    }),
  );
  // Nested installation catches declarations that accidentally rely on hoisted transitive dependencies.
  run('npm', [
    'install',
    '--install-strategy=nested',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ]);
  const require = createRequire(join(scratch, 'package.json'));
  const abis = require('@neverland-money/contract-types');
  assert.deepEqual(Object.keys(abis).sort(), names.toSorted());
  for (const entry of catalog.abis) {
    assert.deepEqual(
      abis[entry.export],
      readJson(join(root, 'packages/contract-types/src/abis', `${entry.export}.json`)),
    );
  }
  for (const [alias, target] of Object.entries(catalog.aliases))
    assert.equal(abis[alias], abis[target]);
  const typesRequire = createRequire(
    require.resolve('@neverland-money/contract-types/package.json'),
  );
  const { encodeFunctionData, decodeFunctionData } = typesRequire('viem');
  const address = '0x1111111111111111111111111111111111111111';
  const data = encodeFunctionData({
    abi: abis.poolAbi,
    functionName: 'supply',
    args: [address, 1n, address, 0],
  });
  assert.equal(
    data,
    '0x617ba037' +
      address.slice(2).padStart(64, '0') +
      '1'.padStart(64, '0') +
      address.slice(2).padStart(64, '0') +
      '0'.repeat(64),
  );
  assert.deepEqual(decodeFunctionData({ abi: abis.poolAbi, data }).args, [address, 1n, address, 0]);
  assert.equal(require('@neverland-money/address-book').NeverlandMonadMainnet.CHAIN_ID, 143);
  assert.equal(typeof require('@neverland-money/contract-helpers').DustLockHelper, 'function');
  writeFileSync(
    join(scratch, 'imports.mjs'),
    `
import { poolAbi } from '@neverland-money/contract-types';
import { DustLockHelper } from '@neverland-money/contract-helpers';
import { NeverlandMonadMainnet } from '@neverland-money/address-book';
if (!poolAbi.length || typeof DustLockHelper !== 'function' || NeverlandMonadMainnet.CHAIN_ID !== 143) throw new Error('Invalid public ESM imports');
`,
  );
  run(process.execPath, ['imports.mjs']);
  writeFileSync(
    join(scratch, 'consumer.ts'),
    `
import { ${names.join(', ')} } from '@neverland-money/contract-types';
import type { ${catalog.abis.map(entry => entry.typeName).join(', ')}, ContractFunctionName, ContractFunctionReturnType } from '@neverland-money/contract-types';
import { DustLockHelper, ClaimRewardsHelper, NeverlandUiService } from '@neverland-money/contract-helpers';
import { NeverlandMonadMainnet } from '@neverland-money/address-book';
${catalog.abis.map(entry => `const ${entry.export}Value: ${entry.typeName} = ${entry.export}; void ${entry.export}Value;`).join('\n')}
const chain: 143 = NeverlandMonadMainnet.CHAIN_ID; void chain;
declare const context: ConstructorParameters<typeof DustLockHelper>[0];
new DustLockHelper(context).getCreateLockTxData({ amount: '1', lockDuration: 604800 });
void ClaimRewardsHelper; void NeverlandUiService;
// @ts-expect-error Unknown function names must fail.
const invalidName: ContractFunctionName<PoolAbi> = 'missingFunction'; void invalidName;
declare const reserve: ContractFunctionReturnType<PoolAbi, 'view', 'getReserveData'>;
const configuration: bigint = reserve.configuration.data; void configuration;
// @ts-expect-error Reserve indices are bigint.
const invalidIndex: number = reserve.liquidityIndex; void invalidIndex;
`,
  );
  const compiler = require.resolve('typescript/bin/tsc');
  for (const [module, moduleResolution] of [
    ['CommonJS', 'Node'],
    ['ESNext', 'Bundler'],
    ['NodeNext', 'NodeNext'],
  ]) {
    writeFileSync(
      join(scratch, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module,
          moduleResolution,
          strict: true,
          skipLibCheck: false,
          noEmit: true,
          resolveJsonModule: true,
          esModuleInterop: true,
        },
        files: ['consumer.ts'],
      }),
    );
    run(process.execPath, [compiler, '-p', 'tsconfig.json']);
  }
  console.log(
    `Validated three npm tarballs, ${catalog.abis.length} ABI families, ${Object.keys(catalog.aliases).length} aliases, CJS/ESM imports, Pool calldata, and strict declarations in three resolution modes.`,
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
