import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BillingView } from './BillingViews';

const cycle = {
  id: 'cycle-draft',
  periodYear: 2026,
  periodMonth: 10,
  status: 'DRAFT' as const,
  invoiceCount: 3,
  totalCentavos: 450000,
  finalizedAt: null,
};

function renderBilling(canGenerate = true) {
  const finalize = vi.fn(async () => ({ finalized: 3 }));
  window.bcis = {
    billing: {
      listCycles: vi.fn(async () => [cycle]),
      listInvoices: vi.fn(async () => ({
        items: [],
        page: 1,
        pageSize: 50,
        total: 0,
      })),
      generate: vi.fn(async () => ({ created: 3, skipped: 0 })),
      finalize,
    },
  } as unknown as NonNullable<typeof window.bcis>;
  render(<BillingView canGenerate={canGenerate} />);
  return { finalize };
}

const invoice = {
  id: 'invoice-1',
  invoiceNumber: 'INV-1001',
  subscriberId: 'subscriber-1',
  subscriberName: 'Maria Santos',
  subscriberAccountNumber: 'SUB-0001',
  serviceAccountNumber: 'SRV-0001',
  planName: 'Internet 25',
  billingPeriodLabel: 'October 2026',
  dueDate: '2026-10-15',
  totalCentavos: 50000,
  adjustmentCentavos: 0,
  balanceCentavos: 50000,
  status: 'UNPAID' as const,
  invoiceDate: '2026-10-01',
  finalizedAt: '2026-10-01T00:00:00Z',
  voidedAt: null,
  voidReason: null,
  items: [
    {
      id: 'item-1',
      type: 'SUBSCRIPTION',
      description: 'Internet',
      amountCentavos: 50000,
    },
  ],
  adjustments: [],
};

function renderInvoiceActions() {
  const addAdjustment = vi.fn(async () => undefined);
  const voidInvoice = vi.fn(async () => undefined);
  const getInvoice = vi.fn(async () => invoice);
  window.bcis = {
    billing: {
      listCycles: vi.fn(async () => [cycle]),
      listInvoices: vi.fn(async () => ({
        items: [invoice],
        page: 1,
        pageSize: 50,
        total: 1,
      })),
      getInvoice,
      addAdjustment,
      voidInvoice,
    },
  } as unknown as NonNullable<typeof window.bcis>;
  render(<BillingView canGenerate />);
  return { addAdjustment, voidInvoice };
}

afterEach(() => {
  cleanup();
  delete window.bcis;
});

describe('BillingView', () => {
  it('shows the draft review context before the explicit finalize action', async () => {
    renderBilling();
    expect(
      await screen.findByText('3 draft invoices ready for review'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Review and finalize' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Finalize cycle' }),
    ).not.toBeInTheDocument();
  });

  it('requires confirmation and retains the draft when finalization fails', async () => {
    const user = userEvent.setup();
    const { finalize } = renderBilling();
    finalize.mockRejectedValueOnce(
      new Error('Cycle contains an ineligible invoice.'),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Review and finalize' }),
    );
    expect(
      screen.getByRole('dialog', { name: /Finalize billing cycle/ }),
    ).toBeVisible();
    expect(screen.getByRole('dialog')).toHaveTextContent('October 2026');
    expect(finalize).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Confirm finalization' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cycle contains an ineligible invoice.',
    );
    expect(
      screen.getByRole('dialog', { name: /Finalize billing cycle/ }),
    ).toBeVisible();
    expect(screen.getByText('3 draft invoices ready for review')).toBeVisible();
  });

  it('explains an empty draft and prevents finalization when no invoices were created', async () => {
    window.bcis = {
      billing: {
        listCycles: vi.fn(async () => [
          { ...cycle, invoiceCount: 0, totalCentavos: 0 },
        ]),
        listInvoices: vi.fn(async () => ({
          items: [],
          page: 1,
          pageSize: 50,
          total: 0,
        })),
        generate: vi.fn(),
        finalize: vi.fn(),
      },
    } as unknown as NonNullable<typeof window.bcis>;
    render(<BillingView canGenerate />);
    expect(
      await screen.findByText(
        'No eligible services produced invoices for this period.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Review and finalize' }),
    ).toBeDisabled();
  });

  it('hides cycle generation and finalization actions for read-only users', async () => {
    renderBilling(false);
    expect(
      await screen.findByText('3 draft invoices ready for review'),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Generate drafts' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Review and finalize' }),
    ).not.toBeInTheDocument();
  });

  it('opens an adjustment dialog from the invoice and keeps the ledger unchanged on cancel', async () => {
    const user = userEvent.setup();
    const { addAdjustment } = renderInvoiceActions();
    await user.click(await screen.findByRole('button', { name: 'INV-1001' }));
    await user.click(await screen.findByRole('button', { name: 'Adjustment' }));
    expect(
      await screen.findByRole('dialog', { name: 'Invoice adjustment' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(addAdjustment).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Adjustment' }));
    await user.type(screen.getByLabelText('Adjustment amount (PHP)'), '-15.50');
    await user.type(screen.getByLabelText('Reason'), 'Meter correction');
    await user.click(screen.getByRole('button', { name: 'Post adjustment' }));
    expect(addAdjustment).toHaveBeenCalledWith(
      'invoice-1',
      -1550,
      'Meter correction',
    );
  });

  it('requires an explicit reason before voiding an invoice', async () => {
    const user = userEvent.setup();
    const { voidInvoice } = renderInvoiceActions();
    await user.click(await screen.findByRole('button', { name: 'INV-1001' }));
    await user.click(await screen.findByRole('button', { name: 'Void' }));
    expect(
      await screen.findByRole('dialog', { name: 'Void invoice' }),
    ).toBeVisible();
    expect(voidInvoice).not.toHaveBeenCalled();
    await user.type(
      screen.getByLabelText('Reason for voiding'),
      'Duplicate charge',
    );
    await user.click(screen.getByRole('button', { name: 'Void invoice' }));
    expect(voidInvoice).toHaveBeenCalledWith('invoice-1', 'Duplicate charge');
  });
});
