import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { utils } from 'ethers';
import * as contractTypes from '../index';

interface AbiItem {
  type: string;
}

const files = readdirSync(__dirname)
  .filter(file => file.endsWith('.json'))
  .sort();

const readAbi = (file: string): AbiItem[] =>
  JSON.parse(readFileSync(join(__dirname, file), 'utf8')) as AbiItem[];

describe('contract-types ABIs', () => {
  it('finds the ABI files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('exports %s from the package entry unchanged', file => {
    const name = file.replace(/\.json$/, '');
    expect((contractTypes as unknown as Record<string, unknown>)[name]).toEqual(readAbi(file));
  });

  it.each(files)('parses %s with no duplicate signatures', file => {
    const abi = readAbi(file);
    const iface = new utils.Interface(abi);
    const declared = abi.filter(item => ['error', 'event', 'function'].includes(item.type)).length;
    // ethers keeps only the first fragment for a repeated signature, so a duplicate shows up as a
    // shortfall here.
    const parsed = [iface.errors, iface.events, iface.functions].reduce(
      (count, fragments) => count + Object.keys(fragments).length,
      0,
    );
    expect(parsed).toBe(declared);
  });
});
