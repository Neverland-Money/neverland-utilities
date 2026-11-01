import vectors from './__fixtures__/math-regression-vectors.json';
import * as math from './index';

function isOperation(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

function isArgumentList(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** The immutable upstream vector records pre-fix APR after expiry; only that display field changes. */
function withExpiredAprZero(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withExpiredAprZero);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        key === 'incentiveAPR' ? '0' : withExpiredAprZero(nested),
      ]),
    );
  }

  return value;
}

/** Copy a fixture value, replacing every property named in overrides at any depth. */
function withOverrides(value: unknown, overrides: Readonly<Record<string, unknown>>): unknown {
  if (Array.isArray(value)) return value.map(nested => withOverrides(nested, overrides));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        Object.hasOwn(overrides, key) ? overrides[key] : withOverrides(nested, overrides),
      ]),
    );
  }

  return value;
}

function incentiveAprs(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(incentiveAprs);
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, nested]) =>
    key === 'incentiveAPR' && typeof nested === 'string' ? [nested] : incentiveAprs(nested),
  );
}

describe('complete SDK math regression expectations', () => {
  vectors.cases.forEach((fixture, index) => {
    it(`${fixture.name} #${index}`, () => {
      const operation: unknown = Reflect.get(math, fixture.name);
      if (!isOperation(operation)) throw new Error(`Missing math operation ${fixture.name}`);
      const expected = index === 7 ? withExpiredAprZero(fixture.expected) : fixture.expected;
      expect(JSON.parse(JSON.stringify(operation(...fixture.args)))).toEqual(expected);
    });
  });
});

describe('formatReservesAndIncentives incentive APR at the snapshot time', () => {
  // Vector 7 with both campaigns ending at 1000 instead of 2, so they are live at its 601 snapshot.
  // Each case pins the wall clock to the other side of the end, so only the threaded
  // currentTimestamp can produce the expected classification.
  const fixture = vectors.cases[7];
  const emissionEndTimestamp = 1000;
  const run = (currentTimestamp: number, wallClockSeconds: number): unknown => {
    jest.spyOn(Date, 'now').mockReturnValue(wallClockSeconds * 1000);
    const operation: unknown = Reflect.get(math, fixture.name);
    if (!isOperation(operation)) throw new Error(`Missing math operation ${fixture.name}`);
    const args = withOverrides(fixture.args, { currentTimestamp, emissionEndTimestamp });
    if (!isArgumentList(args)) throw new TypeError('Vector arguments must be an array');
    return JSON.parse(JSON.stringify(operation(...args)));
  };

  it('returns the immutable upstream expectation, APR included, while the campaign is live', () => {
    expect(fixture.name).toBe('formatReservesAndIncentives');
    const result = run(601, emissionEndTimestamp + 1);
    expect(result).toEqual(fixture.expected);
    expect(result).toMatchObject([
      {
        aIncentivesData: [{ incentiveAPR: '157679.94717721769563207196' }],
        vIncentivesData: [{ incentiveAPR: '630719.15609776914118488909' }],
      },
    ]);
  });

  it('returns zero APR once the snapshot time reaches the distribution end', () => {
    expect(incentiveAprs(run(emissionEndTimestamp, 0))).toEqual(['0', '0']);
  });

  it('returns a positive APR one second before the distribution end', () => {
    const aprs = incentiveAprs(run(emissionEndTimestamp - 1, emissionEndTimestamp + 1));
    expect(aprs).toHaveLength(2);
    for (const apr of aprs) {
      const value = math.valueToBigNumber(apr);
      expect(value.isFinite() && value.isGreaterThan(0)).toBe(true);
    }
  });
});
