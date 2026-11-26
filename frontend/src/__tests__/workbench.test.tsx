import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import type { MockWorkbenchApi } from '../test-utils/mock-workbench-api';
import { installMockApi } from '../test-utils/mock-workbench-api';

let mock: MockWorkbenchApi;

beforeEach(() => {
  mock = installMockApi();
});

afterEach(() => {
  mock.restore();
});

async function renderApp(): Promise<UserEvent> {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByTestId('row-R001');
  return user;
}

async function openRecord(user: UserEvent, recordId: string): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: `Inspect ${recordId}` }));
  return screen.findByRole('dialog');
}

describe('Review workbench', () => {
  it('shows the summary totals and every supplied record', async () => {
    await renderApp();

    expect(screen.getByTestId('summary-total')).toHaveTextContent('11');
    expect(screen.getByTestId('summary-valid')).toHaveTextContent('5');
    expect(screen.getByTestId('summary-needs-attention')).toHaveTextContent('4');
    expect(screen.getByTestId('summary-excluded')).toHaveTextContent('2');
    expect(screen.getByTestId('summary-unreviewed')).toHaveTextContent('11');

    expect(screen.getAllByRole('button', { name: /^Inspect / })).toHaveLength(11);
    expect(screen.getByTestId('row-R010')).toBeInTheDocument();
  });

  it('filters by client through the API and keeps the summary global', async () => {
    const user = await renderApp();

    await user.selectOptions(screen.getByLabelText('Client'), 'C02');

    await waitFor(() => expect(screen.queryByTestId('row-R001')).not.toBeInTheDocument());

    expect(screen.getByTestId('row-R007')).toBeInTheDocument();
    expect(screen.getByTestId('summary-valid')).toHaveTextContent('5');
    expect(mock.calls.some((call) => call.includes('clientId=C02'))).toBe(true);
  });

  it('filters by validation status', async () => {
    const user = await renderApp();

    await user.selectOptions(screen.getByLabelText('Validation status'), 'Needs Attention');

    await waitFor(() => expect(screen.queryByTestId('row-R001')).not.toBeInTheDocument());

    for (const id of ['R003', 'R004', 'R005', 'R011']) {
      expect(screen.getByTestId(`row-${id}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId('row-R006')).not.toBeInTheDocument();
    expect(screen.getByTestId('summary-needs-attention')).toHaveTextContent('4');
    expect(mock.calls.some((call) => call.includes('validationStatus=Needs+Attention'))).toBe(true);
  });

  it('explains why a Needs Attention record cannot be reviewed', async () => {
    const user = await renderApp();
    const dialog = await openRecord(user, 'R003');

    expect(
      within(dialog).getByText(
        'Total (£365.00) does not equal Subtotal (£300.00) plus VAT (£60.00) (expected £360.00).',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByTestId('mark-reviewed')).toBeDisabled();
    expect(within(dialog).getByTestId('reviewed-reason')).toHaveTextContent(
      'Resolve the 1 validation issue before marking this record Reviewed.',
    );
    expect(within(dialog).getByTestId('detail-transaction-key')).toHaveTextContent(
      'C01::Xero::X-102',
    );
  });

  it('blocks every review action on an excluded record', async () => {
    const user = await renderApp();
    const dialog = await openRecord(user, 'R006');

    expect(within(dialog).getByTestId('excluded-notice')).toHaveTextContent(
      'This record has source status Draft and is excluded from review.',
    );
    expect(within(dialog).getByTestId('mark-reviewed')).toBeDisabled();
    expect(within(dialog).getByTestId('mark-needs-correction')).toBeDisabled();
    expect(within(dialog).getByLabelText('Correction note')).toBeDisabled();
  });

  it('marks a valid record as reviewed and appends an activity entry', async () => {
    const user = await renderApp();
    const dialog = await openRecord(user, 'R001');

    expect(within(dialog).getByTestId('audit-empty')).toBeInTheDocument();

    await user.click(within(dialog).getByTestId('mark-reviewed'));

    const entry = await within(dialog).findByTestId('audit-AUD-0001');
    expect(entry).toHaveTextContent('Marked as Reviewed');
    expect(entry).toHaveTextContent('Nathan Fletcher (acct-nathan)');
    expect(entry).toHaveTextContent('Unreviewed → Reviewed');
    expect(within(dialog).getByTestId('mark-reviewed')).toBeDisabled();
    expect(screen.getByTestId('summary-reviewed')).toHaveTextContent('1');
    expect(mock.reviewBodies[0]).toMatchObject({
      action: 'MARK_REVIEWED',
      reviewerId: 'acct-nathan',
    });
  });

  it('requires a three-character note before sending a record for correction', async () => {
    const user = await renderApp();
    const dialog = await openRecord(user, 'R003');
    const submit = within(dialog).getByTestId('mark-needs-correction');

    expect(submit).toBeDisabled();

    await user.type(within(dialog).getByLabelText('Correction note'), 'ab');
    expect(submit).toBeDisabled();

    await user.type(within(dialog).getByLabelText('Correction note'), 'c');
    expect(submit).toBeEnabled();

    await user.click(submit);

    const entry = await within(dialog).findByTestId('audit-AUD-0001');
    expect(entry).toHaveTextContent('Marked as Needs Correction');
    expect(entry).toHaveTextContent('abc');
    expect(entry).toHaveTextContent('Unreviewed → Needs Correction');
    expect(screen.getByTestId('summary-needs-correction')).toHaveTextContent('1');
  });

  it('closes the drawer with Escape', async () => {
    const user = await renderApp();
    await openRecord(user, 'R008');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('surfaces a load failure and recovers on retry', async () => {
    mock.failNextList();
    const user = userEvent.setup();
    render(<App />);

    const alert = await screen.findByTestId('load-error');
    expect(alert).toHaveTextContent('Could not reach the review API');

    await user.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByTestId('row-R001')).toBeInTheDocument();
    expect(screen.queryByTestId('load-error')).not.toBeInTheDocument();
  });

  it('surfaces a server guardrail error in the drawer without losing the record', async () => {
    const user = await renderApp();
    const dialog = await openRecord(user, 'R001');

    mock.failNextReview();

    await user.click(within(dialog).getByTestId('mark-reviewed'));

    const alert = await within(dialog).findByTestId('review-error');
    expect(alert).toHaveTextContent(
      'R001 has 1 unresolved validation issue (TOTAL_MISMATCH) and cannot be marked as Reviewed.',
    );
    // The action failed: nothing was changed locally and the control is still usable.
    expect(screen.getByTestId('summary-reviewed')).toHaveTextContent('0');
    expect(within(dialog).getByTestId('audit-empty')).toBeInTheDocument();
    expect(within(dialog).getByTestId('mark-reviewed')).toBeEnabled();
    expect(mock.records().find((record) => record.id === 'R001')?.reviewStatus).toBe('Unreviewed');
  });

  it('shows an empty state with a way out when filters match nothing', async () => {
    const user = await renderApp();

    await user.selectOptions(screen.getByLabelText('Client'), 'C02');
    await user.selectOptions(screen.getByLabelText('Validation status'), 'Excluded');

    const empty = await screen.findByRole('status');
    expect(empty).toHaveTextContent('No records match the current filters.');

    await user.click(within(empty).getByRole('button', { name: 'Reset filters' }));

    expect(await screen.findByTestId('row-R001')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Inspect / })).toHaveLength(11);
  });
});
