/* eslint-disable camelcase -- npm reads lowercase npm_config_* environment variables. */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  checkBranch,
  checkChangelogs,
  checkCleanWorkTree,
  checkHeadMatchesRemote,
  checkHeadPushed,
  checkProvenanceEnvironment,
  checkRemoteIdentity,
  checksFor,
  fetchPackument,
  isProvenanceRequested,
  loadWorkspacePackages,
  main,
  normalizeRepositoryUrl,
  parseMode,
  provenanceForcedModes,
  readReleaseHeading,
  resolvePublishSet,
  resolveRegistry,
  resolveReleaseDate,
  runReleaseIdentityChecks,
} from './check-release-identity.mjs';

const head = 'a'.repeat(40);
const other = 'b'.repeat(40);
const repositoryUrl = 'https://github.com/Neverland-Money/neverland-utilities.git';
const registry = 'https://registry.npmjs.org/';
const githubEnv = {
  GITHUB_ACTIONS: 'true',
  ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.actions.example/',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'token',
};

/** A fake git that answers known read commands and records every call. */
function fakeGit(overrides = {}) {
  const answers = {
    'remote get-url --all origin': 'git@github.com:Neverland-Money/neverland-utilities.git\n',
    'remote get-url --push --all origin':
      'git@github.com:Neverland-Money/neverland-utilities.git\n',
    'branch --show-current': 'main\n',
    'status --porcelain=v1 --untracked-files=all': '',
    'rev-parse --verify HEAD^{commit}': `${head}\n`,
    'ls-remote --exit-code origin refs/heads/main': `${head}\trefs/heads/main\n`,
    [`for-each-ref --contains ${head} --format=%(refname) refs/remotes/origin/`]:
      'refs/remotes/origin/feature\n',
    ...overrides,
  };
  const calls = [];
  const git = args => {
    const key = args.join(' ');
    calls.push(key);
    const answer = answers[key];
    if (answer instanceof Error) throw answer;
    if (answer === undefined) throw new Error(`unexpected git call: ${key}`);
    return answer;
  };

  git.calls = calls;
  return git;
}

/** A fake fetch serving packuments by package name; an Error value rejects the request. */
function fakeFetch(documents) {
  const requests = [];
  const fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    const name = decodeURIComponent(new URL(url).pathname.slice(1));
    const document = documents[name];
    if (document instanceof Error) throw document;
    if (typeof document === 'number') return { status: document, json: async () => ({}) };
    if (document === undefined) return { status: 404, json: async () => ({}) };
    return { status: 200, json: async () => document };
  };

  fetch.requests = requests;
  return fetch;
}

const changelog = (version, date = '2026-11-01') =>
  `# Change Log\n\n## [${version}](https://example.test/compare) (${date})\n\n- Change.\n\n## [0.9.0] (2026-01-01)\n`;
const pkg = (name, version, extra = {}) => ({
  name,
  version,
  private: false,
  changelog: changelog(version),
  ...extra,
});

test('parseMode accepts exactly one known --mode argument', () => {
  assert.equal(parseMode(['--mode=prepared']), 'prepared');
  assert.equal(parseMode(['--mode=latest']), 'latest');
  assert.equal(parseMode(['--mode=canary']), 'canary');
  assert.throws(() => parseMode([]), /Usage/);
  assert.throws(() => parseMode(['--mode=next']), /Unknown release mode "next"/);
  assert.throws(() => parseMode(['--mode=prepared', '--yes']), /Usage/);
  assert.throws(() => parseMode(['prepared']), /Usage/);
});

test('provenance is requested by forced modes or any truthy npm_config_provenance spelling', () => {
  assert.deepEqual([...provenanceForcedModes].sort(), ['canary', 'latest']);
  assert.equal(isProvenanceRequested('latest', {}), true);
  assert.equal(isProvenanceRequested('canary', {}), true);
  assert.equal(isProvenanceRequested('prepared', {}), false);
  assert.equal(isProvenanceRequested('prepared', { NPM_CONFIG_PROVENANCE: 'false' }), false);
  assert.equal(isProvenanceRequested('prepared', { npm_config_provenance: '' }), false);
  assert.equal(isProvenanceRequested('prepared', { NPM_CONFIG_PROVENANCE: 'true' }), true);
  assert.equal(isProvenanceRequested('prepared', { npm_config_provenance: 'TRUE' }), true);
  assert.equal(isProvenanceRequested('prepared', { Npm_Config_Provenance: '1' }), true);
});

test('provenance check passes outside CI only when provenance is not requested', () => {
  assert.match(checkProvenanceEnvironment({ mode: 'prepared', env: {} }), /not requested/);
  assert.match(checkProvenanceEnvironment({ mode: 'latest', env: githubEnv }), /OIDC token/);
  assert.match(
    checkProvenanceEnvironment({
      mode: 'prepared',
      env: { ...githubEnv, NPM_CONFIG_PROVENANCE: 'true' },
    }),
    /OIDC token/,
  );
});

test('provenance check fails before lerna runs without a GitHub Actions OIDC token', () => {
  assert.throws(
    () => checkProvenanceEnvironment({ mode: 'latest', env: {} }),
    /not a GitHub Actions run/,
  );
  assert.throws(
    () =>
      checkProvenanceEnvironment({
        mode: 'prepared',
        env: { npm_config_provenance: 'true', GITHUB_ACTIONS: '1' },
      }),
    /not a GitHub Actions run/,
  );
  assert.throws(
    () => checkProvenanceEnvironment({ mode: 'canary', env: { GITHUB_ACTIONS: 'true' } }),
    /ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_ID_TOKEN_REQUEST_TOKEN are not set/,
  );
  assert.throws(
    () =>
      checkProvenanceEnvironment({
        mode: 'canary',
        env: { ...githubEnv, ACTIONS_ID_TOKEN_REQUEST_URL: '' },
      }),
    /ACTIONS_ID_TOKEN_REQUEST_URL is not set/,
  );
});

test('repository URLs normalize across SSH, HTTPS and npm spellings', () => {
  const expected = 'github.com/neverland-money/neverland-utilities';
  for (const url of [
    repositoryUrl,
    'git+https://github.com/Neverland-Money/neverland-utilities.git',
    'git@github.com:Neverland-Money/neverland-utilities.git',
    'ssh://git@github.com/Neverland-Money/neverland-utilities.git',
    'https://x-access-token:secret@github.com/Neverland-Money/neverland-utilities',
    'https://github.com/Neverland-Money/neverland-utilities/',
  ]) {
    assert.equal(normalizeRepositoryUrl(url), expected, url);
  }

  assert.notEqual(
    normalizeRepositoryUrl('git@github.com:someone/neverland-utilities.git'),
    expected,
  );
});

test('remote identity check requires every origin fetch and push URL to be canonical', () => {
  assert.match(checkRemoteIdentity({ git: fakeGit(), repositoryUrl }), /neverland-utilities/);
  assert.throws(
    () =>
      checkRemoteIdentity({
        git: fakeGit({
          'remote get-url --push --all origin': 'git@github.com:fork/neverland-utilities.git\n',
        }),
        repositoryUrl,
      }),
    /points to git@github.com:fork\/neverland-utilities.git/,
  );
  assert.throws(
    () =>
      checkRemoteIdentity({
        git: fakeGit({ 'remote get-url --all origin': new Error('No such remote') }),
        repositoryUrl,
      }),
    /No such remote/,
  );
});

test('branch check requires main and rejects other branches and detached HEAD', () => {
  assert.equal(checkBranch({ git: fakeGit() }), 'on main');
  assert.throws(
    () =>
      checkBranch({ git: fakeGit({ 'branch --show-current': 'release/frontend-sdk-3.0.0\n' }) }),
    /current branch is "release\/frontend-sdk-3.0.0"/,
  );
  assert.throws(
    () => checkBranch({ git: fakeGit({ 'branch --show-current': '\n' }) }),
    /HEAD is detached/,
  );
});

test('clean work tree check rejects modified, staged and untracked files', () => {
  assert.match(checkCleanWorkTree({ git: fakeGit() }), /no modified/);
  for (const status of [' M package.json\n', 'M  README.md\n', '?? scratch.txt\n']) {
    assert.throws(
      () =>
        checkCleanWorkTree({
          git: fakeGit({ 'status --porcelain=v1 --untracked-files=all': status }),
        }),
      new RegExp(`not clean[\\s\\S]*${status.trim().replaceAll('?', '\\?')}`),
    );
  }

  const many = Array.from({ length: 25 }, (_, index) => `?? file-${index}\n`).join('');
  assert.throws(
    () =>
      checkCleanWorkTree({ git: fakeGit({ 'status --porcelain=v1 --untracked-files=all': many }) }),
    /and 5 more/,
  );
});

test('HEAD check compares against ls-remote and never fetches', () => {
  const git = fakeGit();
  assert.match(checkHeadMatchesRemote({ git }), /equals origin\/main/);
  assert.ok(git.calls.every(call => !/^(?:fetch|pull|remote update)/.test(call)));
  assert.throws(
    () =>
      checkHeadMatchesRemote({
        git: fakeGit({
          'ls-remote --exit-code origin refs/heads/main': `${other}\trefs/heads/main\n`,
        }),
      }),
    new RegExp(`HEAD is ${head}, but origin refs/heads/main is ${other}`),
  );
  assert.throws(
    () =>
      checkHeadMatchesRemote({
        git: fakeGit({ 'ls-remote --exit-code origin refs/heads/main': '' }),
      }),
    /Could not read refs\/heads\/main/,
  );
  assert.throws(
    () =>
      checkHeadMatchesRemote({
        git: fakeGit({
          'ls-remote --exit-code origin refs/heads/main': new Error('Could not resolve host'),
        }),
      }),
    /Could not resolve host/,
  );
});

test('canary HEAD check requires the commit on an origin remote-tracking branch', () => {
  assert.match(checkHeadPushed({ git: fakeGit() }), /refs\/remotes\/origin\/feature/);
  assert.throws(
    () =>
      checkHeadPushed({
        git: fakeGit({
          [`for-each-ref --contains ${head} --format=%(refname) refs/remotes/origin/`]: '',
        }),
      }),
    /not contained in any origin remote-tracking branch/,
  );
});

test('release date comes from the injected UTC clock or a RELEASE_DATE within one day', () => {
  const now = () => new Date('2026-11-01T23:30:00-05:00');
  assert.equal(resolveReleaseDate({ env: {}, now }), '2026-11-02');
  assert.equal(resolveReleaseDate({ env: { RELEASE_DATE: '' }, now }), '2026-11-02');
  for (const value of ['2026-11-01', '2026-11-02', '2026-11-03']) {
    assert.equal(resolveReleaseDate({ env: { RELEASE_DATE: value }, now }), value);
  }

  for (const value of ['2026-02-30', '2026-11-1', 'tomorrow', '2026-11-01T00:00:00Z']) {
    assert.throws(
      () => resolveReleaseDate({ env: { RELEASE_DATE: value }, now }),
      /not a valid YYYY-MM-DD date/,
      value,
    );
  }

  for (const value of ['2026-10-31', '2026-11-04', '2026-10-27']) {
    assert.throws(
      () => resolveReleaseDate({ env: { RELEASE_DATE: value }, now }),
      /more than one day from today's UTC date \(2026-11-02\)/,
      value,
    );
  }
});

test('registry resolution honors npm_config_registry and requires HTTPS', () => {
  assert.equal(resolveRegistry({}), registry);
  assert.equal(
    resolveRegistry({ NPM_CONFIG_REGISTRY: 'https://npm.example/registry' }),
    'https://npm.example/registry/',
  );
  assert.throws(
    () => resolveRegistry({ npm_config_registry: 'http://npm.example/' }),
    /must use HTTPS/,
  );
  assert.throws(() => resolveRegistry({ npm_config_registry: 'not a url' }), /not a valid URL/);
});

test('packument fetch uses an HTTPS GET and fails closed on errors', async () => {
  const fetch = fakeFetch({
    '@scope/published': { name: '@scope/published', versions: { '1.0.0': {} } },
    '@scope/down': new Error('getaddrinfo ENOTFOUND'),
    '@scope/error': 503,
    '@scope/wrong': { name: '@scope/other', versions: {} },
    '@scope/shape': { name: '@scope/shape' },
  });
  const packument = await fetchPackument('@scope/published', { fetch, registry });
  assert.deepEqual(Object.keys(packument.versions), ['1.0.0']);
  assert.equal(fetch.requests[0].url, 'https://registry.npmjs.org/@scope%2fpublished');
  assert.equal(fetch.requests[0].options.method, undefined);
  assert.equal(fetch.requests[0].options.redirect, 'error');
  assert.ok(fetch.requests[0].options.signal instanceof AbortSignal);
  assert.deepEqual((await fetchPackument('@scope/missing', { fetch, registry })).versions, {});
  await assert.rejects(fetchPackument('@scope/down', { fetch, registry }), /ENOTFOUND/);
  await assert.rejects(fetchPackument('@scope/error', { fetch, registry }), /HTTP 503/);
  await assert.rejects(fetchPackument('@scope/wrong', { fetch, registry }), /unexpected document/);
  await assert.rejects(fetchPackument('@scope/shape', { fetch, registry }), /unexpected document/);
});

test('packument fetch fails closed on invalid JSON and on redirects', async () => {
  const badJson = async () => ({
    status: 200,
    json() {
      throw new SyntaxError('Unexpected token < in JSON');
    },
  });
  await assert.rejects(
    fetchPackument('@scope/a', { fetch: badJson, registry }),
    /invalid JSON for @scope\/a: Unexpected token/,
  );
  await assert.rejects(
    resolvePublishSet({ packages: [pkg('@scope/a', '1.0.0')], fetch: badJson, registry }),
    /invalid JSON/,
  );
  const redirected = async () => {
    throw new TypeError('fetch failed: unexpected redirect');
  };

  await assert.rejects(
    fetchPackument('@scope/a', { fetch: redirected, registry }),
    /registry request for @scope\/a .* failed: fetch failed: unexpected redirect/,
  );
});

test('publish set holds unpublished, non-private versions and must not be empty', async () => {
  const fetch = fakeFetch({
    '@scope/a': { name: '@scope/a', versions: { '1.0.0': {} } },
    '@scope/b': { name: '@scope/b', versions: { '1.0.0': {} } },
  });
  const packages = [
    pkg('@scope/a', '1.0.0'),
    pkg('@scope/b', '2.0.0'),
    pkg('@scope/new', '1.0.0'),
    pkg('@scope/private', '1.0.0', { private: true }),
  ];
  const publishSet = await resolvePublishSet({ packages, fetch, registry });
  assert.deepEqual(
    publishSet.map(entry => entry.name),
    ['@scope/b', '@scope/new'],
  );
  assert.ok(fetch.requests.every(request => !request.url.includes('private')));
  await assert.rejects(
    resolvePublishSet({ packages: [pkg('@scope/a', '1.0.0')], fetch, registry }),
    /nothing to publish/,
  );
});

test('publish set fails closed on registry errors, unpublished versions and custom registries', async () => {
  await assert.rejects(
    resolvePublishSet({
      packages: [pkg('@scope/a', '1.0.0')],
      fetch: fakeFetch({ '@scope/a': new Error('socket hang up') }),
      registry,
    }),
    /socket hang up/,
  );
  await assert.rejects(
    resolvePublishSet({
      packages: [pkg('@scope/a', '1.0.1')],
      fetch: fakeFetch({ '@scope/a': { name: '@scope/a', versions: {}, time: { '1.0.1': 'x' } } }),
      registry,
    }),
    /published and later unpublished/,
  );
  await assert.rejects(
    resolvePublishSet({
      packages: [pkg('@scope/a', '1.0.0', { publishConfig: { registry: 'https://other/' } })],
      fetch: fakeFetch({}),
      registry,
    }),
    /sets publishConfig.registry/,
  );
});

test('release headings parse linked and plain versions with their dates', () => {
  assert.deepEqual(readReleaseHeading(changelog('3.0.0', '2026-10-27')), {
    line: '## [3.0.0](https://example.test/compare) (2026-10-27)',
    version: '3.0.0',
    date: '2026-10-27',
  });
  assert.equal(readReleaseHeading('# Change Log\n\n## [1.0.0] (2026-10-27)\n').date, '2026-10-27');
  assert.equal(readReleaseHeading('# Change Log\n\n## [1.0.0]\n').date, undefined);
  assert.equal(readReleaseHeading('# Change Log\n'), undefined);
});

test('changelog check requires the manifest version and release date in the top heading', () => {
  const releaseDate = '2026-11-01';
  assert.match(
    checkChangelogs({ publishSet: [pkg('@scope/a', '1.0.0')], releaseDate }),
    /1 changelog heading/,
  );
  for (const [entry, pattern] of [
    [pkg('@scope/a', '1.0.0', { changelog: undefined }), /CHANGELOG.md is missing/],
    [pkg('@scope/a', '1.0.0', { changelog: '# Change Log\n' }), /no release heading/],
    [pkg('@scope/a', '1.0.1', { changelog: changelog('1.0.0') }), /heading is 1.0.0.*is 1.0.1/],
    [
      pkg('@scope/a', '1.0.0', { changelog: changelog('1.0.0', '2026-10-27') }),
      /dated 2026-10-27, but the release date is 2026-11-01/,
    ],
    [
      pkg('@scope/a', '1.0.0', { changelog: '## [1.0.0]\n' }),
      /dated \(no date\), but the release date is 2026-11-01/,
    ],
  ]) {
    assert.throws(() => checkChangelogs({ publishSet: [entry], releaseDate }), pattern);
  }
});

test('workspace loader reads manifests and changelogs from packages/*', context => {
  const directory = mkdtempSync(join(tmpdir(), 'neverland-release-identity-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ workspaces: ['packages/*'] }));
  for (const [name, withChangelog] of [
    ['b', true],
    ['a', false],
  ]) {
    mkdirSync(join(directory, 'packages', name), { recursive: true });
    writeFileSync(
      join(directory, 'packages', name, 'package.json'),
      JSON.stringify({ name: `@scope/${name}`, version: '1.0.0' }),
    );
    if (withChangelog) writeFileSync(join(directory, 'packages', name, 'CHANGELOG.md'), 'log');
  }

  mkdirSync(join(directory, 'packages', 'not-a-package'));
  assert.deepEqual(loadWorkspacePackages(directory), [
    {
      name: '@scope/a',
      version: '1.0.0',
      private: false,
      publishConfig: undefined,
      changelog: undefined,
    },
    {
      name: '@scope/b',
      version: '1.0.0',
      private: false,
      publishConfig: undefined,
      changelog: 'log',
    },
  ]);
});

test('each mode runs its documented checks in order', () => {
  const names = mode => checksFor(mode).map(([name]) => name);
  assert.deepEqual(names('prepared'), [
    'provenance environment',
    'remote identity',
    'branch',
    'clean work tree',
    'HEAD matches remote main',
    'publish set',
    'changelog headings',
  ]);
  assert.deepEqual(names('latest'), [
    'provenance environment',
    'remote identity',
    'branch',
    'clean work tree',
    'HEAD matches remote main',
  ]);
  assert.deepEqual(names('canary'), [
    'provenance environment',
    'remote identity',
    'clean work tree',
    'HEAD pushed',
  ]);
});

function dependencies(overrides = {}) {
  return {
    env: {},
    fetch: fakeFetch({ '@scope/a': { name: '@scope/a', versions: { '0.9.0': {} } } }),
    git: fakeGit(),
    now: () => new Date('2026-11-01T12:00:00Z'),
    readPackages: () => [pkg('@scope/a', '1.0.0')],
    repositoryUrl,
    ...overrides,
  };
}

function capture() {
  const lines = { log: [], error: [] };
  return {
    lines,
    output: { log: line => lines.log.push(line), error: line => lines.error.push(line) },
  };
}

test('prepared mode passes on a clean, current main with dated unpublished versions', async () => {
  const { lines, output } = capture();
  assert.equal(await main(['--mode=prepared'], dependencies(), output), 0);
  assert.deepEqual(lines.error, []);
  assert.ok(lines.log.includes('ok   publish set: @scope/a@1.0.0'));
  assert.equal(lines.log.at(-1), 'Release identity check passed for mode "prepared".');
});

test('prepared mode reports every failure and exits 1', async () => {
  const { lines, output } = capture();
  const code = await main(
    ['--mode=prepared'],
    dependencies({
      git: fakeGit({
        'branch --show-current': 'release/x\n',
        'status --porcelain=v1 --untracked-files=all': '?? notes.md\n',
      }),
      fetch: fakeFetch({ '@scope/a': new Error('ECONNRESET') }),
    }),
    output,
  );
  assert.equal(code, 1);
  assert.deepEqual(
    lines.error.map(line => line.split(':')[0]),
    [
      'FAIL branch',
      'FAIL clean work tree',
      'FAIL publish set',
      'FAIL changelog headings',
      'Release identity check failed for mode "prepared"; nothing was published.',
    ],
  );
  assert.match(lines.error[2], /ECONNRESET/);
  assert.match(lines.error[3], /publish set could not be determined/);
});

test('prepared mode honors a RELEASE_DATE within one day and rejects a stale heading', async () => {
  for (const [value, date] of [
    ['2026-10-31', '2026-10-31'],
    ['2026-11-02', '2026-11-02'],
  ]) {
    const matching = dependencies({
      env: { RELEASE_DATE: value },
      readPackages: () => [pkg('@scope/a', '1.0.0', { changelog: changelog('1.0.0', date) })],
      now: () => new Date('2026-11-01T12:00:00Z'),
    });
    // eslint-disable-next-line no-await-in-loop -- one case at a time keeps failures attributable.
    assert.equal(await main(['--mode=prepared'], matching, capture().output), 0, value);
  }

  const { lines, output } = capture();
  const stale = dependencies({ now: () => new Date('2026-11-05T00:00:00Z') });
  assert.equal(await main(['--mode=prepared'], stale, output), 1);
  assert.match(lines.error[0], /FAIL changelog headings: .*release date is 2026-11-05/);
  assert.match(lines.error[0], /Set each CHANGELOG.md release heading to the release date/);
  assert.match(lines.error[0], /merge that change to main/);
  assert.doesNotMatch(lines.error[0], /RELEASE_DATE/);
});

test('prepared mode rejects a RELEASE_DATE outside one day or malformed', async () => {
  for (const [value, pattern] of [
    ['2026-10-30', /more than one day/],
    ['2026-11-03', /more than one day/],
    ['2026-13-01', /not a valid YYYY-MM-DD date/],
  ]) {
    const { lines, output } = capture();
    const stale = dependencies({
      env: { RELEASE_DATE: value },
      readPackages: () => [pkg('@scope/a', '1.0.0', { changelog: changelog('1.0.0', value) })],
    });
    // eslint-disable-next-line no-await-in-loop -- one case at a time keeps failures attributable.
    assert.equal(await main(['--mode=prepared'], stale, output), 1, value);
    assert.match(lines.error[0], /^FAIL changelog headings: RELEASE_DATE /);
    assert.match(lines.error[0], pattern);
  }
});

test('latest and canary fail on a workstation before lerna can push or publish', async () => {
  await Promise.all(
    ['latest', 'canary'].map(async mode => {
      const { lines, output } = capture();
      assert.equal(await main([`--mode=${mode}`], dependencies(), output), 1);
      assert.match(lines.error[0], /^FAIL provenance environment: .*GitHub Actions/);
    }),
  );

  const result = await runReleaseIdentityChecks('latest', dependencies({ env: githubEnv }));
  assert.deepEqual(result.failures, []);
  const canary = await runReleaseIdentityChecks(
    'canary',
    dependencies({ env: githubEnv, git: fakeGit({ 'branch --show-current': 'feature\n' }) }),
  );
  assert.deepEqual(canary.failures, []);
});

test('unexpected errors fail closed and invalid arguments exit 1', async () => {
  const { lines, output } = capture();
  const broken = dependencies({
    readPackages() {
      throw new TypeError('boom');
    },
  });
  assert.equal(await main(['--mode=prepared'], broken, output), 1);
  assert.match(lines.error[0], /FAIL publish set: TypeError: boom/);
  const invalid = capture();
  assert.equal(await main(['--mode=prepared', '--yes'], dependencies(), invalid.output), 1);
  assert.match(invalid.lines.error[0], /Usage/);
});

test('every release script runs the guard with its mode before lerna publish', () => {
  const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const releaseScripts = Object.entries(scripts).filter(([, command]) =>
    command.includes('lerna publish'),
  );
  assert.deepEqual(releaseScripts.map(([name]) => name).sort(), [
    'release:canary',
    'release:latest',
    'release:prepared',
  ]);
  for (const [name, command] of releaseScripts) {
    const mode = name.slice('release:'.length);
    const guard = `node scripts/check-release-identity.mjs --mode=${mode} && `;
    assert.ok(command.startsWith(guard), `${name} must start with: ${guard}`);
    assert.equal(command.split('lerna publish').length, 2, `${name}: one lerna publish`);
    if (/npm_config_provenance=/i.test(command)) {
      assert.ok(provenanceForcedModes.has(mode), `${name}: provenance forced but not checked`);
    }
  }

  for (const name of Object.keys(scripts)) {
    assert.doesNotMatch(name, /^pre(?:release|publish)/, `${name}: Yarn 4 never runs pre hooks`);
  }
});
