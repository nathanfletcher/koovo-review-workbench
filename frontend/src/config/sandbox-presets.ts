import type { ValidateRequest, ValidationContext } from '../types/workbench';
import presetData from './sandbox-presets.json';

export interface SandboxPreset {
  id: string;
  label: string;
  /** Why this payload is interesting — shown as the button's tooltip. */
  hint: string;
  context: ValidationContext;
  request: ValidateRequest;
}

/**
 * Payloads live in `sandbox-presets.json` so `scripts/generate-fixture.js` can
 * feed the same objects to the real validation engine and emit expected results
 * for the UI tests. One source of truth, no hand-maintained mock answers.
 */
export const SANDBOX_PRESETS = presetData as unknown as SandboxPreset[];

export const DEFAULT_SANDBOX_PRESET: SandboxPreset =
  SANDBOX_PRESETS.find((preset) => preset.id === 'bad-total') ?? SANDBOX_PRESETS[0]!;

export function presetAsText(preset: SandboxPreset): string {
  return JSON.stringify(preset.request, null, 2);
}
