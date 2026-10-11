import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReportResultDto } from '@bcis/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReportsView } from './ReportingViews';

function setup(
  options: {
    canAudit?: boolean;
    canExport?: boolean;
    canViewSubscribers?: boolean;
    canViewBilling?: boolean;
  } = {},
) {
  const preview = vi.fn();
  const exportReport = vi.fn(async () => ({ saved: false, filename: null }));
  const listSubscribers = vi.fn(async () => ({
    items: [],
    page: 1,
    pageSize: 100,
    total: 0,
  }));
  const getInvoice = vi.fn();
  window.bcis = {
    masterData: {
      listSubscribers,
      getSubscriber: vi.fn(),
    },
    billing: { getInvoice },
    payments: { get: vi.fn() },
    reports: { preview, export: exportReport },
  } as unknown as NonNullable<typeof window.bcis>;
  render(
    <ReportsView
      canAudit={options.canAudit ?? false}
      canExport={options.canExport ?? true}
      canViewSubscribers={options.canViewSubscribers ?? true}
      canViewBilling={options.canViewBilling ?? false}
    />,
  );
  return { preview, exportReport, listSubscribers, getInvoice };
}

function result(
  kind: ReportResultDto['kind'],
  rows: ReportResultDto['rows'] = [],
  columns: ReportResultDto['columns'] = [],
): ReportResultDto {
  return {
    kind,
    title:
      kind === 'AR_AGING'
        ? 'Accounts Receivable Aging Report'
        : 'Report answer',
    generatedAt: '2026-10-10T12:00:00Z',
    filters: { from: '2026-10-01', to: '2026-10-10', asOf: '2026-10-10' },
    columns,
    rows,
    totals: {},
    page: 1,
    pageSize: 12,
    total: rows.length,
  };
}

afterEach(() => {
  cleanup();
  delete window.bcis;
});

describe('ReportsView', () => {
  it('groups questions and hides audit reports without audit permission', async () => {
    const user = userEvent.setup();
    setup();

    expect(
      screen.getByRole('tab', { name: 'Revenue & collection' }),
    ).toBeVisible();
    expect(
      screen.getByRole('tab', { name: 'Subscriber accounts' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('tab', { name: 'Controls & audit' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /How much did we collect\?/ }),
    ).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'Subscriber accounts' }));
    expect(
      screen.getByRole('button', {
        name: /Which balances are still outstanding\?/,
      }),
    ).toBeVisible();
  });

  it('shows audit choices only for authorized users, with no write controls', async () => {
    const user = userEvent.setup();
    setup({ canAudit: true, canExport: false });

    await user.click(screen.getByRole('tab', { name: 'Controls & audit' }));
    expect(
      screen.getByRole('button', { name: /Who changed what, when, and why\?/ }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', {
        name: /export pdf|export xlsx|reverse|adjust/i,
      }),
    ).not.toBeInTheDocument();
  });

  it('does not request subscriber data or show account statements without subscriber permission', () => {
    const { listSubscribers } = setup({ canViewSubscribers: false });

    expect(listSubscribers).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', {
        name: /What makes up one subscriber balance\?/,
      }),
    ).not.toBeInTheDocument();
  });

  it('discards a preview response after the selected report changes', async () => {
    const user = userEvent.setup();
    const { preview } = setup();
    let resolvePreview!: (report: ReportResultDto) => void;
    preview.mockReturnValueOnce(
      new Promise<ReportResultDto>((resolve) => {
        resolvePreview = resolve;
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Preview answer' }));
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('tab', { name: 'Subscriber accounts' }));
    resolvePreview(result('COLLECTIONS', [], []));

    expect(
      screen.queryByRole('heading', { name: 'Report answer' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Which balances are still outstanding?',
      }),
    ).toBeVisible();
  });

  it('exports with the same selected report and filters when the save is cancelled', async () => {
    const user = userEvent.setup();
    const { preview, exportReport } = setup();
    preview.mockResolvedValueOnce(result('AR_AGING'));

    await user.click(screen.getByRole('tab', { name: 'Subscriber accounts' }));
    await user.click(screen.getByText('More filters'));
    await user.type(
      screen.getByLabelText('Search result text'),
      'North District',
    );
    await user.click(screen.getByRole('button', { name: 'Preview answer' }));
    await screen.findByRole('heading', {
      name: 'Accounts Receivable Aging Report',
    });
    await user.click(screen.getByRole('button', { name: 'Export PDF' }));

    expect(exportReport).toHaveBeenCalledWith(
      'AR_AGING',
      expect.objectContaining({ q: 'North District' }),
      'pdf',
    );
    expect(await screen.findByText('Export cancelled.')).toBeVisible();
  });

  it('shows correction actor, time, reason, and permission-gated source details', async () => {
    const user = userEvent.setup();
    const { preview, getInvoice } = setup({
      canAudit: true,
      canViewBilling: true,
    });
    const sourceId = '00000000-0000-4000-8000-000000000099';
    preview.mockResolvedValueOnce(
      result(
        'ADJUSTMENTS_REVERSALS_VOIDS',
        [
          {
            date: '2026-10-10T09:30:00.000Z',
            type: 'ADJUSTMENT',
            reference: 'INV-000123',
            subscriber: 'Synthetic Subscriber',
            amountCentavos: 50000,
            actor: 'Owner Operator',
            reason: 'Corrected service charge',
            sourceType: 'invoice',
            sourceId,
          },
        ],
        [
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'type', label: 'Type', type: 'text' },
          { key: 'reference', label: 'Reference', type: 'text' },
          { key: 'subscriber', label: 'Subscriber', type: 'text' },
          { key: 'amountCentavos', label: 'Amount', type: 'money' },
          { key: 'actor', label: 'Actor', type: 'text' },
          { key: 'reason', label: 'Reason', type: 'text' },
        ],
      ),
    );
    getInvoice.mockResolvedValue({
      invoiceNumber: 'INV-000123',
      subscriberName: 'Synthetic Subscriber',
      totalCentavos: 50000,
      dueDate: '2026-10-15',
      status: 'UNPAID',
      adjustments: [],
      allocations: [],
    });

    await user.click(
      screen.getByRole('button', {
        name: /Which financial records changed, and why\?/,
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Preview answer' }));
    await screen.findByRole('heading', { name: 'Report answer' });
    await user.click(screen.getByRole('button', { name: /Inspect record/ }));

    const dialog = screen.getByRole('dialog', { name: 'Report record detail' });
    expect(dialog).toHaveTextContent('Oct 10, 2026');
    expect(dialog).toHaveTextContent(/:\d{2}/);
    expect(dialog).toHaveTextContent('Owner Operator');
    expect(dialog).toHaveTextContent('Corrected service charge');
    await user.click(
      screen.getByRole('button', { name: 'Open invoice record' }),
    );
    expect(await screen.findByText(/Invoice INV-000123/)).toBeVisible();
    expect(getInvoice).toHaveBeenCalledWith(sourceId);
  });
});
