/**
 * Display-only GBP formatting from the API's decimal strings. No arithmetic and
 * no `parseFloat`, so a stray extra decimal can never change a displayed value;
 * anything unrecognised is shown verbatim rather than silently rounded.
 */
const AMOUNT_PATTERN = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

export function formatGbp(amount: string | null | undefined): string {
  if (amount === null || amount === undefined) {
    return '—';
  }

  const value = amount.trim();
  if (value === '' || value === '-') {
    return '—';
  }

  const match = AMOUNT_PATTERN.exec(value);
  if (!match) {
    return value;
  }

  const [, sign, wholePart, fractionPart = ''] = match;
  const whole = String(Number(wholePart));
  const pence = fractionPart.padEnd(2, '0');
  const isZero = Number(whole) === 0 && Number(pence) === 0;

  return `${sign === '-' && !isZero ? '-' : ''}£${whole}.${pence}`;
}

/** `2026-11-24T10:15:30.000Z` -> `24 Nov 2026, 10:15`. */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}
