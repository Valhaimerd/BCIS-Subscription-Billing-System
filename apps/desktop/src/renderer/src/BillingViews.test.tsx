import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
      eligibility: vi.fn(async () => ({
        periodYear: 2026,
        periodMonth: 10,
        eligibleServices: 3,
        existingInvoices: 3,
        remainingServices: 0,
        estimatedNewCentavos: 0,
        inactiveServices: 1,
        futureStartServices: 0,
        cycleStatus: 'DRAFT' as const,
      })),
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
  allocations: [
    {
      id: 'allocation-1',
      amountCentavos: 10000,
      paymentDate: '2026-10-02T00:00:00Z',
      receiptNumber: 'RCPT-001',
      status: 'POSTED' as const,
    },
  ],
};

function renderInvoiceActions(onOpenReceipt?: (receiptNumber: string) => void) {
  const addAdjustment = vi.fn(async () => undefined);
  const voidInvoice = vi.fn(async () => undefined);
  const getInvoice = vi.fn(async () => invoice);
  window.bcis = {
    billing: {
      listCycles: vi.fn(async () => [cycle]),
      eligibility: vi.fn(async () => ({
        periodYear: 2026,
        periodMonth: 10,
        eligibleServices: 3,
        existingInvoices: 3,
        remainingServices: 0,
        estimatedNewCentavos: 0,
        inactiveServices: 0,
        futureStartServices: 0,
        cycleStatus: 'DRAFT' as const,
      })),
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
  render(<BillingView canGenerate onOpenReceipt={onOpenReceipt} />);
  return { addAdjustment, voidInvoice };
}

afterEach(() => {
  cleanup();
  delete window.bcis;
});

describe('BillingView', () => {
  it('keeps the register scoped to the selected run and pages through its invoices', async () => {
    const user = userEvent.setup();
    const listInvoices = vi.fn(async ({ page }: { page: number }) => ({
      items:
        page === 1
          ? [invoice]
          : [{ ...invoice, id: 'invoice-2', invoiceNumber: 'INV-1002' }],
      page,
      pageSize: 50,
      total: 65,
    }));
    window.bcis = {
      billing: {
        listCycles: vi.fn(async () => [cycle]),
        eligibility: vi.fn(async () => ({
          periodYear: 2026,
          periodMonth: 10,
          eligibleServices: 3,
          existingInvoices: 3,
          remainingServices: 0,
          estimatedNewCentavos: 0,
          inactiveServices: 0,
          futureStartServices: 0,
          cycleStatus: 'DRAFT' as const,
        })),
        listInvoices,
      },
    } as unknown as NonNullable<typeof window.bcis>;
    render(<BillingView canGenerate />);
    await user.click(
      await screen.findByRole('button', { name: 'Open register' }),
    );
    expect(await screen.findByText('1–50 of 65 invoices')).toBeVisible();
    expect(listInvoices).toHaveBeenCalledWith(
      expect.objectContaining({ billingCycleId: 'cycle-draft', page: 1 }),
    );
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('51–65 of 65 invoices')).toBeVisible();
    expect(listInvoices).toHaveBeenCalledWith(
      expect.objectContaining({ billingCycleId: 'cycle-draft', page: 2 }),
    );
  });

  it('reviews eligibility before generating and prevents a repeat click while pending', async () => {
    const user = userEvent.setup();
    let resolveGenerate!: (value: { created: number; skipped: number }) => void;
    const generate = vi.fn(
      () =>
        new Promise<{ created: number; skipped: number }>((resolve) => {
          resolveGenerate = resolve;
        }),
    );
    window.bcis = {
      billing: {
        listCycles: vi.fn(async () => []),
        listInvoices: vi.fn(async () => ({
          items: [],
          page: 1,
          pageSize: 50,
          total: 0,
        })),
        eligibility: vi.fn(async () => ({
          periodYear: 2026,
          periodMonth: 10,
          eligibleServices: 4,
          existingInvoices: 1,
          remainingServices: 3,
          estimatedNewCentavos: 450000,
          inactiveServices: 2,
          futureStartServices: 1,
          cycleStatus: 'NOT_STARTED' as const,
        })),
        generate,
      },
    } as unknown as NonNullable<typeof window.bcis>;
    render(<BillingView canGenerate />);
    await user.click(
      await screen.findByRole('button', { name: 'Prepare billing' }),
    );
    expect(await screen.findByText('New drafts expected')).toBeVisible();
    expect(screen.getByText(/2 inactive services/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Generate drafts' }));
    expect(screen.getByRole('button', { name: 'Generating…' })).toBeDisabled();
    expect(generate).toHaveBeenCalledTimes(1);
    resolveGenerate({ created: 2, skipped: 1 });
    expect(
      await screen.findByText('2 draft invoices created; 1 already existed.'),
    ).toBeVisible();
  });

  it('ignores an interrupted eligibility response after the month changes', async () => {
    let resolveOld!: (value: unknown) => void;
    const eligibility = vi.fn((year: number, month: number) =>
      month === 10
        ? new Promise((resolve) => {
            resolveOld = resolve;
          })
        : Promise.resolve({
            periodYear: year,
            periodMonth: month,
            eligibleServices: 2,
            existingInvoices: 0,
            remainingServices: 2,
            estimatedNewCentavos: 20000,
            inactiveServices: 0,
            futureStartServices: 0,
            cycleStatus: 'NOT_STARTED',
          }),
    );
    window.bcis = {
      billing: {
        listCycles: vi.fn(async () => []),
        eligibility,
      },
    } as unknown as NonNullable<typeof window.bcis>;
    render(<BillingView canGenerate />);
    fireEvent.change(screen.getByLabelText('Billing month'), {
      target: { value: '2026-11' },
    });
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Prepare billing' }));
    expect(await screen.findByText('New drafts expected')).toBeVisible();
    expect(
      screen.getAllByText('2', {
        selector: '.billing-eligibility-grid strong',
      }),
    ).toHaveLength(2);
    resolveOld({
      periodYear: 2026,
      periodMonth: 10,
      eligibleServices: 99,
      existingInvoices: 0,
      remainingServices: 99,
      estimatedNewCentavos: 0,
      inactiveServices: 0,
      futureStartServices: 0,
      cycleStatus: 'NOT_STARTED',
    });
    expect(screen.queryByText('99')).not.toBeInTheDocument();
  });

  it('shows the draft review context before the explicit finalize action', async () => {
    const user = userEvent.setup();
    renderBilling();
    await user.click(
      await screen.findByRole('button', { name: 'Review draft run' }),
    );
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
      await screen.findByRole('button', { name: 'Review draft run' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Review and finalize' }),
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
        eligibility: vi.fn(async () => ({
          periodYear: 2026,
          periodMonth: 10,
          eligibleServices: 0,
          existingInvoices: 0,
          remainingServices: 0,
          estimatedNewCentavos: 0,
          inactiveServices: 0,
          futureStartServices: 0,
          cycleStatus: 'DRAFT' as const,
        })),
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
    const user = userEvent.setup();
    render(<BillingView canGenerate />);
    await user.click(
      await screen.findByRole('button', { name: 'Review draft run' }),
    );
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
    expect(await screen.findByText('October 2026')).toBeVisible();
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
    await user.click(
      await screen.findByRole('button', { name: 'Open register' }),
    );
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
    await user.click(
      await screen.findByRole('button', { name: 'Open register' }),
    );
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

  it('opens a linked receipt from invoice detail when payment history is permitted', async () => {
    const user = userEvent.setup();
    const onOpenReceipt = vi.fn();
    renderInvoiceActions(onOpenReceipt);
    await user.click(
      await screen.findByRole('button', { name: 'Open register' }),
    );
    await user.click(await screen.findByRole('button', { name: 'INV-1001' }));
    await user.click(
      await screen.findByRole('button', { name: 'Open receipt' }),
    );
    expect(onOpenReceipt).toHaveBeenCalledWith('RCPT-001');
  });
});
