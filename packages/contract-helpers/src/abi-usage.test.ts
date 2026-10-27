import { readFileSync } from 'fs';
import { join } from 'path';
import {
  dustLockAbi,
  dustRewardsControllerAbi,
  erc20Abi,
  multicall3Abi,
  neverlandUiProviderAbi,
  revenueRewardAbi,
  wethGatewayLegacyAbi,
} from '@neverland-money/contract-types';
import { ethers } from 'ethers';
// Inventory named helper and transaction-builder call sites against their actual ABIs.
// The source check also catches missing or overloaded method names.
const ABIS = {
  dustLockAbi,
  dustRewardsControllerAbi,
  erc20Abi,
  multicall3Abi,
  neverlandUiProviderAbi,
  wethGatewayLegacyAbi,
};
// Members of an ethers Contract that are not ABI functions.
const CONTRACT_MEMBERS = new Set([
  'attach',
  'callStatic',
  'connect',
  'deployed',
  'estimateGas',
  'filters',
  'functions',
  'interface',
  'populateTransaction',
  'queryFilter',
]);
type Rule = {
  file: string;
  abi: keyof typeof ABIS;
  patterns: RegExp[];
};
const RULES: Rule[] = [
  {
    file: 'dust-lock-contract/index.ts',
    abi: 'dustLockAbi',
    patterns: [/this\.lockContract\.(\w+)\(/g, /this\.lockInterface\.\w+\(\s*'([^']+)'/g],
  },
  {
    file: 'dust-lock-contract/transaction-builder.ts',
    abi: 'dustLockAbi',
    patterns: [/this\.encode\(\s*'([^']+)'/g],
  },
  {
    file: 'dust-lock-contract/index.ts',
    abi: 'erc20Abi',
    patterns: [/this\.erc20Contract\.(\w+)\(/g, /this\.erc20Interface\.\w+\(\s*'([^']+)'/g],
  },
  {
    file: 'dust-lock-contract/transaction-builder.ts',
    abi: 'erc20Abi',
    patterns: [/this\.erc20Interface\.encodeFunctionData\(\s*'([^']+)'/g],
  },
  {
    file: 'dust-lock-contract/index.ts',
    abi: 'multicall3Abi',
    patterns: [/\bmc\.(\w+)\.staticCall\(/g],
  },
  {
    file: 'dust-incentive-provider-contract/index.ts',
    abi: 'dustRewardsControllerAbi',
    patterns: [/this\.contract\.(\w+)\(/g, /rewardsControllerIface\.\w+\(\s*'([^']+)'/g],
  },
  {
    file: 'claim-rewards-contract/index.ts',
    abi: 'dustRewardsControllerAbi',
    patterns: [/\brewardsInterface\.encodeFunctionData\(\s*'([^']+)'/g],
  },
  {
    // Controller reads delegate to DustIncentiveProvider, whose call sites are covered above.
    file: 'dust-apr-contract/index.ts',
    abi: 'erc20Abi',
    patterns: [/\btoken\.readContract\(\s*[^,]+,\s*'([^']+)'/g],
  },
  {
    file: 'neverland-ui-provider-contract/index.ts',
    abi: 'neverlandUiProviderAbi',
    patterns: [/this\.contract\.(\w+)\(/g],
  },
  {
    file: 've-dust-revenue-contract/index.ts',
    abi: 'dustLockAbi',
    patterns: [/this\.dustLockContract\.(\w+)\(/g],
  },
  {
    file: 'weth-gateway-legacy-contract/index.ts',
    abi: 'wethGatewayLegacyAbi',
    patterns: [
      /this\.contract\.(\w+)\.populateTransaction\(/g,
      /this\.contractInterface\.\w+\(\s*'([^']+)'/g,
    ],
  },
];
const source = (file: string): string => readFileSync(join(__dirname, file), 'utf8');
const matches = (text: string, pattern: RegExp): string[] =>
  [...text.matchAll(pattern)].map(match => match[1]);
describe('helper calls against the ABIs', () => {
  it.each(RULES)('$file only uses functions that $abi defines', ({ file, abi, patterns }) => {
    const text = source(file);
    // A pattern that stops matching, after a renamed field say, would otherwise pass silently.
    const stale = patterns.filter(pattern => matches(text, pattern).length === 0);
    expect(stale.map(String)).toEqual([]);
    const iface = new ethers.Interface(ABIS[abi]);
    const functions: ethers.FunctionFragment[] = [];
    iface.forEachFunction(fragment => functions.push(fragment));
    const names = [...new Set(patterns.flatMap(pattern => matches(text, pattern)))].filter(
      name => !CONTRACT_MEMBERS.has(name),
    );
    const problems = names.flatMap(name => {
      if (name.includes('(')) {
        const signature = ethers.FunctionFragment.from(name).format();
        return iface.hasFunction(signature) ? [] : [`${name} is missing`];
      }

      const overloads = functions.filter(fragment => fragment.name === name).length;
      if (overloads === 0) return [`${name} is missing`];
      return overloads > 1 ? [`${name} is overloaded, so it needs its full signature`] : [];
    });
    expect(problems).toEqual([]);
  });
  it('VeDustRevenueHelper fragments match revenueRewardAbi', () => {
    const text = source('ve-dust-revenue-contract/index.ts');
    const fragments = [
      ...matches(text, /'function ([^']+)'/g),
      ...matches(text, /encodeRevenueFunction\(\s*'([^']+)'/g),
    ].map(fragment => ethers.FunctionFragment.from(fragment));
    expect(fragments.length).toBeGreaterThan(0);
    const iface = new ethers.Interface(revenueRewardAbi);
    const outputs = (fragment: ethers.FunctionFragment) =>
      (fragment.outputs ?? []).map(output => output.format()).join(',');
    const problems = fragments.flatMap(fragment => {
      const actual = iface.getFunction(fragment.format());
      if (!actual) return [`${fragment.format()} is missing`];
      // Only fragments that declare outputs decode results, so only those must match.
      if (fragment.outputs?.length && outputs(fragment) !== outputs(actual)) {
        return [`${fragment.format()} returns (${outputs(actual)}), not (${outputs(fragment)})`];
      }

      return [];
    });
    expect(problems).toEqual([]);
  });
});
