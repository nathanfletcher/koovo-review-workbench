/**
 * Money handling: decimal GBP strings are converted to integer pence before any
 * arithmetic. Floats never touch a comparison, so `100.10 + 20.20` cannot drift
 * into `120.30000000000001` and produce a phantom TOTAL_MISMATCH.
 */

export type AmountParseFailure = 'MISSING' | 'INVALID_FORMAT' | 'OUT_OF_RANGE';

export type ParseAmountResult =
  | { ok: true; pence: number }
  | { ok: false; reason: AmountParseFailure };

/** Optional minus, up to 15 integer digits, up to 2 decimals. No separators/symbols/exponents. */
const AMOUNT_PATTERN = /^-?\d{1,15}(\.\d{1,2})?$/;

const MAX_SAFE_PENCE = Number.MAX_SAFE_INTEGER;

export function parseAmountToPence(raw: string | null | undefined): ParseAmountResult {
  if (raw === null || raw === undefined) {
    return { ok: false, reason: 'MISSING' };
  }

  const value = raw.trim();
  if (value === '' || value === '-') {
    return { ok: false, reason: 'MISSING' };
  }

  if (!AMOUNT_PATTERN.test(value)) {
    return { ok: false, reason: 'INVALID_FORMAT' };
  }

  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [wholePart, fractionPart = ''] = unsigned.split('.');

  const penceDigits = `${wholePart}${fractionPart.padEnd(2, '0')}`;
  const magnitude = Number(penceDigits);

  if (!Number.isSafeInteger(magnitude) || magnitude > MAX_SAFE_PENCE) {
    return { ok: false, reason: 'OUT_OF_RANGE' };
  }

  if (magnitude === 0) {
    return { ok: true, pence: 0 };
  }

  return { ok: true, pence: negative ? -magnitude : magnitude };
}

/** `12000` -> "£120.00", `-3600` -> "-£36.00". Sign precedes the symbol, always 2dp. */
export function formatPence(pence: number): string {
  if (!Number.isSafeInteger(pence)) {
    throw new RangeError(`formatPence expects an integer number of pence, received ${pence}`);
  }

  const sign = pence < 0 ? '-' : '';
  const magnitude = Math.abs(pence);
  const pounds = Math.trunc(magnitude / 100);
  const remainder = magnitude % 100;

  return `${sign}£${pounds}.${String(remainder).padStart(2, '0')}`;
}
