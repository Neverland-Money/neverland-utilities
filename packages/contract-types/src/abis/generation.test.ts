import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const script = resolve(__dirname, '../../scripts/generate-abis.mjs');
const abi = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
];

describe('ABI generation', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'contract-types-generation-'));
    mkdirSync(join(directory, 'src/abis'), { recursive: true });
    writeFileSync(join(directory, 'src/abis/tokenAbi.json'), JSON.stringify(abi));
    writeFileSync(
      join(directory, 'abi-provenance.json'),
      JSON.stringify({
        schemaVersion: 1,
        sources: { fixture: { revision: 'fixture-revision' } },
        abis: [
          {
            export: 'tokenAbi',
            typeName: 'TokenAbi',
            source: 'fixture',
            artifact: 'Token.json',
            sha256: createHash('sha256').update(JSON.stringify(abi)).digest('hex'),
          },
        ],
        aliases: { otherTokenAbi: 'tokenAbi' },
      }),
    );
  });

  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  const run = (...args: string[]): string =>
    execFileSync(process.execPath, [script, '--root', directory, ...args], {
      encoding: 'utf8',
      stdio: 'pipe',
    });

  it('detects stale generated exports without rewriting them', () => {
    run();
    run('--check');
    const output = join(directory, 'src/abis/tokenAbi.ts');
    writeFileSync(output, 'export const tokenAbi = [];\n');
    expect(() => run('--check')).toThrow();
    expect(readFileSync(output, 'utf8')).toBe('export const tokenAbi = [];\n');
    run();
    expect(() => run('--check')).not.toThrow();
  });

  it('rejects ABI JSON drift from its provenance', () => {
    const drifted = [{ ...abi[0], name: 'balanceOfChanged' }];
    writeFileSync(join(directory, 'src/abis/tokenAbi.json'), JSON.stringify(drifted));
    expect(() => run()).toThrow('ABI differs from provenance: tokenAbi');
  });

  it('imports complete compiled artifacts and refreshes their provenance', () => {
    const updated = [...abi, { type: 'error', name: 'Unauthorized', inputs: [] }];
    const artifacts = join(directory, 'artifacts');
    mkdirSync(artifacts);
    writeFileSync(join(artifacts, 'Token.json'), JSON.stringify({ abi: updated, bytecode: '0x' }));
    run('--import', 'fixture', artifacts);
    expect(JSON.parse(readFileSync(join(directory, 'src/abis/tokenAbi.json'), 'utf8'))).toEqual(
      updated,
    );
    const provenance = JSON.parse(readFileSync(join(directory, 'abi-provenance.json'), 'utf8'));
    expect(provenance.abis[0].sha256).toBe(
      createHash('sha256').update(JSON.stringify(updated)).digest('hex'),
    );
    expect(provenance.abis[0].entries.error).toBe(1);
    run('--check');
  });
});
