import type { ValidateRequest } from '../types/workbench';

export const VISIBLE_FIELDS = [
  'clientId',
  'source',
  'sourceId',
  'type',
  'sourceStatus',
  'supplier',
  'subtotal',
  'vat',
  'total',
] as const;

export type PayloadParseResult =
  | { ok: true; value: ValidateRequest }
  | { ok: false; message: string };

/**
 * Client-side shape check only — the server owns the real contract (enums,
 * lengths, amount grammar). This exists so obvious JSON mistakes get an instant
 * message instead of a round trip.
 */
export function readPayload(text: string): PayloadParseResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : 'unexpected token';
    return { ok: false, message: `That payload is not valid JSON (${detail}).` };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, message: 'The payload must be an object such as { "records": [ ... ] }.' };
  }

  const records = (parsed as { records?: unknown }).records;

  if (!Array.isArray(records)) {
    return { ok: false, message: 'The payload must contain a "records" array.' };
  }

  if (records.length === 0) {
    return { ok: false, message: 'Add at least one record to the "records" array.' };
  }

  return { ok: true, value: parsed as ValidateRequest };
}
