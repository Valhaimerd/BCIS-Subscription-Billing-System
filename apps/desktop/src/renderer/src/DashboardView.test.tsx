import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DashboardDto, PermissionCode } from '@bcis/contracts';
import { DashboardView } from './DashboardView';

const dashboard: DashboardDto = {
  asOf: '2026-10-10',
  from: '2026-10-01',
  to: '2026-10-10',
  currentReceivableCentavos: 125000,
  overdueReceivableCentavos: 25000,
  overdueSubscribers: 2,
  followUpAccounts: 1,
  billedCentavos: 85000,
  collectedCentavos: 62000,
  monthlyTrend: [
    {
      period: '2026-09',
      billedCentavos: 85000,
      collectedCentavos: 62000,
      differenceCentavos: 23000,
    },
  ],
  paymentMethods: [],
  aging: {
    CURRENT: 100000,
    '1_30': 25000,
    '31_60': 0,
    '61_90': 0,
    '90_PLUS': 0,
  },
  collectors: [],
  alerts: [],
  recentPayments: [],
};

function renderHome(
  permissions: PermissionCode[] = ['report.view'],
  summary: DashboardDto = dashboard,
) {
  const dashboardRequest = vi.fn(async () => summary);
  const listSubscribers = vi.fn(async () => ({
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
  }));
  const listPayments = vi.fn(async () => ({
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
  }));
  window.bcis = {
    reports: { dashboard: dashboardRequest },
    masterData: { listSubscribers },
    payments: { list: listPayments },
  } as unknown as NonNullable<typeof window.bcis>;
  const onNavigate = vi.fn();
  render(<DashboardView permissions={permissions} onNavigate={onNavigate} />);
  return { dashboardRequest, listSubscribers, listPayments, onNavigate };
}

afterEach(() => {
  cleanup();
  delete window.bcis;
});

describe('DashboardView', () => {
  it('loads an authorized summary for the current local calendar month', async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const { dashboardRequest } = renderHome();

    await waitFor(() => expect(dashboardRequest).toHaveBeenCalled());
    expect(dashboardRequest).toHaveBeenCalledWith({
      from: `${year}-${month}-01`,
      to: `${year}-${month}-${String(now.getDate()).padStart(2, '0')}`,
      asOf: `${year}-${month}-${String(now.getDate()).padStart(2, '0')}`,
    });
    expect(
      await screen.findByRole('heading', {
        name: 'Review the month at a glance',
      }),
    ).toBeVisible();
    await waitFor(() =>
      expect(document.querySelectorAll('.trend-point')).toHaveLength(2),
    );
  });

  it('updates the period when dates change and exposes trend values as text', async () => {
    const user = userEvent.setup();
    const { dashboardRequest } = renderHome();
    const from = await screen.findByLabelText('From date');
    const to = screen.getByLabelText('To date');
    await user.clear(from);
    await user.type(from, '2026-09-01');
    await user.clear(to);
    await user.type(to, '2026-09-30');

    await waitFor(() =>
      expect(dashboardRequest).toHaveBeenLastCalledWith({
        from: '2026-09-01',
        to: '2026-09-30',
        asOf: expect.any(String),
      }),
    );
    await user.click(screen.getByText('View monthly figures'));
    expect(
      screen.getByRole('table', {
        name: 'Monthly billing and collection values',
      }),
    ).toBeVisible();
    expect(screen.getByText('2026-09')).toBeVisible();
  });

  it('does not request or display management totals for Cashier', async () => {
    const { dashboardRequest, listSubscribers, listPayments } = renderHome([
      'subscriber.view',
      'payment.view',
    ]);

    expect(
      await screen.findByRole('heading', { name: 'Your work' }),
    ).toBeVisible();
    expect(dashboardRequest).not.toHaveBeenCalled();
    expect(listSubscribers).toHaveBeenCalled();
    expect(listPayments).toHaveBeenCalled();
    expect(screen.queryByText('Current receivable')).not.toBeInTheDocument();
  });

  it('provides technician shortcuts without management aggregates', async () => {
    const { dashboardRequest, listSubscribers, listPayments, onNavigate } =
      renderHome(['subscriber.view', 'service.view']);

    expect(
      await screen.findByRole('heading', { name: 'Your work' }),
    ).toBeVisible();
    expect(dashboardRequest).not.toHaveBeenCalled();
    expect(listSubscribers).toHaveBeenCalled();
    expect(listPayments).not.toHaveBeenCalled();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /Find subscribers/ }));
    expect(onNavigate).toHaveBeenCalledWith('Subscribers');
  });

  it('shows an honest empty state when the selected period has no activity', async () => {
    renderHome(['report.view'], { ...dashboard, monthlyTrend: [] });
    expect(
      await screen.findByText('No billing or payment activity in this period.'),
    ).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('puts the next action and work cards before the trend chart', async () => {
    renderHome(['report.view', 'receivable.view'], {
      ...dashboard,
      alerts: [{ label: 'Accounts for follow-up', count: 2 }],
    });
    await screen.findByRole('heading', { name: 'Billing versus collection' });
    const sections = [
      screen.getByRole('region', { name: 'Recommended next action' }),
      screen.getByRole('region', { name: 'Explore current work' }),
      screen.getByRole('heading', { name: 'Billing versus collection' }),
    ];
    expect(sections[0]!.compareDocumentPosition(sections[1]!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(sections[1]!.compareDocumentPosition(sections[2]!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('clears stale analytics and explains an incomplete date range', async () => {
    const user = userEvent.setup();
    const { dashboardRequest } = renderHome();
    await screen.findByRole('heading', { name: 'Billing versus collection' });
    await user.click(screen.getByText('View monthly figures'));
    await screen.findByRole('table', {
      name: 'Monthly billing and collection values',
    });
    const requestCount = dashboardRequest.mock.calls.length;
    await user.clear(screen.getByLabelText('To date'));

    expect(
      await screen.findByText('From date must be on or before the to date.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('table', {
        name: 'Monthly billing and collection values',
      }),
    ).not.toBeInTheDocument();
    expect(dashboardRequest).toHaveBeenCalledTimes(requestCount);
  });

  it('shows a report action without a forbidden receivables route', async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderHome(['report.view'], {
      ...dashboard,
      alerts: [{ label: 'Accounts for follow-up', count: 0 }],
    });
    expect(
      await screen.findByRole('heading', {
        name: 'Review the month at a glance',
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Review receivables' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open receivables' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Explore reports' }));
    expect(onNavigate).toHaveBeenCalledWith('Reports');
  });
});
