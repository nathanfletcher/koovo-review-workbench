import { formatPence, parseAmountToPence } from '../../src/domain/money';

function pence(value: string | null | undefined): number {
  const result = parseAmountToPence(value);
  if (!result.ok) {
    throw new Error(`expected "${String(value)}" to parse, got ${result.reason}`);
  }
  return result.pence;
}

function failure(value: string | null | undefined): string {
  const result = parseAmountToPence(value);
  if (result.ok) {
    throw new Error(`expected "${String(value)}" to fail, got ${result.pence} pence`);
  }
  return result.reason;
}

const PARSE_CASES: Array<[string, number]> = [
  ['100.00', 10000],
  ['0.01', 1],
  ['0.10', 10],
  ['0.1', 10],
  ['7', 700],
  ['144.00', 14400],
  ['-36.00', -3600],
  ['-0.00', 0],
  ['  120.00  ', 12000],
  ['000123.45', 12345],
];

const MISSING_CASES: Array<[string | null | undefined]> = [[null], [undefined], [''], ['-'], ['   ']];

const INVALID_CASES: Array<[string]> = [
  ['100.001'],
  ['1,000.00'],
  ['£100.00'],
  ['100.'],
  ['.99'],
  ['1e3'],
  ['abc'],
  ['+5.00'],
  [' 1 0.00 '],
];

const FORMAT_CASES: Array<[number, string]> = [
  [0, '£0.00'],
  [5, '£0.05'],
  [60, '£0.60'],
  [12000, '£120.00'],
  [36500, '£365.00'],
  [-3600, '-£36.00'],
  [-12000, '-£120.00'],
  [100000000, '£1000000.00'],
];

describe('parseAmountToPence', () => {
  it.each(PARSE_CASES)('parses %s to %i pence', (input, expected) => {
    expect(pence(input)).toBe(expected);
  });

  it.each(MISSING_CASES)('treats %p as a missing amount', (input) => {
    expect(failure(input)).toBe('MISSING');
  });

  it.each(INVALID_CASES)('rejects %s as an invalid format', (input) => {
    expect(failure(input)).toBe('INVALID_FORMAT');
  });

  it('reports amounts beyond the safe integer range instead of silently rounding', () => {
    expect(failure('999999999999999.00')).toBe('OUT_OF_RANGE');
    expect(failure('12345678901234567.00')).toBe('INVALID_FORMAT');
  });

  it('never drifts on values that break float arithmetic', () => {
    // 100.10 + 20.20 === 120.30000000000001 in IEEE-754.
    expect(pence('100.10') + pence('20.20')).toBe(pence('120.30'));
    expect(pence('0.10') + pence('0.20')).toBe(pence('0.30'));
    expect(pence('300.00') + pence('60.00')).not.toBe(pence('365.00'));
  });
});

describe('formatPence', () => {
  it.each(FORMAT_CASES)('formats %i pence as %s', (input, expected) => {
    expect(formatPence(input)).toBe(expected);
  });

  it('rejects non-integer pence so callers cannot accidentally format a float', () => {
    expect(() => formatPence(120.5)).toThrow(RangeError);
    expect(() => formatPence(Number.NaN)).toThrow(RangeError);
  });

  it('round-trips through the parser', () => {
    expect(formatPence(pence('0.00'))).toBe('£0.00');
    expect(formatPence(pence('0.01'))).toBe('£0.01');
    expect(formatPence(pence('99.99'))).toBe('£99.99');
    expect(formatPence(pence('-0.01'))).toBe('-£0.01');
    expect(formatPence(pence('-1234.56'))).toBe('-£1234.56');
  });
});
