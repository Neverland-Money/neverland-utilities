import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Read-only release identity guard, chained in front of every `lerna publish` script.
 *
 * It runs only git read commands, `git ls-remote` and HTTPS GET requests to the npm registry. It
 * never fetches or writes refs, and it never writes to the index or the working tree.
 */

export const modes = ['prepared', 'latest', 'canary'];
export const releaseBranch = 'main';
export const releaseRemote = 'origin';
export const defaultRegistry = 'https://registry.npmjs.org/';

// release:latest and release:canary prefix lerna with NPM_CONFIG_PROVENANCE=true. That assignment
// applies to lerna alone, so this process cannot see it and treats provenance as requested.
export const provenanceForcedModes = new Set(['latest', 'canary']);

const root = resolve(import.meta.dirname, '..');

export class ReleaseIdentityError extends Error {
  name = 'ReleaseIdentityError';
}

function fail(message) {
  throw new ReleaseIdentityError(message);
}

/** Reads the mode from the guard's own arguments; Yarn appends user arguments to lerna. */
export function parseMode(argv) {
  const usage = `Usage: node scripts/check-release-identity.mjs --mode=<${modes.join('|')}>`;
  if (argv.length !== 1 || !argv[0].startsWith('--mode=')) fail(usage);
  const mode = argv[0].slice('--mode='.length);
  if (!modes.includes(mode)) fail(`Unknown release mode "${mode}". ${usage}`);
  return mode;
}

function readEnvCaseInsensitive(env, name) {
  return Object.entries(env)
    .filter(([key]) => key.toLowerCase() === name)
    .map(([, value]) => value);
}

/** Lerna reads npm_config_* keys in any letter case; any value but '' or 'false' counts. */
export function isProvenanceRequested(mode, env) {
  if (provenanceForcedModes.has(mode)) return true;
  return readEnvCaseInsensitive(env, 'npm_config_provenance').some(
    value => value !== undefined && !['', 'false'].includes(String(value).trim().toLowerCase()),
  );
}

export function checkProvenanceEnvironment({ mode, env }) {
  if (!isProvenanceRequested(mode, env)) return 'npm provenance is not requested';
  if (env.GITHUB_ACTIONS !== 'true') {
    fail(
      'npm provenance is requested, but this is not a GitHub Actions run (GITHUB_ACTIONS is ' +
        'not "true"). npm would reject the publish after Lerna has already started; run this ' +
        'release from a GitHub Actions workflow with "id-token: write", or unset ' +
        'NPM_CONFIG_PROVENANCE.',
    );
  }

  const missing = ['ACTIONS_ID_TOKEN_REQUEST_URL', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN'].filter(
    name => !env[name],
  );
  if (missing.length > 0) {
    fail(
      `npm provenance is requested, but ${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} ` +
        'not set. Grant the workflow job "permissions: id-token: write".',
    );
  }

  return 'GitHub Actions OIDC token is available for npm provenance';
}

/** Reduces git and npm repository URLs to a lowercase host/owner/name form. */
export function normalizeRepositoryUrl(url) {
  return String(url)
    .trim()
    .replace(/^git\+/, '')
    .replace(/^[a-z][a-z\d+.-]*:\/\/(?:[^@/]+@)?/i, '')
    .replace(/^[^@/:]+@([^:/]+):/, '$1/')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
    .toLowerCase();
}

export function checkRemoteIdentity({ git, repositoryUrl }) {
  const expected = normalizeRepositoryUrl(repositoryUrl);
  const urls = [
    ...git(['remote', 'get-url', '--all', releaseRemote]).split('\n'),
    ...git(['remote', 'get-url', '--push', '--all', releaseRemote]).split('\n'),
  ].filter(Boolean);
  if (urls.length === 0) fail(`Git remote "${releaseRemote}" has no URL.`);
  const foreign = urls.filter(url => normalizeRepositoryUrl(url) !== expected);
  if (foreign.length > 0) {
    fail(
      `Git remote "${releaseRemote}" points to ${foreign.join(', ')}, not the repository in ` +
        `package.json (${repositoryUrl}). Release only from a clone of the canonical repository.`,
    );
  }

  return `${releaseRemote} is ${expected}`;
}

export function checkBranch({ git }) {
  const branch = git(['branch', '--show-current']).trim();
  if (!branch) fail(`HEAD is detached; check out ${releaseBranch} before releasing.`);
  if (branch !== releaseBranch) {
    fail(`The current branch is "${branch}"; release only from "${releaseBranch}".`);
  }

  return `on ${releaseBranch}`;
}

export function checkCleanWorkTree({ git }) {
  const status = git(['status', '--porcelain=v1', '--untracked-files=all']).trimEnd();
  if (status) {
    const lines = status.split('\n');
    const shown = lines.slice(0, 20).join('\n');
    const more = lines.length > 20 ? `\n... and ${lines.length - 20} more` : '';
    fail(
      'The work tree is not clean (modified, staged or untracked files). Commit, remove or ' +
        `ignore them before releasing:\n${shown}${more}`,
    );
  }

  return 'no modified, staged or untracked files';
}

export function checkHeadMatchesRemote({ git }) {
  const head = git(['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  const ref = `refs/heads/${releaseBranch}`;
  const listing = git(['ls-remote', '--exit-code', releaseRemote, ref]);
  const remote = listing
    .split('\n')
    .map(line => line.split('\t'))
    .filter(([, name]) => name === ref)
    .map(([sha]) => sha.trim());
  if (remote.length !== 1 || !/^[\da-f]{40,64}$/.test(remote[0])) {
    fail(`Could not read ${ref} from "${releaseRemote}" with git ls-remote.`);
  }

  if (head !== remote[0]) {
    fail(
      `HEAD is ${head}, but ${releaseRemote} ${ref} is ${remote[0]}. Update the checkout with ` +
        `"git pull --ff-only" (or push the reviewed commits through a pull request) and rerun.`,
    );
  }

  return `HEAD ${head.slice(0, 12)} equals ${releaseRemote}/${releaseBranch}`;
}

export function checkHeadPushed({ git }) {
  const head = git(['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  const refs = git([
    'for-each-ref',
    '--contains',
    head,
    '--format=%(refname)',
    `refs/remotes/${releaseRemote}/`,
  ])
    .split('\n')
    .filter(Boolean);
  if (refs.length === 0) {
    fail(
      `HEAD ${head} is not contained in any ${releaseRemote} remote-tracking branch. Push the ` +
        'commit first so the canary version can be traced to a published commit.',
    );
  }

  return `HEAD ${head.slice(0, 12)} is contained in ${refs[0]}`;
}

const dayMilliseconds = 86_400_000;

/**
 * Returns the release date: today's UTC date from the injected clock, or RELEASE_DATE when set.
 * RELEASE_DATE must be a valid YYYY-MM-DD date within one day of the clock's UTC date, which only
 * allows for time-zone skew; it cannot select a stale date.
 */
export function resolveReleaseDate({ env, now }) {
  const today = now().toISOString().slice(0, 10);
  const configured = env.RELEASE_DATE;
  if (configured === undefined || configured === '') return today;
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(configured) &&
    !Number.isNaN(Date.parse(`${configured}T00:00:00Z`)) &&
    new Date(`${configured}T00:00:00Z`).toISOString().slice(0, 10) === configured;
  if (!valid) fail(`RELEASE_DATE "${configured}" is not a valid YYYY-MM-DD date.`);
  const offset = Date.parse(`${configured}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  if (Math.abs(offset) > dayMilliseconds) {
    fail(
      `RELEASE_DATE ${configured} is more than one day from today's UTC date (${today}); it ` +
        'only allows for time-zone skew.',
    );
  }

  return configured;
}

/** Returns the npm registry Lerna publishes to; only HTTPS registries are accepted. */
export function resolveRegistry(env) {
  const configured = readEnvCaseInsensitive(env, 'npm_config_registry').find(Boolean);
  const registry = configured ?? defaultRegistry;
  let url;
  try {
    url = new URL(registry);
  } catch {
    fail(`npm registry "${registry}" is not a valid URL.`);
  }

  if (url.protocol !== 'https:') fail(`npm registry "${registry}" must use HTTPS.`);
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

/** Fetches a packument. 404 means never published; any other non-200 answer fails closed. */
export async function fetchPackument(name, { fetch, registry }) {
  const url = new URL(name.replace('/', '%2f'), registry);
  let response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    fail(`The registry request for ${name} (${url.href}) failed: ${error.message}`);
  }

  if (response.status === 404) return { name, versions: {}, time: {} };
  if (response.status !== 200) {
    fail(`The registry returned HTTP ${response.status} for ${name} (${url.href}).`);
  }

  let packument;
  try {
    packument = await response.json();
  } catch (error) {
    fail(`The registry returned invalid JSON for ${name}: ${error.message}`);
  }

  if (
    !packument ||
    packument.name !== name ||
    typeof packument.versions !== 'object' ||
    packument.versions === null
  ) {
    fail(`The registry returned an unexpected document for ${name}.`);
  }

  return packument;
}

/** Packages whose manifest version is not on the registry; this is the set Lerna will publish. */
export async function resolvePublishSet({ packages, fetch, registry }) {
  const publishSet = [];
  for (const pkg of packages.filter(entry => !entry.private)) {
    if (pkg.publishConfig?.registry) {
      fail(`${pkg.name} sets publishConfig.registry; this guard checks only ${registry}.`);
    }

    // Sequential requests keep failures attributable and the registry load trivial.
    // eslint-disable-next-line no-await-in-loop
    const packument = await fetchPackument(pkg.name, { fetch, registry });
    if (Object.hasOwn(packument.versions, pkg.version)) continue;
    if (packument.time && Object.hasOwn(packument.time, pkg.version)) {
      fail(
        `${pkg.name}@${pkg.version} was published and later unpublished; npm never accepts a ` +
          'reused version. Bump the version.',
      );
    }

    publishSet.push(pkg);
  }

  if (publishSet.length === 0) {
    fail('Every package version is already on the registry; there is nothing to publish.');
  }

  return publishSet;
}

/** The first release heading, for example `## [3.0.0](compare-url) (2026-10-27)`. */
export function readReleaseHeading(changelog) {
  const line = changelog.split(/\r?\n/).find(entry => /^#{1,2} \[/.test(entry));
  if (!line) return undefined;
  const version = /^#{1,2} \[([^\]]+)\]/.exec(line)[1];
  const date = /^#{1,2} \[[^\]]+\](?:\([^)\s]+\))? \((\d{4}-\d{2}-\d{2})\)$/.exec(
    line.trimEnd(),
  )?.[1];
  return { line, version, date };
}

export function checkChangelogs({ publishSet, releaseDate }) {
  const problems = [];
  for (const pkg of publishSet) {
    if (typeof pkg.changelog !== 'string') {
      problems.push(`${pkg.name}: CHANGELOG.md is missing.`);
      continue;
    }

    const heading = readReleaseHeading(pkg.changelog);
    if (!heading) {
      problems.push(`${pkg.name}: CHANGELOG.md has no release heading.`);
    } else if (heading.version !== pkg.version) {
      problems.push(
        `${pkg.name}: the top CHANGELOG.md heading is ${heading.version}, but the manifest version is ${pkg.version}.`,
      );
    } else if (heading.date !== releaseDate) {
      problems.push(
        `${pkg.name}: the top CHANGELOG.md heading is dated ${heading.date ?? '(no date)'}, but the ` +
          `release date is ${releaseDate}. Set each CHANGELOG.md release heading to the release date ` +
          'and merge that change to main.',
      );
    }
  }

  if (problems.length > 0) fail(problems.join('\n'));
  return `${publishSet.length} changelog heading(s) match the manifest version and ${releaseDate}`;
}

/** Reads `packages/*` workspaces with their manifest and CHANGELOG.md text. */
export function loadWorkspacePackages(directory = root) {
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  const packages = [];
  for (const pattern of manifest.workspaces ?? []) {
    if (!/^[^*]+\/\*$/.test(pattern)) fail(`Unsupported workspace pattern "${pattern}".`);
    const parent = join(directory, pattern.slice(0, -2));
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      const packageDirectory = join(parent, entry.name);
      if (!entry.isDirectory() || !existsSync(join(packageDirectory, 'package.json'))) continue;
      const pkg = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8'));
      const changelogPath = join(packageDirectory, 'CHANGELOG.md');
      packages.push({
        name: pkg.name,
        version: pkg.version,
        private: pkg.private === true,
        publishConfig: pkg.publishConfig,
        changelog: existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : undefined,
      });
    }
  }

  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

/** Runs git without prompts or optional index locks, so `git status` never refreshes the index. */
export function createGit(cwd = root) {
  return args => {
    try {
      return execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60_000,
      });
    } catch (error) {
      const detail = String(error.stderr ?? '').trim() || error.message;
      fail(`git ${args.join(' ')} failed: ${detail}`);
    }
  };
}

export function defaultDependencies() {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  return {
    env: process.env,
    fetch: globalThis.fetch,
    git: createGit(root),
    now: () => new Date(),
    readPackages: () => loadWorkspacePackages(root),
    repositoryUrl: manifest.repository.url,
  };
}

/**
 * Release checks per mode, cheapest first. Lerna already enforces allowBranch, GH_TOKEN and the
 * behind-upstream check for latest, but only after it has started; canary may run from any pushed
 * branch.
 */
export function checksFor(mode) {
  const common = [
    ['provenance environment', checkProvenanceEnvironment],
    ['remote identity', checkRemoteIdentity],
  ];
  const mainHead = [
    ['branch', checkBranch],
    ['clean work tree', checkCleanWorkTree],
    ['HEAD matches remote main', checkHeadMatchesRemote],
  ];
  if (mode === 'canary') {
    return [...common, ['clean work tree', checkCleanWorkTree], ['HEAD pushed', checkHeadPushed]];
  }

  if (mode === 'latest') return [...common, ...mainHead];
  return [
    ...common,
    ...mainHead,
    [
      'publish set',
      async context => {
        context.publishSet = await resolvePublishSet({
          packages: context.readPackages(),
          fetch: context.fetch,
          registry: resolveRegistry(context.env),
        });
        return context.publishSet.map(pkg => `${pkg.name}@${pkg.version}`).join(', ');
      },
    ],
    [
      'changelog headings',
      context => {
        if (!context.publishSet) fail('Skipped: the publish set could not be determined.');
        return checkChangelogs({
          publishSet: context.publishSet,
          releaseDate: resolveReleaseDate(context),
        });
      },
    ],
  ];
}

/** Runs every check for the mode and collects failures; unexpected errors also fail closed. */
export async function runReleaseIdentityChecks(mode, dependencies) {
  const context = { ...dependencies, mode };
  const passed = [];
  const failures = [];
  for (const [name, check] of checksFor(mode)) {
    try {
      // Later checks read results that earlier checks store on the context.
      // eslint-disable-next-line no-await-in-loop
      passed.push([name, await check(context)]);
    } catch (error) {
      failures.push([name, error instanceof ReleaseIdentityError ? error.message : String(error)]);
    }
  }

  return { passed, failures, publishSet: context.publishSet };
}

/** Returns the process exit code: 0 when every check passed, 1 otherwise. */
export async function main(argv, dependencies = defaultDependencies(), output = console) {
  let mode;
  try {
    mode = parseMode(argv);
  } catch (error) {
    output.error(error.message);
    return 1;
  }

  const { passed, failures } = await runReleaseIdentityChecks(mode, dependencies);
  for (const [name, detail] of passed) output.log(`ok   ${name}: ${detail}`);
  for (const [name, message] of failures) output.error(`FAIL ${name}: ${message}`);
  if (failures.length > 0) {
    output.error(`Release identity check failed for mode "${mode}"; nothing was published.`);
    return 1;
  }

  output.log(`Release identity check passed for mode "${mode}".`);
  return 0;
}

// Compare real paths: started through a symlink, the guard must still run rather than exit 0 unchecked.
if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  process.exitCode = await main(process.argv.slice(2));
}
