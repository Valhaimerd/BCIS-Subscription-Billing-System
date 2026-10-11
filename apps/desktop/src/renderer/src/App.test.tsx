import '@testing-library/jest-dom/vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SubscriberProfileDto } from '@bcis/contracts';
import type { DesktopSession } from '../../shared/desktop-api';
import { App } from './App';

const ownerSession: DesktopSession = {
  expiresAt: '2026-10-02T00:00:00.000Z',
  locked: false,
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    username: 'owner',
    fullName: 'Development Owner',
    roles: ['OWNER'],
    permissions: [
      'subscriber.view',
      'payment.view',
      'report.view',
      'user.manage',
      'backup.create',
      'backup.restore',
      'settings.manage',
    ],
    mustChangePassword: true,
  },
};

afterEach(() => {
  cleanup();
  delete window.bcis;
  localStorage.clear();
});

function renderApp(current: DesktopSession | null = ownerSession) {
  window.bcis = {
    platform: 'win32',
    version: 'test',
    auth: {
      current: vi.fn(async () => current),
      login: vi.fn(async () => ownerSession),
      logout: vi.fn(async () => undefined),
      lock: vi.fn(async () => ({ ...ownerSession, locked: true })),
      unlock: vi.fn(async () => ownerSession),
    },
    masterData: {
      references: vi.fn(async () => ({
        serviceTypes: [],
        collectionAreas: [],
        collectors: [],
        plans: [],
      })),
      listPlans: vi.fn(async () => []),
      createPlan: vi.fn(),
      updatePlan: vi.fn(),
      listSubscribers: vi.fn(async () => ({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      })),
      getSubscriber: vi.fn(),
      activity: vi.fn(async () => ({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      })),
      createSubscriber: vi.fn(),
      changeSubscriberStatus: vi.fn(),
      createServiceAccount: vi.fn(),
    },
    billing: {
      listCycles: vi.fn(async () => []),
      eligibility: vi.fn(async () => ({
        periodYear: 2026,
        periodMonth: 10,
        eligibleServices: 0,
        existingInvoices: 0,
        remainingServices: 0,
        estimatedNewCentavos: 0,
        inactiveServices: 0,
        futureStartServices: 0,
        cycleStatus: 'NOT_STARTED' as const,
      })),
      generate: vi.fn(),
      finalize: vi.fn(),
      listInvoices: vi.fn(async () => ({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      })),
      getInvoice: vi.fn(),
      addAdjustment: vi.fn(),
      voidInvoice: vi.fn(),
      ledger: vi.fn(async () => []),
    },
    payments: {
      get: vi.fn(),
      preview: vi.fn(),
      list: vi.fn(async () => ({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      })),
      create: vi.fn(),
      submitGcash: vi.fn(),
      decideGcash: vi.fn(),
      reverse: vi.fn(),
      proof: vi.fn(),
    },
    collections: {
      preview: vi.fn(),
      list: vi.fn(async () => ({ items: [], page: 1, pageSize: 50, total: 0 })),
      get: vi.fn(),
      create: vi.fn(),
      start: vi.fn(),
      submit: vi.fn(),
      remit: vi.fn(),
      reconcile: vi.fn(),
      close: vi.fn(),
    },
    receivables: {
      summary: vi.fn(async () => ({
        asOf: '2026-10-31',
        currentCentavos: 10_000,
        overdueCentavos: 20_000,
        totalCentavos: 30_000,
        overdueSubscribers: 2,
        followUpAccounts: 1,
        suspensionCandidates: 1,
        buckets: {
          CURRENT: 10_000,
          '1_30': 20_000,
          '31_60': 0,
          '61_90': 0,
          '90_PLUS': 0,
        },
      })),
      list: vi.fn(async () => ({ items: [], page: 1, pageSize: 20, total: 0 })),
      settings: vi.fn(async () => ({
        gracePeriodDays: 7,
        suspensionThresholdDays: 60,
        reconnectionFeeCentavos: 0,
      })),
      updateSettings: vi.fn(),
      history: vi.fn(),
      suspend: vi.fn(),
      requestReconnection: vi.fn(),
      completeReconnection: vi.fn(),
    },
    reports: {
      dashboard: vi.fn(async () => ({
        asOf: '2026-10-31',
        from: '2026-08-01',
        to: '2026-10-31',
        currentReceivableCentavos: 10_000,
        overdueReceivableCentavos: 20_000,
        overdueSubscribers: 2,
        followUpAccounts: 1,
        billedCentavos: 50_000,
        collectedCentavos: 40_000,
        monthlyTrend: [],
        paymentMethods: [
          { method: 'CASH' as const, count: 2, amountCentavos: 40_000 },
        ],
        aging: {
          CURRENT: 10_000,
          '1_30': 20_000,
          '31_60': 0,
          '61_90': 0,
          '90_PLUS': 0,
        },
        collectors: [],
        alerts: [{ label: 'Accounts for follow-up', count: 1 }],
        recentPayments: [],
      })),
      preview: vi.fn(async () => ({
        kind: 'COLLECTIONS' as const,
        title: 'Monthly Collection Report',
        generatedAt: '2026-10-31T12:00:00.000Z',
        filters: { from: '2026-08-01', to: '2026-10-31' },
        columns: [
          { key: 'period', label: 'Period', type: 'text' as const },
          {
            key: 'amountCentavos',
            label: 'Collected',
            type: 'money' as const,
          },
        ],
        rows: [{ period: '2026-10', amountCentavos: 40_000 }],
        totals: { amountCentavos: 40_000 },
        page: 1,
        pageSize: 20,
        total: 1,
      })),
      export: vi.fn(async () => ({
        saved: true,
        filename: 'monthly-collection-report-2026-10-31.pdf',
      })),
    },
    operations: {
      readiness: vi.fn(async () => ({
        databaseReady: true,
        attachmentStorageReady: true,
        backupStorageReady: true,
        postgresToolsReady: true,
        restoring: false,
      })),
      settings: vi.fn(async () => ({
        backupRetentionCount: 10,
        updatedAt: '2026-10-07T00:00:00.000Z',
      })),
      updateSettings: vi.fn(),
      listBackups: vi.fn(async () => ({
        items: [],
        page: 1,
        pageSize: 10,
        total: 0,
      })),
      createBackup: vi.fn(),
      restoreBackup: vi.fn(),
    },
  };
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  );
}

describe('authenticated desktop shell', () => {
  it('signs in through the narrow desktop bridge', async () => {
    const user = userEvent.setup();
    renderApp(null);
    expect(
      await screen.findByRole('heading', { name: 'Sign in to BCIS' }),
    ).toBeVisible();
    await user.type(screen.getByLabelText('Username'), 'owner');
    await user.type(screen.getByLabelText('Password'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeVisible();
    expect(window.bcis?.auth.login).toHaveBeenCalledWith({
      username: 'owner',
      password: 'correct-password',
    });
  });

  it('shows only navigation permitted for the signed-in role', async () => {
    renderApp({
      ...ownerSession,
      user: {
        ...ownerSession.user,
        roles: ['CASHIER'],
        permissions: ['subscriber.view', 'payment.view', 'payment.create'],
      },
    });
    expect(
      await screen.findByRole('button', { name: 'Payments' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Administration' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reports' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Backup & recovery' }),
    ).not.toBeInTheDocument();
    expect(window.bcis?.reports.dashboard).not.toHaveBeenCalled();
  });

  it('keeps page context truthful and selects Today without inert controls', async () => {
    const { container } = renderApp();
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeVisible();
    expect(container.querySelectorAll('main h1')).toHaveLength(1);
    expect(container.querySelector('.topbar-context')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Your permitted billing and collection work begins here.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.getByRole('searchbox', { name: 'Search subscribers' }),
    ).toBeVisible();
    expect(screen.queryByText('October 2026')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Administration' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Module placeholder')).not.toBeInTheDocument();
  });

  it('persists the collapsed rail while keeping the active destination highlighted', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole('heading', { name: 'Today' });
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(
      screen.getByRole('button', { name: 'Expand sidebar' }),
    ).toBeVisible();
    expect(localStorage.getItem('bcis.sidebar.collapsed')).toBe('true');

    const subscribers = screen.getByRole('button', { name: 'Subscribers' });
    await user.click(subscribers);
    expect(
      await screen.findByRole('heading', { name: 'Subscribers' }),
    ).toBeVisible();
    expect(subscribers).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getByRole('button', { name: 'Expand sidebar' }),
    ).toBeVisible();
    expect(localStorage.getItem('bcis.sidebar.collapsed')).toBe('true');
  });

  it('restores the collapsed preference when the authenticated shell is created again', async () => {
    localStorage.setItem('bcis.sidebar.collapsed', 'true');
    renderApp();
    await screen.findByRole('heading', { name: 'Today' });
    expect(
      screen.getByRole('button', { name: 'Expand sidebar' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('keeps permitted destinations visible without nested group toggles', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole('heading', { name: 'Today' });
    expect(screen.getByText('Money')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Payments' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Payments' }));
    expect(
      await screen.findByRole('heading', { name: 'Payments' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Payments' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('closes the compact navigation with Escape and restores focus to its opener', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole('heading', { name: 'Today' });
    const opener = screen.getByRole('button', { name: 'Open navigation menu' });
    await user.click(opener);
    const close = screen.getByRole('button', {
      name: /^Close navigation$/,
    });
    expect(close).toHaveFocus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(
      screen.getByRole('button', { name: 'Backup & recovery' }),
    ).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(close).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('button', { name: /^Close navigation$/ }),
    ).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('opens a profile selected from the permission-aware top-bar search', async () => {
    const user = userEvent.setup();
    renderApp();
    const profile: SubscriberProfileDto = {
      id: '00000000-0000-4000-8000-000000000002',
      accountNumber: 'SUB-0002',
      fullName: 'Maria Santos',
      status: 'ACTIVE',
      primaryContact: '09170000002',
      primaryAddress: '2 Mabini Street',
      serviceCount: 0,
      notes: null,
      collectionArea: null,
      assignedCollector: null,
      addresses: [],
      contacts: [],
      serviceAccounts: [],
      events: [],
    };
    vi.mocked(window.bcis!.masterData.listSubscribers).mockResolvedValue({
      items: [profile],
      page: 1,
      pageSize: 8,
      total: 1,
    });
    vi.mocked(window.bcis!.masterData.getSubscriber).mockResolvedValue(profile);
    await user.type(
      await screen.findByRole('searchbox', { name: 'Search subscribers' }),
      'Maria',
    );
    await user.click(
      await screen.findByRole('option', { name: /Maria Santos/ }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Maria Santos' }),
    ).toBeVisible();
    expect(window.bcis?.masterData.getSubscriber).toHaveBeenCalledWith(
      profile.id,
    );
    expect(window.bcis?.masterData.activity).toHaveBeenCalledWith(profile.id, {
      page: 1,
      pageSize: 20,
    });
  });

  it('keeps subscriber identity and service context visible and supports arrow-key tabs', async () => {
    const user = userEvent.setup();
    renderApp({
      ...ownerSession,
      user: {
        ...ownerSession.user,
        permissions: [
          'subscriber.view',
          'billing.view',
          'payment.view',
          'receivable.view',
        ],
      },
    });
    const profile: SubscriberProfileDto = {
      id: '00000000-0000-4000-8000-000000000012',
      accountNumber: 'SUB-0012',
      fullName: 'Ana Cruz',
      status: 'ACTIVE',
      primaryContact: '09170000012',
      primaryAddress: '12 Mabini Street',
      serviceCount: 2,
      notes: null,
      collectionArea: null,
      assignedCollector: null,
      addresses: [],
      contacts: [],
      serviceAccounts: [
        {
          id: '00000000-0000-4000-8000-000000000022',
          accountNumber: 'SVC-0012',
          planId: '00000000-0000-4000-8000-000000000032',
          planName: 'Internet 25',
          serviceTypeCode: 'INTERNET',
          currentRateCentavos: 79_900,
          billingDay: 1,
          dueDay: 15,
          billingStartDate: '2026-01-01',
          status: 'ACTIVE',
          activationDate: '2026-01-01T00:00:00.000Z',
        },
        {
          id: '00000000-0000-4000-8000-000000000023',
          accountNumber: 'SVC-0012-2',
          planId: '00000000-0000-4000-8000-000000000033',
          planName: 'Cable Basic',
          serviceTypeCode: 'CABLE',
          currentRateCentavos: 55_000,
          billingDay: 1,
          dueDay: 15,
          billingStartDate: '2026-01-01',
          status: 'SUSPENDED',
          activationDate: '2026-01-01T00:00:00.000Z',
        },
      ],
      events: [],
    };
    vi.mocked(window.bcis!.masterData.listSubscribers).mockResolvedValue({
      items: [profile],
      page: 1,
      pageSize: 8,
      total: 1,
    });
    vi.mocked(window.bcis!.masterData.getSubscriber).mockResolvedValue(profile);
    await user.type(
      await screen.findByRole('searchbox', { name: 'Search subscribers' }),
      'Ana',
    );
    await user.click(await screen.findByRole('option', { name: /Ana Cruz/ }));

    expect(
      screen.getByRole('group', { name: 'Service overview' }),
    ).toHaveTextContent('1 active');
    expect(
      screen.getByRole('group', { name: 'Service overview' }),
    ).toHaveTextContent('1 not active');
    expect(
      screen.getByRole('group', { name: 'Service overview' }),
    ).toHaveTextContent('2 total services');
    expect(
      await screen.findByRole('group', { name: 'Subscriber balance context' }),
    ).toBeVisible();
    const overviewTab = screen.getByRole('tab', { name: 'Overview' });
    overviewTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /^Services/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByText('SVC-0012')).toBeVisible();
    const servicesPanel = screen.getByRole('tabpanel');
    expect(within(servicesPanel).getByText('ACTIVE')).toHaveClass(
      'record-status',
      'active',
    );
    expect(within(servicesPanel).getByText('SUSPENDED')).toHaveClass(
      'record-status',
    );
  });

  it('restores the selected subscriber after navigating to another workspace and back', async () => {
    const user = userEvent.setup();
    renderApp({
      ...ownerSession,
      user: {
        ...ownerSession.user,
        permissions: ['subscriber.view', 'payment.view'],
      },
    });
    const profile: SubscriberProfileDto = {
      id: '00000000-0000-4000-8000-000000000013',
      accountNumber: 'SUB-0013',
      fullName: 'Liza Garcia',
      status: 'ACTIVE',
      primaryContact: '09170000013',
      primaryAddress: '13 Rizal Avenue',
      serviceCount: 0,
      notes: null,
      collectionArea: null,
      assignedCollector: null,
      addresses: [],
      contacts: [],
      serviceAccounts: [],
      events: [],
    };
    vi.mocked(window.bcis!.masterData.listSubscribers).mockResolvedValue({
      items: [profile],
      page: 1,
      pageSize: 8,
      total: 1,
    });
    vi.mocked(window.bcis!.masterData.getSubscriber).mockResolvedValue(profile);
    await user.type(
      await screen.findByRole('searchbox', { name: 'Search subscribers' }),
      'Liza',
    );
    await user.click(
      await screen.findByRole('option', { name: /Liza Garcia/ }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Liza Garcia' }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Payments' }));
    expect(
      await screen.findByRole('heading', { name: 'Payments' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Subscribers' }));

    expect(
      await screen.findByRole('heading', { name: 'Liza Garcia' }),
    ).toBeVisible();
    expect(window.bcis?.masterData.getSubscriber).toHaveBeenCalledTimes(2);
  });

  it('locks and unlocks the active session', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(
      await screen.findByRole('button', { name: 'Lock session' }),
    );
    expect(await screen.findByText('Session locked')).toBeVisible();
    await user.type(screen.getByLabelText('Password'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeVisible();
  });

  it('opens the real receivables workspace for an authorized user', async () => {
    const user = userEvent.setup();
    renderApp({
      ...ownerSession,
      user: {
        ...ownerSession.user,
        permissions: ['receivable.view', 'receivable.manage'],
      },
    });
    await user.click(
      await screen.findByRole('button', { name: 'Receivables' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Accounts receivable' }),
    ).toBeVisible();
    expect(window.bcis?.receivables.summary).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /1–30/ }));
    await waitFor(() =>
      expect(window.bcis?.receivables.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ agingBucket: '1_30' }),
      ),
    );
  });

  it('loads the management dashboard and previews a report', async () => {
    const user = userEvent.setup();
    renderApp({
      ...ownerSession,
      user: {
        ...ownerSession.user,
        permissions: ['report.view', 'report.export', 'subscriber.view'],
      },
    });
    expect(await screen.findByText('Billing versus collection')).toBeVisible();
    expect(window.bcis?.reports.dashboard).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Reports' }));
    await user.click(
      await screen.findByRole('button', { name: 'Preview report' }),
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Monthly Collection Report',
      }),
    ).toBeVisible();
    expect(window.bcis?.reports.preview).toHaveBeenCalledWith(
      'COLLECTIONS',
      expect.objectContaining({ granularity: 'MONTHLY', page: 1 }),
    );
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeVisible();
  });

  it('loads owner-only backup readiness without exposing it to Cashier', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(
      await screen.findByRole('button', { name: 'Backup & recovery' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Backup and recovery' }),
    ).toBeVisible();
    expect(window.bcis?.operations.readiness).toHaveBeenCalled();
  });
});
