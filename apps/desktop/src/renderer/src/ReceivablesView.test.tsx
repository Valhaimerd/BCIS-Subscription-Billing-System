import '@testing-library/jest-dom/vitest';

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  ReceivableDetailDto,
  ServiceControlHistoryDto,
} from '@bcis/contracts';
import { ReceivablesView } from './ReceivablesView';

function receivableSummary(asOf: string, currentCentavos = 0) {
  return {
    asOf,
    currentCentavos,
    overdueCentavos: 0,
    totalCentavos: currentCentavos,
    overdueSubscribers: 0,
    followUpAccounts: 0,
    suspensionCandidates: 0,
    buckets: { CURRENT: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_PLUS': 0 },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function setup(canManage = false) {
  const summary = vi.fn(async (asOf: string) => receivableSummary(asOf));
  const list = vi.fn(async () => ({
    items: [] as ReceivableDetailDto[],
    page: 1,
    pageSize: 20,
    total: 0,
  }));
  const history = vi.fn(
    async (serviceAccountId: string): Promise<ServiceControlHistoryDto> => ({
      serviceAccountId,
      serviceAccountNumber: 'SVC-0001',
      status: 'ACTIVE',
      suspensions: [],
      reconnections: [],
      events: [],
    }),
  );
  const suspend = vi.fn(async () => undefined);
  window.bcis = {
    receivables: {
      summary,
      list,
      history,
      suspend,
      requestReconnection: vi.fn(async () => undefined),
      completeReconnection: vi.fn(async () => undefined),
      settings: vi.fn(async () => ({
        gracePeriodDays: 5,
        suspensionThresholdDays: 60,
        reconnectionFeeCentavos: 0,
      })),
    },
    masterData: {
      references: vi.fn(async () => ({
        collectors: [],
        collectionAreas: [],
        plans: [],
        serviceTypes: [],
      })),
    },
  } as unknown as NonNullable<typeof window.bcis>;
  render(<ReceivablesView canManage={canManage} />);
  return { summary, list, history, suspend };
}

afterEach(() => {
  cleanup();
  delete window.bcis;
});

describe('ReceivablesView', () => {
  it('uses one selected as-of date for summary and follow-up rows', async () => {
    const user = userEvent.setup();
    const { summary, list } = setup();
    const date = screen.getByLabelText('Balance date');
    await waitFor(() => expect(summary).toHaveBeenCalled());
    const initialAsOf = summary.mock.calls[0]?.[0];
    await user.clear(date);
    await user.type(date, '2026-09-30');
    expect(
      screen.getByText(`RECEIVABLES SNAPSHOT · AS OF ${initialAsOf}`),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(summary).toHaveBeenLastCalledWith('2026-09-30'));
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ asOf: '2026-09-30', page: 1 }),
    );
    expect(
      screen.getByText('RECEIVABLES SNAPSHOT · AS OF 2026-09-30'),
    ).toBeInTheDocument();
  });

  it('shows decision metrics, states the queue order, and exposes aging selection', async () => {
    const user = userEvent.setup();
    const { list } = setup();
    expect(
      await screen.findByRole('heading', { name: 'Accounts receivable' }),
    ).toBeVisible();
    expect(screen.getByText('Overdue balance')).toBeVisible();
    expect(screen.getByText('Follow-up accounts')).toBeVisible();
    expect(screen.getByText('Suspension candidates')).toBeVisible();
    expect(screen.getByText('Total receivables')).toBeVisible();
    expect(
      screen.getByText('Sorted by eligibility, oldest due date, then arrears'),
    ).toBeVisible();
    const agingRange = screen.getByRole('button', { name: /1–30 days/ });
    expect(agingRange).toHaveAttribute('aria-pressed', 'false');
    await user.click(agingRange);
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ agingBucket: '1_30', page: 1 }),
      ),
    );
    expect(agingRange).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the displayed summary and rows paired to the latest as-of request', async () => {
    const user = userEvent.setup();
    const { summary } = setup();
    await waitFor(() => expect(summary).toHaveBeenCalledTimes(1));

    const stale = deferred<ReturnType<typeof receivableSummary>>();
    summary.mockImplementationOnce(() => stale.promise);
    const date = screen.getByLabelText('Balance date');
    await user.clear(date);
    await user.type(date, '2026-09-30');
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(summary).toHaveBeenLastCalledWith('2026-09-30'));

    summary.mockImplementationOnce(async () =>
      receivableSummary('2026-10-01', 123),
    );
    await user.clear(date);
    await user.type(date, '2026-10-01');
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(
      await screen.findByText('RECEIVABLES SNAPSHOT · AS OF 2026-10-01'),
    ).toBeVisible();
    expect(screen.getAllByText('₱1.23')).toHaveLength(2);

    await act(async () => {
      stale.resolve(receivableSummary('2026-09-30', 99_900));
      await stale.promise;
    });
    expect(
      screen.getByText('RECEIVABLES SNAPSHOT · AS OF 2026-10-01'),
    ).toBeVisible();
    expect(screen.getAllByText('₱1.23')).toHaveLength(2);
  });

  it('keeps management actions hidden for read-only roles and explains empty results', async () => {
    setup();
    expect(
      await screen.findByText('No accounts match these filters.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save policy' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Approve suspension' }),
    ).not.toBeInTheDocument();
  });

  it('opens account context and history from the keyboard-operable review action', async () => {
    const user = userEvent.setup();
    const { list, history } = setup();
    const account: ReceivableDetailDto = {
      serviceAccountId: '00000000-0000-4000-8000-000000000021',
      serviceAccountNumber: 'SVC-0001',
      serviceStatus: 'ACTIVE',
      subscriberId: '00000000-0000-4000-8000-000000000011',
      subscriberAccountNumber: 'SUB-0001',
      subscriberName: 'Maria Santos',
      planId: '00000000-0000-4000-8000-000000000031',
      planName: 'Internet 25',
      serviceTypeCode: 'INTERNET',
      collectionAreaId: null,
      collectionAreaName: null,
      collectorId: null,
      collectorName: null,
      monthsUnpaid: 3,
      oldestUnpaidInvoice: 'INV-0001',
      oldestDueDate: '2026-08-01',
      lastPaymentAt: null,
      currentCentavos: 0,
      totalArrearsCentavos: 25_000,
      totalOutstandingCentavos: 25_000,
      agingCentavos: {
        CURRENT: 0,
        '1_30': 0,
        '31_60': 0,
        '61_90': 25_000,
        '90_PLUS': 0,
      },
      oldestAgingBucket: '61_90',
      followUp: true,
      suspensionCandidate: true,
    };
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    list.mockResolvedValue({
      items: [account],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    const review = await screen.findByRole('button', {
      name: 'Review Maria Santos receivable details',
    });
    review.focus();
    await user.keyboard('{Enter}');
    expect(
      await screen.findByLabelText('Receivable service control detail'),
    ).toBeVisible();
    expect(screen.getByText('SUB-0001')).toBeVisible();
    expect(screen.getAllByText('INV-0001')).toHaveLength(2);
    expect(
      screen.getByRole('heading', { name: 'Service status timeline' }),
    ).toBeVisible();
    expect(history).toHaveBeenCalledWith(account.serviceAccountId);
    expect(
      screen.queryByRole('button', { name: 'Approve suspension' }),
    ).not.toBeInTheDocument();
  });

  it('lets an authorized manager approve an eligible suspension with a reason', async () => {
    const user = userEvent.setup();
    const { list, suspend } = setup(true);
    const account: ReceivableDetailDto = {
      serviceAccountId: '00000000-0000-4000-8000-000000000021',
      serviceAccountNumber: 'SVC-0001',
      serviceStatus: 'ACTIVE',
      subscriberId: '00000000-0000-4000-8000-000000000011',
      subscriberAccountNumber: 'SUB-0001',
      subscriberName: 'Maria Santos',
      planId: '00000000-0000-4000-8000-000000000031',
      planName: 'Internet 25',
      serviceTypeCode: 'INTERNET',
      collectionAreaId: null,
      collectionAreaName: null,
      collectorId: null,
      collectorName: null,
      monthsUnpaid: 3,
      oldestUnpaidInvoice: 'INV-0001',
      oldestDueDate: '2026-08-01',
      lastPaymentAt: null,
      currentCentavos: 0,
      totalArrearsCentavos: 25_000,
      totalOutstandingCentavos: 25_000,
      agingCentavos: {
        CURRENT: 0,
        '1_30': 0,
        '31_60': 0,
        '61_90': 25_000,
        '90_PLUS': 0,
      },
      oldestAgingBucket: '61_90',
      followUp: true,
      suspensionCandidate: true,
    };
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    list.mockResolvedValue({
      items: [account],
      page: 1,
      pageSize: 20,
      total: 1,
    });
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await user.click(
      await screen.findByRole('button', {
        name: 'Review Maria Santos receivable details',
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Approve suspension' }),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Approve suspension' }),
    );

    expect(suspend).toHaveBeenCalledWith(account.serviceAccountId, {
      effectiveDate: expect.any(String),
      reason: 'Account exceeded the suspension threshold.',
      notes: undefined,
    });
  });
});
