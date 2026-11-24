import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { SANDBOX_PRESETS } from '../config/sandbox-presets';
import type { MockWorkbenchApi } from '../test-utils/mock-workbench-api';
import { installMockApi } from '../test-utils/mock-workbench-api';

let mock: MockWorkbenchApi;

beforeEach(() => {
  mock = installMockApi();
});

afterEach(() => {
  mock.restore();
});

async function openSandbox(): Promise<UserEvent> {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByTestId('row-R001');

  const details = screen.getByTestId('sandbox');
  details.setAttribute('open', '');

  return user;
}

function textarea(): HTMLTextAreaElement {
  return screen.getByLabelText('Payload (JSON)') as HTMLTextAreaElement;
}

describe('Validation sandbox (dry run)', () => {
  it('is labelled as a dry run and is closed by default', async () => {
    render(<App />);
    await screen.findByTestId('row-R001');

    const details = screen.getByTestId('sandbox');
    expect(details).not.toHaveAttribute('open');
    expect(details).toHaveTextContent('nothing is saved');
  });

  it('shows the arithmetic problem when a preset total does not add up', async () => {
    const user = await openSandbox();

    await user.click(screen.getByTestId('sandbox-preset-bad-total'));

    const result = await screen.findByTestId('sandbox-result');
    expect(result).toHaveTextContent('Needs Attention');
    expect(result).toHaveTextContent('TOTAL_MISMATCH');
    expect(result).toHaveTextContent('expected £360.00');
    expect(screen.getByTestId('sandbox-result-meta')).toHaveTextContent('persisted: false');
  });

  it('accepts a clean record', async () => {
    const user = await openSandbox();

    await user.click(screen.getByTestId('sandbox-preset-clean'));

    const result = await screen.findByTestId('sandbox-result');
    expect(result).toHaveTextContent('Valid');
    expect(result).toHaveTextContent('No issues found.');
    expect(result).not.toHaveTextContent('TOTAL_MISMATCH');
  });

  it('excludes a Draft record without validating it', async () => {
    const user = await openSandbox();

    await user.click(screen.getByTestId('sandbox-preset-draft'));

    const result = await screen.findByTestId('sandbox-result');
    expect(result).toHaveTextContent('Excluded');
    expect(result).toHaveTextContent('No issues found.');
  });

  it('accepts negative amounts on a Credit', async () => {
    const user = await openSandbox();

    await user.click(screen.getByTestId('sandbox-preset-negative-credit'));

    const result = await screen.findByTestId('sandbox-result');
    expect(result).toHaveTextContent('Valid');
    expect(result).not.toHaveTextContent('NEGATIVE_BILL_AMOUNT');
  });

  it('flags a missing supplier and a negative bill', async () => {
    const user = await openSandbox();

    await user.click(screen.getByTestId('sandbox-preset-missing-supplier'));
    expect(await screen.findByTestId('sandbox-result')).toHaveTextContent('MISSING_SUPPLIER');

    await user.click(screen.getByTestId('sandbox-preset-negative-bill'));
    await waitFor(() =>
      expect(screen.getByTestId('sandbox-result')).toHaveTextContent('NEGATIVE_BILL_AMOUNT'),
    );
  });

  it('checks duplicates against the dataset only when asked', async () => {
    const user = await openSandbox();

    await user.click(screen.getByTestId('sandbox-preset-duplicate-of-r001'));

    const result = await screen.findByTestId('sandbox-result');
    expect(result).toHaveTextContent('DUPLICATE_TRANSACTION');
    expect(result).toHaveTextContent('already ingested as R001');
    expect(screen.getByTestId('sandbox-result-meta')).toHaveTextContent('dataset');
    expect(mock.validateBodies[0]).toMatchObject({ context: 'dataset' });
  });

  it('applies the context selector to the payload being run', async () => {
    const user = await openSandbox();

    await user.selectOptions(screen.getByLabelText('Duplicate detection'), 'dataset');
    await user.click(screen.getByTestId('sandbox-run'));

    await screen.findByTestId('sandbox-result');
    expect(mock.validateBodies[0]).toMatchObject({ context: 'dataset' });
  });

  it('never writes: only the dry-run endpoint is called and the dataset is untouched', async () => {
    const user = await openSandbox();

    await user.click(screen.getByTestId('sandbox-preset-bad-total'));
    await screen.findByTestId('sandbox-result');

    const mutating = mock.calls.filter(
      (call) => !call.startsWith('GET /api/transactions') && !call.startsWith('POST /api/validate'),
    );
    expect(mutating).toEqual([]);
    expect(screen.getByTestId('summary-total')).toHaveTextContent('11');
    expect(screen.getByTestId('summary-unreviewed')).toHaveTextContent('11');
    expect(mock.records().every((record) => record.reviewStatus === 'Unreviewed')).toBe(true);
  });

  it('rejects invalid JSON without calling the API', async () => {
    const user = await openSandbox();
    const callsBefore = mock.calls.length;

    fireEvent.change(textarea(), { target: { value: 'not json at all' } });
    await user.click(screen.getByTestId('sandbox-run'));

    const error = await screen.findByTestId('sandbox-error');
    expect(error).toHaveTextContent('not valid JSON');
    expect(mock.calls.length).toBe(callsBefore);
    expect(screen.queryByTestId('sandbox-result')).not.toBeInTheDocument();
  });

  it('rejects a payload without a records array', async () => {
    const user = await openSandbox();

    fireEvent.change(textarea(), { target: { value: '{"foo": []}' } });
    await user.click(screen.getByTestId('sandbox-run'));

    expect(await screen.findByTestId('sandbox-error')).toHaveTextContent('"records" array');
  });

  it("surfaces the server's 400 for a malformed record", async () => {
    const user = await openSandbox();
    const payload = JSON.stringify({
      records: [
        {
          source: 'Xero',
          sourceId: 'X-1',
          type: 'Bill',
          sourceStatus: 'Posted',
          subtotal: '10.00',
          vat: '2.00',
          total: '12.00',
        },
      ],
    });

    fireEvent.change(textarea(), { target: { value: payload } });
    await user.click(screen.getByTestId('sandbox-run'));

    const error = await screen.findByTestId('sandbox-error');
    expect(error).toHaveTextContent('clientId is required');
    expect(screen.queryByTestId('sandbox-result')).not.toBeInTheDocument();
  });

  it('loads the current payload text into the editor from a preset', async () => {
    const user = await openSandbox();
    const preset = SANDBOX_PRESETS.find((candidate) => candidate.id === 'penny-out');

    await user.click(screen.getByTestId('sandbox-preset-penny-out'));

    await screen.findByTestId('sandbox-result');
    expect(textarea().value).toContain('"total": "120.01"');
    expect(preset).toBeDefined();
  });
});
