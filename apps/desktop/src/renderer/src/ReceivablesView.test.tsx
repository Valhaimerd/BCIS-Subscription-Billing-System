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

function setup(canManage = false, canManageSettings = false) {
  const summary = vi.fn(async (query: { asOf: string }) =>
    receivableSummary(query.asOf),
  );
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
  const updateSettings = vi.fn(async () => ({
    gracePeriodDays: 5,
    suspensionThresholdDays: 60,
    reconnectionFeeCentavos: 0,
  }));
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
      updateSettings,
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
  render(
    <ReceivablesView
      canManage={canManage}
      canManageSettings={canManageSettings}
    />,
  );
  return { summary, list, history, suspend, updateSettings };
}

afterEach(() => {
  cleanup();
  delete window.bcis;
});

describe('ReceivablesView', () => {
  it('keeps delinquency policy editing in owner receivables settings', async () => {
    const user = userEvent.setup();
    const { updateSettings } = setup(true, true);

    await user.click(await screen.findByText('Adjust policy'));
    await user.clear(screen.getByLabelText('Grace period (days)'));
    await user.type(screen.getByLabelText('Grace period (days)'), '10');
    await user.click(screen.getByRole('button', { name: 'Save policy' }));

    expect(updateSettings).toHaveBeenCalledWith({
      gracePeriodDays: 10,
      suspensionThresholdDays: 60,
      reconnectionFeeCentavos: 0,
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Delinquency policy saved and audited.',
    );
  });

  it('hides delinquency policy editing without settings permission', async () => {
    setup(true, false);

    expect(
      await screen.findByRole('heading', { name: 'Follow-up desk' }),
    ).toBeVisible();
    expect(screen.queryByText('Adjust policy')).not.toBeInTheDocument();
  });

  it('uses one selected as-of date for summary and follow-up rows', async () => {
    const user = userEvent.setup();
    const { summary, list } = setup();
    const date = screen.getByLabelText('Balance date');
    await waitFor(() => expect(summary).toHaveBeenCalled());
    const initialAsOf = summary.mock.calls[0]?.[0].asOf;
    await user.clear(date);
    await user.type(date, '2026-09-30');
    expect(screen.getByText(`Receivables · ${initialAsOf}`)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Apply date' }));
    await waitFor(() =>
      expect(summary).toHaveBeenLastCalledWith(
        expect.objectContaining({ asOf: '2026-09-30' }),
      ),
    );
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ asOf: '2026-09-30', page: 1 }),
    );
    expect(screen.getByText('Receivables · 2026-09-30')).toBeInTheDocument();
  });

  it('shows decision metrics, states the queue order, and exposes aging selection', async () => {
    const user = userEvent.setup();
    const { list } = setup();
    expect(
      await screen.findByRole('heading', { name: 'Follow-up desk' }),
    ).toBeVisible();
    expect(screen.getByText('Overdue balance')).toBeVisible();
    expect(screen.getByText('Follow-up cases')).toBeVisible();
    expect(screen.getByText('Eligible for suspension')).toBeVisible();
    expect(screen.getByText('Total outstanding')).toBeVisible();
    expect(
      screen.getByRole('tablist', { name: 'Case priority' }),
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

  it('keeps the latest queue and snapshot when an older request finishes later', async () => {
    const user = userEvent.setup();
    const { summary, list } = setup();
    await waitFor(() => expect(summary).toHaveBeenCalledTimes(1));
    const asOf = summary.mock.calls[0]![0].asOf;

    const stale = deferred<ReturnType<typeof receivableSummary>>();
    summary.mockImplementationOnce(() => stale.promise);
    await user.click(screen.getByRole('tab', { name: /Due soon/ }));
    await waitFor(() => expect(summary).toHaveBeenCalledTimes(2));

    summary.mockImplementationOnce(async () => receivableSummary(asOf, 123));
    await user.click(screen.getByRole('tab', { name: /All cases/ }));
    expect(await screen.findByText(`Receivables · ${asOf}`)).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /All cases/ })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ queue: 'ALL' }),
    );
    expect(
      screen.getByRole('region', { name: 'Receivables snapshot' }),
    ).toHaveTextContent('₱1.23');

    await act(async () => {
      stale.resolve(receivableSummary(asOf, 99_900));
      await stale.promise;
    });
    expect(screen.getByRole('tab', { name: /All cases/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByRole('region', { name: 'Receivables snapshot' }),
    ).toHaveTextContent('₱1.23');
    expect(screen.queryByText('₱999.00')).not.toBeInTheDocument();
  });

  it('keeps management actions hidden for read-only roles and explains empty results', async () => {
    setup();
    expect(
      await screen.findByText('No cases in this view'),
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
    await user.click(screen.getByRole('button', { name: 'Apply date' }));
    const review = await screen.findByRole('button', {
      name: /Review case/,
    });
    review.focus();
    await user.keyboard('{Enter}');
    expect(
      await screen.findByRole('dialog', { name: 'Receivable case' }),
    ).toBeVisible();
    expect(screen.getByText('SUB-0001')).toBeVisible();
    expect(screen.getByText('INV-0001')).toBeVisible();
    expect(screen.getByText('Service history · 0 events')).toBeVisible();
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
    await user.click(screen.getByRole('button', { name: 'Apply date' }));
    await user.click(
      await screen.findByRole('button', {
        name: /Review case/,
      }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Review suspension' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Confirm suspension' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Record suspension' }));

    expect(suspend).toHaveBeenCalledWith(account.serviceAccountId, {
      effectiveDate: expect.any(String),
      reason: 'Account exceeded the suspension threshold.',
      notes: undefined,
    });
  });
});
