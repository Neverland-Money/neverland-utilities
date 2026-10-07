import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import ts from 'typescript';

describe('ABI type inference', () => {
  it('infers Pool arguments, results, and events and rejects invalid contract calls', () => {
    const directory = mkdtempSync(join(tmpdir(), 'contract-types-inference-'));
    const fixture = join(directory, 'consumer.ts');
    writeFileSync(
      fixture,
      `import { poolAbi, erc20Abi, type PoolAbi } from '@neverland-money/contract-types';
import type { ContractFunctionName, ContractFunctionArgs, ContractFunctionReturnType, ContractEventArgsFromTopics } from '@neverland-money/contract-types';

const name: ContractFunctionName<PoolAbi> = 'supply';
void name;
// @ts-expect-error Unknown Pool function names must be rejected.
const invalidName: ContractFunctionName<PoolAbi> = 'notAPoolFunction';
void invalidName;

const address = '0x1111111111111111111111111111111111111111';
const args: ContractFunctionArgs<PoolAbi, 'nonpayable', 'supply'> = [address, BigInt(1), address, 0];
void args;
// @ts-expect-error Amount must be a bigint.
const invalidArgs: ContractFunctionArgs<PoolAbi, 'nonpayable', 'supply'> = [address, '1', address, 0];
void invalidArgs;

declare const reserve: ContractFunctionReturnType<PoolAbi, 'view', 'getReserveData'>;
const rate: bigint = reserve.currentLiquidityRate;
const configuration: bigint = reserve.configuration.data;
void rate; void configuration;
// @ts-expect-error Return field misspellings must be rejected.
reserve.currentLiquidtyRate;
// @ts-expect-error Rates are returned as bigint, not number.
const invalidRate: number = reserve.currentLiquidityRate;
void invalidRate;

const event: ContractEventArgsFromTopics<PoolAbi, 'Supply'> = { reserve: address, user: address, onBehalfOf: address, amount: BigInt(1), referralCode: 0 };
void event;
// @ts-expect-error Event amounts must be bigint.
const invalidEvent: ContractEventArgsFromTopics<PoolAbi, 'Supply'> = { reserve: address, user: address, onBehalfOf: address, amount: '1', referralCode: 0 };
void invalidEvent;
// @ts-expect-error Existing ABI exports must retain specific function names too.
const invalidErc20: ContractFunctionName<typeof erc20Abi> = 'notAnErc20Function';
void invalidErc20;
void poolAbi;
`,
    );
    try {
      const root = resolve(__dirname, '../../../..');
      const configPath = join(root, 'tsconfig.test.json');
      const config = ts.readConfigFile(configPath, ts.sys.readFile);
      const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
      options.noEmit = true;
      options.paths = { ...options.paths, viem: ['../node_modules/viem'] };
      const program = ts.createProgram([fixture], options);
      const diagnostics = ts
        .getPreEmitDiagnostics(program)
        .map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
      expect(diagnostics).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
