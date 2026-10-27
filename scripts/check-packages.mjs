import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkBufferedRepayDependency } from './check-buffered-repay-dependency.mjs';
import { vendoredPathMap } from './sdk-provenance-paths.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceParent = process.env.NEVERLAND_PACKAGE_CHECK_DIR;
if (evidenceParent) mkdirSync(resolve(evidenceParent), { recursive: true });
const scratch = mkdtempSync(
  join(evidenceParent ? resolve(evidenceParent) : tmpdir(), 'neverland-package-check-'),
);
const artifactRecords = [];
console.log(`Package consumer evidence: ${scratch}`);
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
/** Exact or caret (^) range check for the shipped dependency requirements. */
const satisfiesRange = (version, range) => {
  const parse = value => value.split('.').map(Number);
  const [major, minor, patch] = parse(version);
  const caret = range.startsWith('^');
  const [rangeMajor, rangeMinor, rangePatch] = parse(caret ? range.slice(1) : range);
  if (!caret) return major === rangeMajor && minor === rangeMinor && patch === rangePatch;
  if (major !== rangeMajor) return false;
  if (rangeMajor === 0) return minor === rangeMinor && patch >= rangePatch;
  return minor > rangeMinor || (minor === rangeMinor && patch >= rangePatch);
};

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
  assert.deepEqual(
    readdirSync(join(root, 'packages'), { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort(),
    ['address-book', 'contract-helpers', 'contract-types', 'math-utils'],
  );
  run(process.execPath, ['scripts/check-sdk-provenance.mjs'], root);
  run(process.execPath, ['scripts/check-immutable-fixtures.mjs'], root);
  run(process.execPath, ['packages/contract-types/scripts/generate-abis.mjs', '--check'], root);
  const dependencies = {};
  for (const name of ['address-book', 'contract-types', 'contract-helpers', 'math-utils']) {
    const directory = join(root, 'packages', name);
    const manifest = readJson(join(directory, 'package.json'));
    assert.equal(manifest.name, `@neverland-money/${name}`);
    assert.equal(manifest.license, 'MIT');
    if (['contract-helpers', 'math-utils'].includes(name)) {
      assert.equal(manifest.types, 'dist/cjs/index.d.ts');
      for (const [condition, build] of [
        ['import', 'esm'],
        ['require', 'cjs'],
      ]) {
        assert.deepEqual(manifest.exports['.'][condition], {
          types: `./dist/${build}/index.d.ts`,
          default: `./dist/${build}/index.js`,
        });
      }
    }

    assert.ok(
      !manifest.overrides && !manifest.resolutions,
      `${name}: shipped dependency overrides`,
    );
    if (name === 'contract-helpers') {
      for (const dependency of ['math-utils', 'contract-types'])
        assert.equal(
          manifest.dependencies[`@neverland-money/${dependency}`],
          readJson(join(root, 'packages', dependency, 'package.json')).version,
          `${name}: ${dependency} must be pinned to the exact workspace version`,
        );
    }

    assert.ok(
      readFileSync(join(directory, 'README.md'), 'utf8').includes(`v${manifest.version}`),
      `${name}: README version differs`,
    );
    const changelogVersion = readFileSync(join(directory, 'CHANGELOG.md'), 'utf8').match(
      /^## \[([^\]]+)\]/m,
    )?.[1];
    assert.equal(changelogVersion, manifest.version, `${name}: latest changelog version differs`);
    const [packed] = JSON.parse(
      run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', scratch], directory),
    );
    const files = new Set(packed.files.map(file => file.path));
    assert.ok(files.has('LICENSE'), `${name}: missing license`);
    if (name === 'address-book' || name === 'contract-types') {
      assert.deepEqual(
        readFileSync(join(directory, 'LICENSE')),
        readFileSync(join(root, 'LICENSE')),
        `${name}: license differs from root license`,
      );
    }

    for (const file of files) {
      assert.ok(
        file.startsWith('dist/') ||
          ['package.json', 'README.md', 'CHANGELOG.md', 'LICENSE'].includes(file),
        `${name}: unexpected non-runtime package file: ${file}`,
      );
      assert.doesNotMatch(
        file,
        /(?:^|\/)(?:upstream-provenance\.json|abi-provenance\.json|tsconfig(?:\.[^/]+)?\.json|__fixtures__|fixtures|__tests__|scripts|(?:capture|replay|rehearse)-[^/]+)(?:\/|$)|\.test\./,
        `${name}: repository maintenance artifact shipped: ${file}`,
      );
    }

    assert.ok(
      !manifest.exports?.['./upstream-provenance.json'],
      `${name}: provenance export shipped`,
    );
    if (name === 'contract-helpers') {
      const paths = [...files].filter(file => file.startsWith('dist/'));
      assert.equal(
        new Set(paths.map(file => file.toLowerCase())).size,
        paths.length,
        'Case-insensitive output collision',
      );
      for (const file of paths)
        assert.match(file, /^[a-z0-9./-]+$/, `Non-kebab helper output: ${file}`);
      const provenance = readJson(join(directory, 'upstream-provenance.json'));
      for (const [original, vendored] of vendoredPathMap(provenance)) {
        // eslint-disable-next-line max-depth -- Keep the complete nested package/build/source isolation checks together without changing validation or failure order.
        if (`aave-v3/${original}` === vendored) continue;
        // eslint-disable-next-line max-depth -- Keep the complete nested package/build/source isolation checks together without changing validation or failure order.
        for (const build of ['cjs', 'esm']) {
          const oldBase = `dist/${build}/aave-v3/${original.replace(/\.(?:d\.)?ts$/, '')}`;
          assert.ok(
            ![...files].some(file => file === oldBase + '.js' || file === oldBase + '.d.ts'),
            `Old upstream path shipped: ${original}`,
          );
        }
      }

      for (const file of paths) {
        assert.doesNotMatch(
          file,
          /(?:aave-v3|typechain|umbrella|paraswap|governance|staking|faucet|migration|synthetix|rollups|permissions-manager|cl-feed-registry|token-wrapper|ui-incentive-data-provider)/,
          'Removed helper output shipped',
        );
        assert.doesNotMatch(
          readFileSync(join(directory, file), 'utf8'),
          /ethers-v5|@ethersproject\//,
          'Legacy ethers dependency shipped in helper output',
        );
      }

      for (const file of paths)
        assert.doesNotMatch(
          file,
          /\/(?:lending-pool-contract(?:-bundle)?|v3-pool-contract(?:-bundle)?|neverland-pool)\//,
          `Obsolete pool directory shipped: ${file}`,
        );
      for (const build of ['cjs', 'esm'])
        // eslint-disable-next-line max-depth -- Keep the complete nested package/build/source isolation checks together without changing validation or failure order.
        for (const old of [
          'lendingPool-contract/lendingPoolTypes',
          'v3-pool-contract/lendingPoolTypes',
        ])
          // eslint-disable-next-line max-depth -- Keep the complete nested package/build/source isolation checks together without changing validation or failure order.
          for (const extension of ['js', 'd.ts'])
            assert.ok(
              !files.has(`dist/${build}/${old}.${extension}`),
              `Old app path shipped: ${old}`,
            );
    }

    assert.equal(packed.version, manifest.version, `${name}: packed version differs`);
    for (const entry of ['main', 'module', 'types']) {
      assert.ok(files.has(manifest[entry]), `${name}: missing ${entry} entrypoint`);
    }

    for (const file of files) {
      assert.ok(!file.startsWith('src/') && !file.includes('.test.'), `${name}: shipped ${file}`);
      if (!file.startsWith('dist/')) continue;
      if (/^dist\/(?:cjs|esm)\/package\.json$/.test(file)) {
        assert.ok(['contract-helpers', 'math-utils'].includes(name));
        assert.deepEqual(readJson(join(directory, file)), {
          type: file.startsWith('dist/esm/') ? 'module' : 'commonjs',
        });
        continue;
      }

      const match = /^dist\/(cjs|esm)\/(.+)\.(js(?:\.map)?|d\.ts(?:\.map)?|json)$/.exec(file);
      assert.ok(match, `${name}: unexpected build output ${file}`);
      const source = `${match[2]}.${match[3] === 'json' ? 'json' : 'ts'}`;
      assert.ok(
        existsSync(join(directory, 'src', source)) ||
          (match[3].startsWith('d.ts') && existsSync(join(directory, 'src', `${match[2]}.d.ts`))),
        `${name}: stale output ${file}`,
      );
    }

    if (name === 'math-utils' || name === 'contract-helpers') {
      assert.ok(!files.has('upstream-provenance.json'), `${name}: source provenance shipped`);
      assert.ok(
        readFileSync(join(directory, 'LICENSE'), 'utf8').includes('Copyright (c) 2021 Aave'),
      );
      assert.ok(
        !Object.keys(manifest.dependencies).some(dependency => dependency.startsWith('@aave/')),
      );
      if (name === 'contract-helpers') {
        // eslint-disable-next-line max-depth -- Keep the complete nested package/build/source isolation checks together without changing validation or failure order.
        for (const build of ['cjs', 'esm']) {
          const sourceFiles = readdirSync(join(directory, 'src'), { recursive: true }).filter(
            file =>
              file.endsWith('.ts') &&
              !file.endsWith('.test.ts') &&
              !file.endsWith('/mocks.ts') &&
              !file.split(/[/\\]/).includes('__tests__'),
          );
          // eslint-disable-next-line max-depth -- Keep the complete nested package/build/source isolation checks together without changing validation or failure order.
          for (const source of sourceFiles) {
            const declaration = source.endsWith('.d.ts')
              ? source
              : source.replace(/\.ts$/, '.d.ts');
            assert.ok(
              files.has(`dist/${build}/${declaration}`),
              `${name}: missing declaration ${declaration}`,
            );
          }

          assert.ok(
            files.has(`dist/${build}/pool-contract/pool-types.d.ts`),
            `${name}: missing canonical pool types`,
          );
        }
      }
    }

    if (name === 'contract-types') {
      for (const build of ['cjs', 'esm']) {
        const jsonFiles = [...files].filter(
          file => file.startsWith(`dist/${build}/abis/`) && file.endsWith('.json'),
        );
        assert.equal(jsonFiles.length, catalog.abis.length, 'Unexpected ABI JSON count');
        // eslint-disable-next-line max-depth -- Keep the complete nested package/build/source isolation checks together without changing validation or failure order.
        for (const entry of catalog.abis) {
          // eslint-disable-next-line max-depth -- Keep the complete nested package/build/source isolation checks together without changing validation or failure order.
          for (const extension of ['json', 'js', 'd.ts']) {
            assert.ok(files.has(`dist/${build}/abis/${entry.export}.${extension}`));
          }
        }
      }

      assert.ok(!files.has('abi-provenance.json'), 'Source ABI provenance shipped');
    }

    const tarball = join(scratch, packed.filename);
    const bytes = readFileSync(tarball);
    artifactRecords.push({
      name: manifest.name,
      version: manifest.version,
      filename: packed.filename,
      files: packed.files.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      sha512: createHash('sha512').update(bytes).digest('hex'),
      integrity: packed.integrity,
    });
    writeFileSync(join(scratch, `${name}-pack.json`), JSON.stringify(packed, null, 2));
    dependencies[manifest.name] = `file:${tarball}`;
  }

  const rootManifest = readJson(join(root, 'package.json'));
  writeFileSync(
    join(scratch, 'package.json'),
    JSON.stringify({
      name: 'neverland-package-consumer',
      version: '1.0.0',
      private: true,
      dependencies,
      // Resolve the current candidate tarballs while preserving the shipped dependency requirements.
      overrides: {
        '@neverland-money/math-utils': dependencies['@neverland-money/math-utils'],
        '@neverland-money/contract-types': dependencies['@neverland-money/contract-types'],
      },
      devDependencies: {
        esbuild: '0.28.2',
        typescript: '5.9.3',
        ethers: '6.17.0',
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
  writeFileSync(join(scratch, 'artifacts.json'), JSON.stringify(artifactRecords, null, 2));
  const installed = readJson(join(scratch, 'package-lock.json'));
  assert.ok(
    !Object.keys(installed.packages).some(path =>
      /(?:^|\/)node_modules\/@aave\/(?:math-utils|contract-helpers)(?:$|\/)/.test(path),
    ),
    'Installed graph depends on an upstream Aave SDK package',
  );
  const require = createRequire(join(scratch, 'package.json'));
  for (const record of artifactRecords) {
    const installedManifest = require(record.name + '/package.json');
    const originalManifest = readJson(
      join(root, 'packages', record.name.split('/')[1], 'package.json'),
    );
    assert.equal(installedManifest.name, record.name);
    assert.equal(installedManifest.version, record.version);
    assert.deepEqual(installedManifest.dependencies, originalManifest.dependencies);
    for (const path of ['upstream-provenance.json', 'abi-provenance.json'])
      assert.throws(() => require.resolve(record.name + '/' + path), { code: 'MODULE_NOT_FOUND' });
  }

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
  const helpers = require('@neverland-money/contract-helpers');
  const math = require('@neverland-money/math-utils');
  const helperRequire = createRequire(
    require.resolve('@neverland-money/contract-helpers/package.json'),
  );
  const transactions = readJson(
    join(root, 'packages/contract-helpers/src/__fixtures__/transaction-regression-vectors.json'),
  );
  // Explicit current root contracts; type and method contracts are checked by the strict consumers.
  const helperExports = [
    'API_ETH_MOCK_ADDRESS',
    'AbiBaseService',
    'AbiProtocolAction',
    'AbiTxType',
    'BaseDebtToken',
    'ChainId',
    'ChainIdToNetwork',
    'ClaimRewardsHelper',
    'ClaimRewardsTypes',
    'DEFAULT_APPROVE_AMOUNT',
    'DEFAULT_NULL_VALUE_ON_TX',
    'DustAPRCalculator',
    'DustAPRTypes',
    'DustIncentiveProvider',
    'DustLockHelper',
    'DustLockTransactionBuilder',
    'ERC20Service',
    'ERC20_2612Service',
    'InterestRate',
    'MAX_UINT_AMOUNT',
    'NeverlandUiService',
    'NeverlandUiTypes',
    'Pool',
    'PoolBundle',
    'ProtocolAction',
    'SUPER_BIG_ALLOWANCE_NUMBER',
    'UiPoolDataProvider',
    'UnresolvedDustAPRInputError',
    'VeDustRevenueHelper',
    'WETHGatewayLegacyAdapter',
    'WalletBalanceProvider',
    'buildClaimAllRewardsToSelfTxData',
    'buildClaimRewardsToSelfTxData',
    'buildErc2612PermitTypedData',
    'calculateBufferedRepayAmount',
    'calculateMarketAPRFromInputs',
    'decimalsToCurrencyUnits',
    'decodeUserEmissionBreakdown',
    'eEthereumTxType',
    'expectToBeDefined',
    'gasLimitRecommendations',
    'getTxValue',
    'materializeContractResult',
    'synthesizeEModesFromReserves',
    'valueToWei',
  ];
  const mathExports = [
    'BigNumberZeroDecimal',
    'HALF_RAY',
    'HALF_WAD',
    'LTV_PRECISION',
    'RAY',
    'RAY_DECIMALS',
    'SECONDS_PER_YEAR',
    'USD_DECIMALS',
    'UnresolvedDustAPRInputError',
    'WAD',
    'WAD_RAY_RATIO',
    'WEI_DECIMALS',
    'annualizeEmissionRaw',
    'binomialApproximatedRayPow',
    'calculateAllReserveIncentives',
    'calculateAllUserIncentives',
    'calculateAvailableBorrowsMarketReferenceCurrency',
    'calculateBufferedRepayAmount',
    'calculateCompoundedInterest',
    'calculateCompoundedRate',
    'calculateHealthFactorFromBalances',
    'calculateHealthFactorFromBalancesBigUnits',
    'calculateLinearInterest',
    'calculateMarketAPRFromInputs',
    'emissionAprPercent',
    'estimateVeDustPower',
    'formatReserve',
    'formatReserveUSD',
    'formatReserves',
    'formatReservesAndIncentives',
    'formatUserSummary',
    'formatUserSummaryAndIncentives',
    'getCompoundedBalance',
    'getLinearBalance',
    'getMarketReferenceCurrencyAndUsdBalance',
    'getReserveNormalizedIncome',
    'nativeToUSD',
    'normalize',
    'normalizeBN',
    'rayDiv',
    'rayDivCeil',
    'rayDivFloor',
    'rayMul',
    'rayMulCeil',
    'rayMulFloor',
    'rayPow',
    'rayToWad',
    'valueToBigNumber',
    'valueToZDBigNumber',
    'wadToRay',
  ];
  assert.deepEqual(Object.keys(helpers).sort(), helperExports);
  assert.deepEqual(Object.keys(math).sort(), mathExports);
  for (const name of [
    'DustLockHelper',
    'Pool',
    'PoolBundle',
    'ERC20Service',
    'buildErc2612PermitTypedData',
    'calculateBufferedRepayAmount',
  ])
    assert.equal(typeof helpers[name], 'function', `Missing helper export ${name}`);
  checkBufferedRepayDependency({
    consumerRequire: require,
    helperRequire,
    helpers,
    expectedVersion: readJson(join(root, 'packages/math-utils/package.json')).version,
  });
  helpers.expectToBeDefined('standalone consumer');
  assert.throws(() => helpers.expectToBeDefined(undefined), /defined/);
  const helperDependencies = readJson(
    join(root, 'packages/contract-helpers/package.json'),
  ).dependencies;
  assert.ok(
    satisfiesRange(helperRequire('ethers').version, helperDependencies.ethers),
    `Helper ethers ${helperRequire('ethers').version} does not satisfy ${helperDependencies.ethers}`,
  );
  for (const name of ['ethers-v5', '@ethersproject/providers', '@ethersproject/bignumber'])
    assert.throws(
      () => helperRequire.resolve(name),
      undefined,
      `Legacy ethers dependency resolved: ${name}`,
    );
  assert.ok(
    !Object.keys(installed.packages).some(path =>
      /node_modules\/(?:ethers-v5|@ethersproject\/)/.test(path),
    ),
    'Installed graph includes ethers5',
  );
  const helperBigNumberVersion = helperRequire('bignumber.js/package.json').version;
  assert.ok(
    satisfiesRange(helperBigNumberVersion, helperDependencies['bignumber.js']),
    `Helper bignumber.js ${helperBigNumberVersion} does not satisfy ${helperDependencies['bignumber.js']}`,
  );
  const esmMath = await import(
    pathToFileURL(require.resolve('@neverland-money/math-utils/dist/esm/index.js')).href
  );
  const esmHelpers = await import(
    pathToFileURL(require.resolve('@neverland-money/contract-helpers/dist/esm/index.js')).href
  );
  assert.deepEqual(Object.keys(esmHelpers).sort(), helperExports);
  assert.deepEqual(Object.keys(esmMath).sort(), Object.keys(math).sort());
  assert.equal(esmHelpers.calculateBufferedRepayAmount, esmMath.calculateBufferedRepayAmount);
  assert.equal(helpers.calculateMarketAPRFromInputs, math.calculateMarketAPRFromInputs);
  assert.equal(esmHelpers.calculateMarketAPRFromInputs, esmMath.calculateMarketAPRFromInputs);
  assert.equal(helpers.UnresolvedDustAPRInputError, math.UnresolvedDustAPRInputError);
  assert.equal(esmHelpers.UnresolvedDustAPRInputError, esmMath.UnresolvedDustAPRInputError);
  const { JsonRpcProvider } = helperRequire('ethers');
  const provider = new JsonRpcProvider('http://127.0.0.1:1', 143, { staticNetwork: true });
  const { Interface, MaxUint256 } = helperRequire('ethers');
  const lockInterface = new Interface(abis.dustLockAbi);
  const rewardsInterface = new Interface(abis.dustRewardsControllerAbi);
  const uiInterface = new Interface(abis.neverlandUiProviderAbi);
  const largeTokenId = 9007199254740993n;
  for (const sdk of [helpers, esmHelpers]) {
    const decodedMarkets = uiInterface.decodeFunctionResult(
      'getRegisteredPoolMarkets',
      uiInterface.encodeFunctionResult('getRegisteredPoolMarkets', [[[address, 'market']]]),
    )[0];
    const markets = sdk.materializeContractResult(
      uiInterface,
      'getRegisteredPoolMarkets',
      decodedMarkets,
    );
    assert.deepEqual(markets, [{ provider: address, marketId: 'market' }]);
    assert.equal(Object.getPrototypeOf(markets[0]), Object.prototype);
    markets[0].marketId = 'changed';
    assert.equal(decodedMarkets[0].marketId, 'market');
    assert.deepEqual(
      sdk.decodeUserEmissionBreakdown(
        uiInterface.encodeFunctionResult('getUserEmissionBreakdown', [
          [[address, largeTokenId, 'nDUST', false, false]],
          false,
        ]),
      ),
      {
        assets: [address],
        amounts: [largeTokenId],
        symbols: ['nDUST'],
        sides: [false],
        resolved: [false],
        enumerationResolved: false,
      },
    );
    const claimInputs = {
      assetAddresses: Object.freeze([address]),
      chainId: 143,
      rewardsControllerAddress: address,
      lockTime: MaxUint256,
      tokenId: largeTokenId.toString(),
    };
    const claimAll = sdk.buildClaimAllRewardsToSelfTxData(claimInputs);
    assert.equal(claimAll.to, address);
    assert.equal(
      rewardsInterface.decodeFunctionData('claimAllRewardsToSelf', claimAll.data)[2],
      largeTokenId,
    );
    const claim = sdk.buildClaimRewardsToSelfTxData({
      ...claimInputs,
      dustTokenAddress: address,
      amount: '1.000000000000000001',
    });
    const claimArgs = rewardsInterface.decodeFunctionData('claimRewardsToSelf', claim.data);
    assert.equal(claimArgs[1], 1000000000000000001n);
    assert.equal(claimArgs[3], MaxUint256);
    const lock = new sdk.DustLockTransactionBuilder({
      lockAddress: address,
      dustTokenAddress: address,
    });
    const createLock = lock.getCreateLockForTxData({
      amount: largeTokenId.toString(),
      unlockTime: 31536000,
      to: address,
    });
    assert.deepEqual(
      Array.from(lockInterface.decodeFunctionData('createLockFor', createLock.data)),
      [largeTokenId, 31536000n, address],
    );
    assert.equal(
      lockInterface.decodeFunctionData(
        'safeTransferFrom(address,address,uint256)',
        lock.getTransferTxData({ from: address, to: address, tokenId: MaxUint256 }).data,
      )[2],
      MaxUint256,
    );
    assert.equal(
      lockInterface.decodeFunctionData(
        'earlyWithdraw(uint256,uint256)',
        lock.getEarlyWithdrawTxData(largeTokenId, 0n).data,
      )[1],
      0n,
    );
    assert.throws(() => lock.getWithdrawTxData(Number.MAX_SAFE_INTEGER + 1));
    assert.throws(() => lock.getWithdrawTxData('- -1'));
    const apr = sdk.calculateMarketAPRFromInputs({
      emissionPerSecond: 1000000000000000000n,
      distributionEnd: 200n,
      nowSeconds: 100n,
      totalSupplyRaw: 1000000000000n,
      assetDecimals: 6,
      rewardPriceUsd8: 1000000n,
      assetPriceUsd8: 100000000n,
    });
    assert.equal(apr.apr, 31.53);
    assert.equal(apr.annualEmissions, '31536000000000000000000000');
    assert.equal(apr.totalSupply, '1000000000000');
    assert.deepEqual(
      sdk.calculateMarketAPRFromInputs({
        emissionPerSecond: 1n,
        distributionEnd: 100n,
        nowSeconds: 100n,
      }),
      { apr: 0, isActive: false, emissionPerSecond: '1', distributionEnd: 100 },
    );
    assert.throws(
      () =>
        sdk.calculateMarketAPRFromInputs({
          emissionPerSecond: 1n,
          distributionEnd: 200n,
          nowSeconds: 100n,
        }),
      sdk.UnresolvedDustAPRInputError,
    );
  }

  const bundle = new helpers.PoolBundle(provider, { POOL: transactions.pool });
  assert.ok(bundle instanceof helpers.PoolBundle);
  assert.ok(bundle.poolService instanceof helpers.Pool);
  const cjsBase = new helpers.AbiBaseService(provider, abis.poolAbi);
  assert.equal(cjsBase.provider, provider);
  assert.ok(
    cjsBase.getContractInstance(transactions.pool) instanceof helperRequire('ethers').Contract,
  );
  assert.ok(cjsBase.iface instanceof helperRequire('ethers').Interface);
  const legacyJson = value =>
    JSON.parse(
      JSON.stringify(value, (_key, field) =>
        typeof field === 'bigint'
          ? {
              type: 'BigNumber',
              hex:
                '0x' +
                field
                  .toString(16)
                  .padStart(Math.max(2, Math.ceil(field.toString(16).length / 2) * 2), '0'),
            }
          : field,
      ),
    );
  for (const fixture of transactions.cases) {
    const target =
      fixture.builder === 'erc20Service'
        ? new helpers.ERC20Service(provider)
        : bundle[fixture.builder];
    // The vectors keep upstream's Ethereum gas recommendation; Monad bills the full gas limit, so the
    // synchronous builders deliberately omit it.
    const { gasLimit: _upstreamGasLimit, ...upstreamRequest } = fixture.expected;
    const request = legacyJson(target[fixture.method](fixture.args));
    assert.deepEqual(
      request,
      upstreamRequest,
      `Packed helper transaction regression: ${fixture.builder}.${fixture.method}`,
    );
    assert.ok(
      !('gasLimit' in request),
      `Packed helper sets a fixed gas limit: ${fixture.builder}.${fixture.method}`,
    );
  }

  for (const method of ['supplyRaw', 'repayRaw', 'supplyWithPermitRaw', 'repayWithPermitRaw'])
    assert.equal(typeof bundle.poolService[method], 'function');
  for (const build of ['cjs', 'esm']) {
    assert.ok(
      existsSync(
        require.resolve(`@neverland-money/contract-helpers/dist/${build}/pool-contract/pool-types`),
      ),
    );
    assert.ok(
      existsSync(
        require.resolve(
          `@neverland-money/math-utils/dist/${build}/formatters/incentive/calculate-reserve-incentives`,
        ),
      ),
    );
  }

  writeFileSync(
    join(scratch, 'imports.mjs'),
    `
import { poolAbi } from '@neverland-money/contract-types';
import { DustLockHelper, PoolBundle } from '@neverland-money/contract-helpers';
import { ERC20Service, AbiBaseService, Pool, calculateBufferedRepayAmount as helperBuffer } from '@neverland-money/contract-helpers';
import { ERC20Service as DeepToken } from '@neverland-money/contract-helpers/dist/esm/erc20-contract';
import { Pool as DeepPool } from '@neverland-money/contract-helpers/dist/esm/pool-contract/pool.js';
import { valueToBigNumber, calculateBufferedRepayAmount } from '@neverland-money/math-utils';
import { calculateRewardTokenPrice as deepPrice } from '@neverland-money/math-utils/dist/esm/formatters/incentive/calculate-reserve-incentives';
import { calculateRewardTokenPrice as explicitPrice } from '@neverland-money/math-utils/dist/esm/formatters/incentive/calculate-reserve-incentives.js';
import { Contract, Interface, JsonRpcProvider } from 'ethers';
import { createRequire } from 'node:module';
import { NeverlandMonadMainnet } from '@neverland-money/address-book';
if (!poolAbi.length || typeof DustLockHelper !== 'function' || NeverlandMonadMainnet.CHAIN_ID !== 143 || typeof PoolBundle !== 'function' || valueToBigNumber('1').toString() !== '1') throw new Error('Invalid public ESM imports');
const provider = new JsonRpcProvider('http://127.0.0.1:1', 143, { staticNetwork: true });
const address = '0x1111111111111111111111111111111111111111';
const base = new AbiBaseService(provider, poolAbi);
if (base.provider !== provider || !(base.iface instanceof Interface) || !(base.getContractInstance(address) instanceof Contract) || new PoolBundle(provider, {POOL: address}).poolService.constructor !== Pool || DeepPool !== Pool || DeepToken !== ERC20Service || helperBuffer !== calculateBufferedRepayAmount || deepPrice !== explicitPrice || deepPrice([], '0x1', '123000000', '8') !== '1.23') throw new Error('Invalid native ESM identities/deep paths');
if (Contract === createRequire(import.meta.url)('ethers').Contract) throw new Error('Expected distinct ethers import/require class identities');
provider.destroy();
`,
  );
  run(process.execPath, ['imports.mjs']);
  writeFileSync(
    join(scratch, 'browser-entry.mjs'),
    `
import * as abis from '@neverland-money/contract-types';
import { NeverlandMonadMainnet } from '@neverland-money/address-book';
import { DustLockHelper, PoolBundle, Pool, calculateBufferedRepayAmount, buildClaimAllRewardsToSelfTxData, calculateMarketAPRFromInputs } from '@neverland-money/contract-helpers';
import { rayDivCeil, valueToBigNumber } from '@neverland-money/math-utils';
import { calculateRewardTokenPrice } from '@neverland-money/math-utils/dist/esm/formatters/incentive/calculate-reserve-incentives';
if (Object.keys(abis).length !== ${names.length} || NeverlandMonadMainnet.CHAIN_ID !== 143 || typeof DustLockHelper !== 'function' || typeof Pool !== 'function' || typeof PoolBundle !== 'function' || valueToBigNumber('1').toFixed() !== '1' || rayDivCeil('1','1000000000000000000000000000').toFixed(0) !== '1' || calculateRewardTokenPrice([], '0x1', '123000000','8') !== '1.23' || calculateBufferedRepayAmount({debtRaw:'9999999',variableBorrowRateRay:'0',windowSeconds:600}) !== '10000000') throw new Error('Browser ESM acceptance failed');
const claim = buildClaimAllRewardsToSelfTxData({assetAddresses:[],chainId:143,rewardsControllerAddress:'0x1111111111111111111111111111111111111111',lockTime:(1n<<256n)-1n,tokenId:'9007199254740993'});
if (!claim.data.startsWith('0x') || calculateMarketAPRFromInputs({emissionPerSecond:0n,distributionEnd:0n,nowSeconds:0n}).isActive !== false) throw new Error('Browser custom helper acceptance failed');
console.log('Browser-targeted ESM bundle executed');
`,
  );
  const esbuild = require('esbuild');
  const bundled = await esbuild.build({
    absWorkingDir: scratch,
    entryPoints: ['browser-entry.mjs'],
    outdir: 'browser',
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    mainFields: ['browser', 'module', 'main'],
    metafile: true,
    write: true,
    outExtension: { '.js': '.mjs' },
  });
  const inputs = Object.keys(bundled.metafile.inputs);
  for (const name of ['address-book', 'contract-types', 'contract-helpers', 'math-utils'])
    assert.ok(
      inputs.some(file => file.includes('/' + name + '/dist/esm/')),
      `${name}: browser did not consume dist/esm`,
    );
  assert.ok(
    inputs.some(file =>
      file.endsWith('/dist/esm/formatters/incentive/calculate-reserve-incentives.js'),
    ),
    'Missing browser deep calculator',
  );
  assert.ok(
    !inputs.some(file =>
      /@neverland-money\/(?:address-book|contract-types|contract-helpers|math-utils)\/dist\/cjs\//.test(
        file,
      ),
    ),
    'Browser consumed SDK CJS',
  );
  writeFileSync(join(scratch, 'browser-metafile.json'), JSON.stringify(bundled.metafile, null, 2));
  // Native Node imports and this browser bundle both consume the real ESM graph.
  writeFileSync(
    join(scratch, 'browser-runner.mjs'),
    `globalThis.self = globalThis;
globalThis.fetch = () => { throw new Error('Network access is forbidden in browser bundle acceptance'); };
await import('./browser/browser-entry.mjs');
`,
  );
  run(process.execPath, ['browser-runner.mjs']);
  writeFileSync(
    join(scratch, 'consumer.ts'),
    `
import { ${names.join(', ')} } from '@neverland-money/contract-types';
import type { ${catalog.abis.map(entry => entry.typeName).join(', ')}, ContractFunctionName, ContractFunctionReturnType } from '@neverland-money/contract-types';
import { DustLockHelper, ClaimRewardsHelper, NeverlandUiService, Pool, PoolBundle, InterestRate, ERC20Service, ERC20_2612Service, BaseDebtToken, UiPoolDataProvider, WalletBalanceProvider, buildErc2612PermitTypedData, calculateBufferedRepayAmount } from '@neverland-money/contract-helpers';
import { buildClaimAllRewardsToSelfTxData, buildClaimRewardsToSelfTxData, DustLockTransactionBuilder, VeDustRevenueHelper, DustAPRCalculator, UnresolvedDustAPRInputError, calculateMarketAPRFromInputs } from '@neverland-money/contract-helpers';
import { materializeContractResult, decodeUserEmissionBreakdown } from '@neverland-money/contract-helpers';
import type { DecodedUserEmissionBreakdown, UiPaginationOptions, DustMarketAPRInputs, MarketAPR } from '@neverland-money/contract-helpers';
import type { IncentiveDataHumanized, LendingIncentiveDataHumanized, ReservesHelperInput, UserReservesHelperInput, PoolConfig, PoolSupplyRawParams, PoolRepayRawParams, PoolPermitRawParams, PoolSupplyWithPermitRawParams, PoolRepayWithPermitRawParams, transactionType } from '@neverland-money/contract-helpers';
import type { LPBorrowParamsType, LPSetUsageAsCollateral, LPWithdrawParamsType, LPRepayWithPermitParamsType, LPSupplyParamsType, LPSupplyWithPermitType } from '@neverland-money/contract-helpers/dist/esm/pool-contract/pool-types';
import { JsonRpcProvider, Signature } from 'ethers';
import type { Provider, SignatureLike, TransactionRequest } from 'ethers';
import { formatReservesAndIncentives, formatUserSummary, formatUserSummaryAndIncentives, nativeToUSD, normalize, normalizeBN, valueToBigNumber, calculateHealthFactorFromBalancesBigUnits, USD_DECIMALS } from '@neverland-money/math-utils';
import type { BigNumberValue, ComputedUserReserve, FormatReserveUSDResponse, FormatUserSummaryAndIncentivesResponse, UserReserveData } from '@neverland-money/math-utils';
import type { CalculateReserveIncentivesResponse } from '@neverland-money/math-utils/dist/esm/formatters/incentive/calculate-reserve-incentives';
const finite: string = calculateBufferedRepayAmount({ debtRaw:'9999999', variableBorrowRateRay:'0', windowSeconds:600 }); void finite;
void buildErc2612PermitTypedData;
const provider: Provider = new JsonRpcProvider(); declare const config: PoolConfig;
const paginationOptions: UiPaginationOptions = {requireComplete:true};
const uiReader = new NeverlandUiService('0x',provider); void uiReader.getUserDashboardWithPagination('0x',5,paginationOptions); void uiReader.getUiFullBundlePaginated('0x',5,paginationOptions);
declare const interfaceValue: import('ethers').Interface; const plain:unknown=materializeContractResult(interfaceValue,'method',[]); void plain;
const decodedBreakdown:DecodedUserEmissionBreakdown=decodeUserEmissionBreakdown('0x'); const resolvedFlags:boolean[]|null=decodedBreakdown.resolved; const rawRewards:bigint[]=decodedBreakdown.amounts; void resolvedFlags; void rawRewards;
const largeTokenId = '9007199254740993';
const claimInputs = { assetAddresses: ['0x1111111111111111111111111111111111111111'] as const, chainId:143, rewardsControllerAddress:'0x1111111111111111111111111111111111111111', lockTime: (1n << 256n) - 1n, tokenId:largeTokenId };
const pureClaim: {to:string;data:string} = buildClaimAllRewardsToSelfTxData(claimInputs); void pureClaim;
const pureLock = new DustLockTransactionBuilder({lockAddress:'0x',dustTokenAddress:'0x'}); void pureLock.getWithdrawTxData(largeTokenId);
void buildClaimRewardsToSelfTxData({...claimInputs, dustTokenAddress:'0x1111111111111111111111111111111111111111', amount:'1.0'});
const aprInputs:DustMarketAPRInputs = {emissionPerSecond:0n,distributionEnd:0n,nowSeconds:0n}; const aprResult:MarketAPR = calculateMarketAPRFromInputs(aprInputs); const maybeSupply:string|undefined=aprResult.totalSupply; void maybeSupply;
const aprReader = new DustAPRCalculator(); void aprReader.calculateMarketAPR('0x','0x','0x',provider,{}, {nowSeconds:0n});
const unresolved:Error = new UnresolvedDustAPRInputError('missing price'); void unresolved;
declare const revenue:VeDustRevenueHelper; const ids = [largeTokenId,1n,2] as const;
void revenue.getEnableSelfRepayLoanBatchTxData(ids); void revenue.getDisableSelfRepayLoanBatchTxData(ids); void revenue.getBatchClaimRewardsTxData(ids,['0x'] as const);
const pool = new Pool(provider, config); const bundle: PoolBundle = new PoolBundle(provider); void bundle;
declare const supplyRaw: PoolSupplyRawParams; declare const repayRaw: PoolRepayRawParams;
declare const supplyPermit: PoolSupplyWithPermitRawParams; declare const repayPermit: PoolRepayWithPermitRawParams;
void pool.supplyRaw(supplyRaw); void pool.repayRaw(repayRaw); void pool.supplyWithPermitRaw(supplyPermit); void pool.repayWithPermitRaw(repayPermit);
declare const signature: SignatureLike; declare const permit: PoolPermitRawParams; const acceptedSignature: SignatureLike = permit.signature; void acceptedSignature;
declare const signedSupply: LPSupplyWithPermitType; signedSupply.signature = signature;
declare const signedRepay: LPRepayWithPermitParamsType; signedRepay.signature = { r:'0x', s:'0x', yParity:0 };
const compact: SignatureLike = Signature.from(signature).compactSerialized; void compact;
declare const nonce: Awaited<ReturnType<ERC20_2612Service['getNonce']>>; const exactNonce: bigint | null = nonce; void exactNonce;
declare const allowance: Awaited<ReturnType<ERC20Service['allowanceRaw']>>; const exactAllowance: bigint = allowance; void exactAllowance;
declare const humanAllowance: Awaited<ReturnType<ERC20Service['approvedAmount']>>; const normalizedAllowance: string = humanAllowance; void normalizedAllowance;
declare const delegated: Awaited<ReturnType<BaseDebtToken['borrowAllowanceRaw']>>; const exactDelegated: bigint = delegated; void exactDelegated;
declare const humanDelegated: Awaited<ReturnType<BaseDebtToken['approvedDelegationAmount']>>; const normalizedDelegated: string = humanDelegated; void normalizedDelegated;
declare const walletBalance: Awaited<ReturnType<WalletBalanceProvider['balanceOf']>>; const exactBalance: bigint = walletBalance; void exactBalance;
declare const rawUi: Awaited<ReturnType<UiPoolDataProvider['getUserReservesData']>>; const rawCategory: bigint = rawUi[1]; void rawCategory;
declare const humanUi: Awaited<ReturnType<UiPoolDataProvider['getReservesHumanized']>>; const decimals: number = humanUi.reservesData[0].decimals; const liquidity: string = humanUi.reservesData[0].liquidityIndex; void decimals; void liquidity;
declare const tx: transactionType; const ethersTx: TransactionRequest = tx; void ethersTx;
// @ts-expect-error Removed classes and branded namespace cannot return through an alias.
import { LendingPool, LendingPoolBundle, NeverlandPool, AaveV3, LegacyUiPoolDataProvider } from '@neverland-money/contract-helpers';
// @ts-expect-error Decimal parameter types remain deep, outside the root raw API.
import type { LPSupplyParamsType as AccidentalRootType } from '@neverland-money/contract-helpers';
// @ts-expect-error Only string raw amounts are accepted.
const unsafeRaw: PoolSupplyRawParams = { user:'0x', reserve:'0x', amountRaw:1n }; void unsafeRaw;
// @ts-expect-error Ethers5 BigNumber is absent from ethers6.
import { BigNumber } from 'ethers';
// @ts-expect-error BigNumber methods cannot be used on raw bigint reads.
allowance.toNumber();
declare const oldProvider: { getGasPrice(): Promise<unknown>; _isProvider: true };
// @ts-expect-error An ethers5-shaped provider does not satisfy the ethers6 Provider contract.
new Pool(oldProvider);
declare const indexed: ComputedUserReserve; const income: string = indexed.normalizedIncome; const variableDebtIndex: string = indexed.normalizedVariableDebt; void income; void variableDebtIndex;
declare const borrowInput: LPBorrowParamsType; const rate: InterestRate = borrowInput.interestRateMode; void rate;
declare const dust: IncentiveDataHumanized; const asset: string = dust.assetAddress; void asset;
declare const lending: LendingIncentiveDataHumanized; const token: string = lending.tokenAddress; void token;
// @ts-expect-error Native Dust and generic lending incentive DTOs retain distinct shapes.
const incompatible: IncentiveDataHumanized = lending; void incompatible;
type DeepTypes = LPSetUsageAsCollateral | LPWithdrawParamsType | LPRepayWithPermitParamsType | LPSupplyParamsType | LPSupplyWithPermitType | CalculateReserveIncentivesResponse;
declare const preserved: DeepTypes; void preserved;
declare const inputs: ReservesHelperInput | UserReservesHelperInput; const addressesProvider: string = inputs.lendingPoolAddressProvider; void addressesProvider;
interface ExtendedReserve extends FormatReserveUSDResponse { appExtraField:'retained'; }
declare const summary: FormatUserSummaryAndIncentivesResponse<ExtendedReserve>; const extended:'retained' = summary.userReservesData[0].reserve.appExtraField; void extended;
declare const value: BigNumberValue | ComputedUserReserve | UserReserveData; void value;
void formatReservesAndIncentives; void formatUserSummary; void formatUserSummaryAndIncentives; void nativeToUSD; void normalize; void normalizeBN; void valueToBigNumber; void calculateHealthFactorFromBalancesBigUnits; void USD_DECIMALS;
import { NeverlandMonadMainnet } from '@neverland-money/address-book';
${catalog.abis.map(entry => `const ${entry.export}Value: ${entry.typeName} = ${entry.export}; void ${entry.export}Value;`).join('\n')}
const chain:143 = NeverlandMonadMainnet.CHAIN_ID; void chain;
declare const context: ConstructorParameters<typeof DustLockHelper>[0]; new DustLockHelper(context).getCreateLockTxData({amount:'1',lockDuration:604800});
const lock = new DustLockHelper(context); void lock.getLockInfo(largeTokenId); void lock.getEarlyWithdrawTxData(largeTokenId,0n); void lock.getMergeTxData({fromTokenId:largeTokenId,toTokenId:1n});
void lock.getTransferTxData({from:'0x',to:'0x',tokenId:largeTokenId}); void lock.getDustAllowance('0x','0x');
const totalVotingPower:Promise<bigint> = lock.getTotalVotingPower(); const penalty:Promise<bigint> = lock.readEarlyWithdrawPenaltyAmount(largeTokenId); void totalVotingPower; void penalty;
void DustLockHelper.calculateVeDustPower({dustAmount:1,endTimestamp:100,isPermanent:false,currentTimestamp:0});
void DustLockHelper.calculateMergedVeDustPower(1,100,false,0); void DustLockHelper.calculateVeDustIncrease(1,1,100,false,0);
declare const balance: Awaited<ReturnType<DustLockHelper['getDustBalance']>>; const amount:bigint = balance; void amount;
declare const dashboard: Awaited<ReturnType<NeverlandUiService['getUserDashboard']>>; const votingPower:bigint = dashboard.totalVotingPower; void votingPower;
// @ts-expect-error Native balances also expose bigint.
balance.toNumber();
const clonedAbi = Array.from(erc20Abi);
// @ts-expect-error Exact ABI aliases reject reconstructed arrays.
const reconstructed: Erc20Abi = clonedAbi; void reconstructed;
void ClaimRewardsHelper; void NeverlandUiService;
// @ts-expect-error Unknown function names must fail.
const invalidName: ContractFunctionName<PoolAbi> = 'missingFunction'; void invalidName;
declare const reserve: ContractFunctionReturnType<PoolAbi,'view','getReserveData'>; const configuration:bigint = reserve.configuration.data; void configuration;
// @ts-expect-error Reserve indices remain bigint.
const invalidIndex:number = reserve.liquidityIndex; void invalidIndex;
`,
  );
  const broadConsumer = readFileSync(join(scratch, 'consumer.ts'), 'utf8');
  const providerConsumer = readFileSync(
    join(root, 'scripts/fixtures/sdk-node-next-provider.ts'),
    'utf8',
  );
  const legacyCompiler = require.resolve('typescript/bin/tsc');
  const modernCompiler = createRequire(import.meta.url).resolve('typescript/bin/tsc');
  for (const [version, compiler, module, moduleResolution, extension] of [
    ['5.9.3', legacyCompiler, 'CommonJS', 'Node', 'ts'],
    ['5.9.3', legacyCompiler, 'ESNext', 'Bundler', 'ts'],
    ['5.9.3', legacyCompiler, 'NodeNext', 'NodeNext', 'cts'],
    ['5.9.3', legacyCompiler, 'NodeNext', 'NodeNext', 'mts'],
    ['6.0.3', modernCompiler, 'CommonJS', 'Bundler', 'ts'],
    ['6.0.3', modernCompiler, 'ESNext', 'Bundler', 'ts'],
    ['6.0.3', modernCompiler, 'NodeNext', 'NodeNext', 'cts'],
    ['6.0.3', modernCompiler, 'NodeNext', 'NodeNext', 'mts'],
  ]) {
    assert.equal(run(process.execPath, [compiler, '--version']).trim(), `Version ${version}`);
    const build = module === 'CommonJS' || extension === 'cts' ? 'cjs' : 'esm';
    const consumerFile = `consumer.${extension}`;
    const providerFile = `provider.${extension}`;
    writeFileSync(
      join(scratch, consumerFile),
      broadConsumer.replaceAll('/dist/esm/', `/dist/${build}/`),
    );
    writeFileSync(join(scratch, providerFile), providerConsumer.replaceAll('__BUILD__', build));
    writeFileSync(
      join(scratch, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module,
          moduleResolution,
          types: ['node'],
          strict: true,
          skipLibCheck: false,
          noEmit: true,
          resolveJsonModule: true,
          esModuleInterop: true,
        },
        files: [consumerFile, providerFile],
      }),
    );
    run(process.execPath, [compiler, '-p', 'tsconfig.json']);
    console.log(`Strict consumer TS${version} ${module}/${moduleResolution} .${extension}: passed`);
  }

  console.log(
    `Validated browser-targeted dist/esm bundle execution, eight helper transaction cases, and four npm tarballs, ${catalog.abis.length} ABI families, ${Object.keys(catalog.aliases).length} aliases, current public SDK runtime exports, native CJS/ESM root/deep imports, Pool calldata, Provider input/output identities, and strict declarations in eight compiler/mode combinations.`,
  );
  // Keep the existing publication gate after functional checks so its failure cannot hide them.
  const auditResult = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
    cwd: scratch,
    encoding: 'utf8',
  });
  assert.ok(
    auditResult.status === 0 || auditResult.status === 1,
    auditResult.stderr || 'npm audit failed',
  );
  writeFileSync(join(scratch, 'production-audit.json'), auditResult.stdout);
  const audit = JSON.parse(auditResult.stdout || '{}');
  // Exit code 1 means either "vulnerabilities found" or an audit error; only the former has a report.
  assert.ok(
    audit.metadata?.vulnerabilities,
    `npm audit produced no vulnerability report: ${auditResult.stdout || auditResult.stderr}`,
  );
  if (audit.metadata.vulnerabilities.total)
    process.stderr.write(`${JSON.stringify(audit, null, 2)}\n`);
  assert.equal(audit.metadata.vulnerabilities.total, 0, 'Published packages have vulnerabilities');
  console.log('Zero production vulnerabilities.');
} finally {
  if (!evidenceParent) rmSync(scratch, { recursive: true, force: true });
}
