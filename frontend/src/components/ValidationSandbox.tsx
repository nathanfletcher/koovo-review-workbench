import { useState } from 'react';
import type { ReactElement } from 'react';
import { ApiError, api } from '../api/client';
import type { SandboxPreset } from '../config/sandbox-presets';
import { DEFAULT_SANDBOX_PRESET, SANDBOX_PRESETS, presetAsText } from '../config/sandbox-presets';
import type { ValidateRequest, ValidateResponse, ValidationContext } from '../types/workbench';
import { VISIBLE_FIELDS, readPayload } from './sandbox-payload';
import { VALIDATION_TONE } from '../utils/badges';

/**
 * A deliberately separate surface from the review queue: this panel only calls
 * POST /api/validate, so nothing typed here can reach the dataset, the summary
 * or the audit log.
 */
export function ValidationSandbox(): ReactElement {
  const [payloadText, setPayloadText] = useState(() => presetAsText(DEFAULT_SANDBOX_PRESET));
  const [context, setContext] = useState<ValidationContext>(DEFAULT_SANDBOX_PRESET.context);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ValidateResponse | null>(null);

  const run = async (text: string, nextContext: ValidationContext): Promise<void> => {
    const parsed = readPayload(text);

    if (!parsed.ok) {
      setResult(null);
      setError(parsed.message);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await api.validateRecords({
        records: (parsed.value as ValidateRequest).records,
        context: nextContext,
      });
      setResult(response);
    } catch (cause) {
      setResult(null);
      setError(cause instanceof ApiError ? cause.message : 'Unexpected error while validating.');
    } finally {
      setBusy(false);
    }
  };

  const runPreset = async (preset: SandboxPreset): Promise<void> => {
    const text = presetAsText(preset);
    setPayloadText(text);
    setContext(preset.context);
    await run(text, preset.context);
  };

  return (
    <section className="sandbox" aria-label="Validation sandbox">
      <details data-testid="sandbox">
        <summary>
          Validation sandbox
          <span className="muted"> — dry run, nothing is saved</span>
        </summary>

        <div className="sandbox__body">
          <p className="muted">
            Send any record through the same validation engine the review queue uses. This panel only
            calls <code>POST /api/validate</code>: no record is added, no review state changes and no
            audit entry is written.
          </p>

          <div className="sandbox__presets" role="group" aria-label="Example payloads">
            {SANDBOX_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="button button--chip"
                title={preset.hint}
                data-testid={`sandbox-preset-${preset.id}`}
                disabled={busy}
                onClick={() => void runPreset(preset)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="field">
            <label htmlFor="sandbox-context">Duplicate detection</label>
            <select
              id="sandbox-context"
              value={context}
              disabled={busy}
              onChange={(event) => setContext(event.target.value as ValidationContext)}
            >
              <option value="isolated">Isolated — evaluate this payload on its own</option>
              <option value="dataset">Against the dataset — collide with R001–R011</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="sandbox-payload">Payload (JSON)</label>
            <textarea
              id="sandbox-payload"
              className="code"
              rows={14}
              spellCheck={false}
              disabled={busy}
              value={payloadText}
              onChange={(event) => setPayloadText(event.target.value)}
            />
          </div>

          <div className="actions">
            <button
              type="button"
              className="button button--primary"
              data-testid="sandbox-run"
              disabled={busy}
              onClick={() => void run(payloadText, context)}
            >
              {busy ? 'Validating…' : 'Run validation'}
            </button>
            <span className="hint">
              Fields: {VISIBLE_FIELDS.join(', ')}. Amounts may be strings or numbers; "-" means missing.
            </span>
          </div>

          {error && (
            <p className="callout callout--error" role="alert" data-testid="sandbox-error">
              {error}
            </p>
          )}

          {result && (
            <div className="sandbox__result" data-testid="sandbox-result">
              <p className="muted" data-testid="sandbox-result-meta">
                Context: {result.context} · {result.count} record
                {result.count === 1 ? '' : 's'} · persisted: false · nothing was saved
              </p>

              <ul className="sandbox__records">
                {result.records.map((record) => (
                  <li key={record.id} data-testid={`sandbox-record-${record.id}`}>
                    <div className="sandbox__record-head">
                      <span className={`badge badge--${VALIDATION_TONE[record.validationStatus]}`}>
                        {record.validationStatus}
                      </span>
                      <strong>{record.id}</strong>
                      <span className="muted">
                        {record.clientId} · {record.source} · {record.sourceId} · {record.type} ·{' '}
                        {record.sourceStatus}
                      </span>
                    </div>

                    {record.issues.length === 0 ? (
                      <p className="muted sandbox__clean">No issues found.</p>
                    ) : (
                      <ul className="issues sandbox__issues">
                        {record.issues.map((issue) => (
                          <li key={`${issue.code}-${issue.field}`} className="issues__item">
                            <span className="badge badge--code">{issue.code}</span>
                            <span>{issue.message}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
