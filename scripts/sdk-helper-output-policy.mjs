import assert from 'node:assert/strict';

/** Permit only the reviewed native incentive module's two emitted source files. */
export function assertHelperOutputPath(file) {
  if (
    /^dist\/(?:cjs|esm)\/ui-incentive-data-provider-contract\/(?:index|types)\.(?:js|d\.ts)(?:\.map)?$/.test(
      file,
    )
  )
    return;
  assert.doesNotMatch(
    file,
    /(?:aave-v3|typechain|umbrella|paraswap|governance|staking|faucet|migration|synthetix|rollups|permissions-manager|cl-feed-registry|token-wrapper|ui-incentive-data-provider)/,
    'Removed helper output shipped',
  );
}
