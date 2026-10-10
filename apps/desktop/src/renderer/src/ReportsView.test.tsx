import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReportResultDto } from '@bcis/contracts';
import { ReportsView } from './ReportingViews';

function setup(canAudit: boolean, canViewSubscribers = true) {
  const preview = vi.fn();
  const exportReport = vi.fn(async () => ({ saved: false }));
  const listSubscribers = vi.fn(async () => ({
    items: [],
    page: 1,
    pageSize: 100,
    total: 0,
  }));
  window.bcis = {
    masterData: {
      listSubscribers,
    },
    reports: { preview, export: exportReport },
  } as unknown as NonNullable<typeof window.bcis>;
  render(
    <ReportsView
      canAudit={canAudit}
      canExport
      canViewSubscribers={canViewSubscribers}
    />,
  );
  return { preview, exportReport, listSubscribers };
}

afterEach(() => {
  cleanup();
  delete window.bcis;
});

describe('ReportsView', () => {
  it('groups reports by workflow and hides audit options without audit permission', () => {
    setup(false);
    const select = screen.getByLabelText('Report');
    expect(
      select.querySelector('optgroup[label="Revenue & collection"]'),
    ).toBeInTheDocument();
    expect(
      select.querySelector('optgroup[label="Subscriber accounts"]'),
    ).toBeInTheDocument();
    expect(
      select.querySelector('optgroup[label="Controls & audit"]'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('What was collected and left outstanding?'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /reverse|adjust/i }),
    ).not.toBeInTheDocument();
  });

  it('shows audit choices only when explicitly authorized', () => {
    setup(true);
    const select = screen.getByLabelText('Report');
    expect(
      select.querySelector('optgroup[label="Controls & audit"]'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Audit trail' }),
    ).toBeInTheDocument();
  });

  it('does not request subscriber data or expose subscriber statements without that permission', () => {
    const { listSubscribers } = setup(false, false);
    expect(listSubscribers).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('option', {
        name: 'Subscriber ledger / Statement of Account',
      }),
    ).not.toBeInTheDocument();
  });

  it('discards a preview response after the selected report changes', async () => {
    const user = userEvent.setup();
    const { preview } = setup(false);
    let resolvePreview!: (result: ReportResultDto) => void;
    const stalePreview = new Promise<ReportResultDto>((resolve) => {
      resolvePreview = resolve;
    });
    preview.mockReturnValueOnce(stalePreview);

    await user.click(screen.getByRole('button', { name: 'Preview report' }));
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    await user.selectOptions(screen.getByLabelText('Report'), 'AR_AGING');
    resolvePreview({
      kind: 'COLLECTIONS',
      title: 'Stale collection results',
      generatedAt: '2026-10-10T12:00:00Z',
      filters: { from: '2026-10-01', to: '2026-10-10' },
      columns: [],
      rows: [],
      totals: {},
      page: 1,
      pageSize: 20,
      total: 0,
    });

    expect(
      screen.queryByRole('heading', { name: 'Stale collection results' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Report')).toHaveValue('AR_AGING');
  });

  it('keeps the current filters when export is cancelled', async () => {
    const user = userEvent.setup();
    const { preview, exportReport } = setup(false);
    preview.mockResolvedValue({
      kind: 'AR_AGING',
      title: 'Accounts Receivable Aging Report',
      generatedAt: '2026-10-10T12:00:00Z',
      filters: { from: '2026-10-01', to: '2026-10-10' },
      columns: [],
      rows: [],
      totals: {},
      page: 1,
      pageSize: 20,
      total: 0,
    });
    await user.selectOptions(screen.getByLabelText('Report'), 'AR_AGING');
    await user.clear(screen.getByLabelText('Search results'));
    await user.type(screen.getByLabelText('Search results'), 'North District');
    await user.click(screen.getByRole('button', { name: 'Preview report' }));
    await screen.findByRole('heading', {
      name: 'Accounts Receivable Aging Report',
    });
    await user.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(screen.getByLabelText('Report')).toHaveValue('AR_AGING');
    expect(screen.getByLabelText('Search results')).toHaveValue(
      'North District',
    );
    expect(exportReport).toHaveBeenCalledWith(
      'AR_AGING',
      expect.objectContaining({ q: 'North District' }),
      'pdf',
    );
    expect(await screen.findByText('Report export cancelled.')).toBeVisible();
  });
});
