# Releasing Neverland Utilities

The four packages are versioned independently with Lerna. Package manifests define each version,
entrypoint and dependency requirement. Review the corresponding changelog and README whenever a
version changes; breaking public exports, module paths, types or behavior require a major release.

## Prepare and validate

Use Node 24 and the Yarn version pinned by the root manifest. Install the committed dependency
resolutions, then rebuild from source:

```bash
HUSKY=0 YARN_ENABLE_SCRIPTS=false yarn install --immutable --mode=skip-build
yarn clean
yarn build
yarn check-types
yarn check-types:fixtures
node ./node_modules/typescript/bin/tsc -p tsconfig.test.json --noEmit
yarn lint
yarn format:check
yarn test --runInBand
yarn test:validation
yarn test:sdk-fixtures
yarn check:sdk-provenance
yarn test:packages
```

Every package build removes its own `dist` first, so renamed or deleted modules cannot ship stale
output; `yarn clean` also removes the root coverage output and stays in the sequence. Validate the
intended public source in a fresh copy with no previous `dist` or `node_modules`, using the
committed manifest and lockfile. Its workspace dependencies must resolve inside that copy. Follow
[CONTRIBUTING.md](CONTRIBUTING.md) when changing generated ABIs, complete regression vectors or
source provenance.

`yarn test:packages` creates and installs four npm tarballs, checks runtime and dependency identity,
executes CommonJS/ESM/deep imports and a browser bundle, verifies eight strict declaration modes,
and requires zero production dependency advisories. Set `NEVERLAND_PACKAGE_CHECK_DIR` to a chosen
output directory to retain tarballs, consumer projects, compiler results, browser metadata and the
dependency audit. The generated `artifacts.json` records tarball versions and hashes.

Review each tarball's contents: runtime builds, declarations, package documentation and license
notices are included; repository tests, fixtures and source-provenance manifests (including
`abi-provenance.json`) stay in source control. Preserve the MIT notices in both upstream-derived SDK
packages.

The pull request workflow in `.github/workflows/ci.yml` runs the same gates in the same order:
install, build, `check-types`, `check-types:fixtures` and the test-project type check, lint, format
check, tests, `test:validation`, `test:sdk-fixtures`, `check:sdk-provenance` and `test:packages`. It
differs from the sequence above in two ways: it skips `yarn clean`, because a fresh checkout has
nothing to clean, and it runs `yarn test` without `--runInBand`. Treat a green pull request as a
precondition for a release, and still run the full sequence on the release commit.

## Finalize

Before publishing, set the date in the heading of each changelog entry you are releasing to the
release date, for example `## [3.0.0](...) (2026-10-27)`, and merge that change. The package check
requires the first changelog heading to equal the manifest version, but it does not check the date;
the release guard checks both for every package it will publish. Confirm that every `README.md`
still contains `v<version>` for its package version, then rerun `yarn format:check` and
`yarn test:packages`.

## Publish prepared versions

Publish from `main` only, and release from an up-to-date `main`:

```bash
git switch main
git pull --ff-only
git status --short
git rev-parse HEAD origin/main
```

`lerna publish from-package` does not enforce the `allowBranch` setting in `lerna.json`, ignores
untracked files, and counts a package whose registry lookup fails as unpublished. Each release
script therefore runs `scripts/check-release-identity.mjs` first and stops before Lerna starts when
any check fails. Yarn 4 does not run `pre<script>` hooks, so the guard is chained into each script
with `&&`. After the guard, each release script runs `yarn clean` and `yarn build`, and
`release:prepared` also runs `yarn test:packages`, so the tarballs come from a fresh, validated
build even when npm's `ignore-scripts` setting makes Lerna skip every package's `prepublishOnly`
build. The guard is read-only: it runs git read commands, `git ls-remote` and HTTPS GET requests to
the npm registry, and never fetches or writes refs. `release:prepared` runs it with
`--mode=prepared`, which requires:

- an `origin` remote whose fetch and push URLs are the repository named in `package.json`;
- the `main` branch, with `HEAD` equal to `refs/heads/main` on `origin` as `git ls-remote` reports
  it;
- an empty `git status --porcelain --untracked-files=all`, so no modified, staged or untracked file
  that git reports can reach a tarball. Files git does not report, such as paths listed in
  `.git/info/exclude` and entries marked skip-worktree or assume-unchanged, still compile into
  `dist`, so publish from a fresh clone;
- at least one package whose manifest version is not yet on the registry (the publish set). A
  registry or network error fails the check instead of counting as unpublished, and a version that
  was published and later unpublished is rejected;
- for each package in the publish set, a top changelog heading that names the manifest version and
  carries the release date, which is today's UTC date. `RELEASE_DATE` (`YYYY-MM-DD`) is accepted
  only when it is within one day of today's UTC date (yesterday, today or tomorrow), as an allowance
  for time-zone skew; any other value fails. It cannot get past a stale heading: set the heading
  date and merge that change to `main` instead;
- when `NPM_CONFIG_PROVENANCE` or `npm_config_provenance` requests npm provenance, a GitHub Actions
  run (`GITHUB_ACTIONS=true`) with `ACTIONS_ID_TOKEN_REQUEST_URL` and
  `ACTIONS_ID_TOKEN_REQUEST_TOKEN` set, which the job receives from `permissions: id-token: write`.

The guard prints one line per check and exits with status 1 when any check fails. Run it on its own
as a dry run first:

```bash
node scripts/check-release-identity.mjs --mode=prepared
```

The guard does not know whether CI passed for `HEAD`, and it does not replace the validation
sequence. Confirm that `HEAD` is the validated commit on `origin/main`. Also confirm the target
registry account, package access, prepared versions and release artifacts, then publish the versions
already prepared in manifests:

```bash
yarn release:check
yarn release:prepared
```

Arguments passed to a release script, such as `--yes`, reach `lerna publish`, not the guard.

`release:prepared` runs `lerna publish from-package`. Contract helpers require the matching exact
contract-types and math-utils versions, so publish those dependencies first or let Lerna order the
selected packages. Address-book is independent. `lerna.json` sets `exact: true`, so a versioning
release writes exact internal dependency versions. Use `release:latest` only for an intentional
conventional-commit versioning release; it can update versions, create tags and create GitHub
releases. Canary publication is a separate release channel.

`release:latest` and `release:canary` set `NPM_CONFIG_PROVENANCE=true`, and npm generates provenance
only in a supported CI run. Their guard modes therefore always require the GitHub Actions token
variables and fail on a workstation. Without the guard, a local `release:latest` would push the
release commit, tags and GitHub releases before npm rejected the publish. The repository has no
publish workflow yet, so neither script can currently pass the guard. `--mode=latest` also requires
the `origin` identity, `main`, a clean work tree and `HEAD` equal to `main` on `origin`, because
Lerna pushes the current branch and would otherwise carry unreviewed local commits to `main`.
`--mode=canary` requires the `origin` identity, a clean work tree and a `HEAD` that an `origin`
remote-tracking branch already contains, so every canary version resolves to a pushed commit;
canaries may come from any pushed branch.

## Tag the release

`from-package` publishes without creating git tags, so tag each published package yourself. Use the
form `@neverland-money/<package>@<version>`, which is also what the compare links in each changelog
expect, and push the tags:

```bash
git tag @neverland-money/contract-types@3.0.0
git push origin @neverland-money/contract-types@3.0.0
```

Repeat for every package that was published, with its own version. Tag the commit that was
published.

## Verify the publication

Lerna repacks each package during publish and runs its `prepublishOnly` build, so the registry's
`dist.integrity` will not match the hashes in `artifacts.json`. Do not compare hashes. Verify the
published file list and contents instead:

```bash
npm pack @neverland-money/contract-types@3.0.0
tar -tzf neverland-money-contract-types-3.0.0.tgz
```

Extract each registry tarball and compare its file list and file contents with the validated
tarball, for example with `diff -r`. You can also rerun the consumer checks against the registry
tarballs. Then verify the registry versions and dist-tags, install the published packages into a new
consumer, and rerun relevant import, declaration and transaction-encoding checks. Create release
notes describing user-facing changes and supported migration steps. Keep package versions, release
tags and release artifacts aligned.

## Consumer compatibility

Contract helpers and math-utils select separate ESM and CommonJS graphs through root `import` and
`require`, and their `dist/esm` deep paths work in native Node ESM. Address-book and contract-types
expose `module` for ESM bundlers and `main` for CommonJS; native Node root imports load their
CommonJS entrypoint, and their `dist/esm` builds are bundler-only (extensionless specifiers, and
JSON imports without import attributes in contract-types). Deep paths must use the matching
`dist/esm` or `dist/cjs` graph so provider and constructor identities stay consistent. The
[helper guide](packages/contract-helpers/README.md#breaking-migration-to-300) documents breaking
module/type changes, ethers 6 signatures, exact allowance units and finite raw transactions.

SDK validation proves the tested source and package behavior. Verify consuming applications and
contract deployments separately before their release.
