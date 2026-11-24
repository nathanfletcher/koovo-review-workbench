import { describe, expect, it } from 'vitest';
import { formatGbp, formatTimestamp } from '../utils/format';

const CASES: Array<[string | null | undefined, string]> = [
  ['100.00', '£100.00'],
  ['0.00', '£0.00'],
  ['0.5', '£0.50'],
  ['120', '£120.00'],
  ['-30.00', '-£30.00'],
  ['-0.00', '£0.00'],
  ['000123.45', '£123.45'],
  [null, '—'],
  [undefined, '—'],
  ['', '—'],
  ['-', '—'],
  ['  60.00  ', '£60.00'],
  ['not-a-number', 'not-a-number'],
];

describe('formatGbp', () => {
  it.each(CASES)('formats %p as %s', (input, expected) => {
    expect(formatGbp(input)).toBe(expected);
  });
});

describe('formatTimestamp', () => {
  it('renders an ISO timestamp in UTC', () => {
    expect(formatTimestamp('2026-11-24T10:15:30.000Z')).toBe('24 Nov 2026, 10:15');
  });

  it('passes through an unparseable value rather than inventing a date', () => {
    expect(formatTimestamp('not-a-date')).toBe('not-a-date');
  });
});
