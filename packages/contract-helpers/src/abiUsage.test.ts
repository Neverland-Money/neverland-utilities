import { readFileSync } from 'fs';
import { join } from 'path';
import { utils } from 'ethers';
import {
  dustLockAbi,
  dustRewardsControllerAbi,
  erc20Abi,
  multicall3Abi,
  neverlandUiProviderAbi,
  revenueRewardAbi,
  wethGatewayLegacyAbi,
} from '@neverland-money/contract-types';

// The helpers cast every ABI to `Abi` and call contract methods by name, so the TypeScript build
// cannot see a method that an ABI lacks or overloads. This reads the helper sources and checks
// every method they name against the ABI they call it on.

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

interface Rule {
  file: string;
  abi: keyof typeof ABIS;
  patterns: RegExp[];
}

const RULES: Rule[] = [
  {
    file: 'DustLock-contract/index.ts',
    abi: 'dustLockAbi',
    patterns: [
      /this\.lockContract\.(\w+)\(/g,
      /this\.lockInterface\.\w+\(\s*'([^']+)'/g,
      /this\.encode\(\s*'([^']+)'/g,
    ],
  },
  {
    file: 'DustLock-contract/index.ts',
    abi: 'erc20Abi',
    patterns: [/this\.erc20Contract\.(\w+)\(/g, /this\.erc20Interface\.\w+\(\s*'([^']+)'/g],
  },
  {
    file: 'DustLock-contract/index.ts',
    abi: 'multicall3Abi',
    patterns: [/\bmc\.callStatic\.(\w+)\(/g],
  },
  {
    file: 'DustIncentiveProvider-contract/index.ts',
    abi: 'dustRewardsControllerAbi',
    patterns: [/this\.contract\.(\w+)\(/g, /rewardsControllerIface\.\w+\(\s*'([^']+)'/g],
  },
  {
    file: 'ClaimRewards-contract/index.ts',
    abi: 'dustRewardsControllerAbi',
    patterns: [/this\.encodeFunctionData\(\s*'([^']+)'/g],
  },
  {
    file: 'DustAPR-contract/index.ts',
    abi: 'dustRewardsControllerAbi',
    patterns: [/\bcontroller\.(\w+)\(/g],
  },
  {
    file: 'NeverlandUiProvider-contract/index.ts',
    abi: 'neverlandUiProviderAbi',
    patterns: [/this\.contract\.(\w+)\(/g],
  },
  {
    file: 'VeDustRevenue-contract/index.ts',
    abi: 'dustLockAbi',
    patterns: [/this\.dustLockContract\.(\w+)\(/g],
  },
  {
    file: 'WETHGatewayLegacy-contract/index.ts',
    abi: 'wethGatewayLegacyAbi',
    patterns: [
      /this\.contract\.(?:populateTransaction\.)?(\w+)!?\(/g,
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

    const iface = new utils.Interface(ABIS[abi] as any);
    const functions = Object.values(iface.functions);
    const names = [...new Set(patterns.flatMap(pattern => matches(text, pattern)))].filter(
      name => !CONTRACT_MEMBERS.has(name),
    );
    const problems = names.flatMap(name => {
      if (name.includes('(')) {
        const signature = utils.FunctionFragment.from(name).format();
        return signature in iface.functions ? [] : [`${name} is missing`];
      }
      const overloads = functions.filter(fragment => fragment.name === name).length;
      if (overloads === 0) return [`${name} is missing`];
      return overloads > 1 ? [`${name} is overloaded, so it needs its full signature`] : [];
    });
    expect(problems).toEqual([]);
  });

  it('VeDustRevenueHelper fragments match revenueRewardAbi', () => {
    const text = source('VeDustRevenue-contract/index.ts');
    const fragments = [
      ...matches(text, /'function ([^']+)'/g),
      ...matches(text, /encodeRevenueFunction\(\s*'([^']+)'/g),
    ].map(fragment => utils.FunctionFragment.from(fragment));
    expect(fragments.length).toBeGreaterThan(0);

    const iface = new utils.Interface(revenueRewardAbi as any);
    const outputs = (fragment: utils.FunctionFragment) =>
      (fragment.outputs ?? []).map(output => output.format()).join(',');
    const problems = fragments.flatMap(fragment => {
      const actual = Object.values(iface.functions).find(f => f.format() === fragment.format());
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
