import vectors from './__fixtures__/math-regression-vectors.json';
import * as math from './index';

function isOperation(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

describe('complete SDK math regression expectations', () => {
  vectors.cases.forEach((fixture, index) => {
    it(`${fixture.name} #${index}`, () => {
      const operation: unknown = Reflect.get(math, fixture.name);
      if (!isOperation(operation)) throw new Error(`Missing math operation ${fixture.name}`);
      expect(JSON.parse(JSON.stringify(operation(...fixture.args)))).toEqual(fixture.expected);
    });
  });
});
