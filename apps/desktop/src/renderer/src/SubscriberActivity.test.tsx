import '@testing-library/jest-dom/vitest';

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PermissionCode, SubscriberActivityDto } from '@bcis/contracts';
import { SubscriberActivity } from './SubscriberActivity';

const events: SubscriberActivityDto[] = [
  {
    id: 'payment:1',
    occurredAt: '2026-10-02T10:00:00.000Z',
    category: 'PAYMENT',
    label: 'Payment recorded',
    reference: 'RCT-0001',
    status: 'POSTED',
    amountCentavos: 150000,
    reason: null,
  },
  {
    id: 'subscriber:1',
    occurredAt: '2026-10-01T10:00:00.000Z',
    category: 'SUBSCRIBER',
    label: 'Subscriber status changed to ACTIVE',
    reference: null,
    status: 'ACTIVE',
    amountCentavos: null,
    reason: 'Subscriber registered.',
  },
];

function renderActivity() {
  const activity = vi.fn(async (_id: string, query: { page: number }) => ({
    items:
      query.page === 1
        ? events
        : [
            {
              id: 'billing:2',
              occurredAt: '2026-09-30T10:00:00.000Z',
              category: 'BILLING' as const,
              label: 'Invoice issued',
              reference: 'INV-0001',
              status: 'UNPAID',
              amountCentavos: 150000,
              reason: null,
            },
          ],
    page: query.page,
    pageSize: 20,
    total: 3,
  }));
  window.bcis = { masterData: { activity } } as unknown as NonNullable<
    typeof window.bcis
  >;
  const onNavigate = vi.fn();
  render(
    <SubscriberActivity
      subscriberId="subscriber-1"
      permissions={['subscriber.view', 'payment.view']}
      onNavigate={onNavigate}
    />,
  );
  return { activity, onNavigate };
}

afterEach(() => {
  cleanup();
  delete window.bcis;
});

describe('SubscriberActivity', () => {
  it('renders a mixed source timeline and respects optional fields', async () => {
    renderActivity();
    expect(await screen.findByText('Payment recorded')).toBeVisible();
    expect(
      screen.getByText('Subscriber status changed to ACTIVE'),
    ).toBeVisible();
    expect(screen.getByText('RCT-0001')).toBeVisible();
    expect(screen.getByText('₱1,500.00')).toBeVisible();
    expect(screen.getByText('Subscriber registered.')).toBeVisible();
  });

  it('exposes only links allowed by current view permissions', async () => {
    const { onNavigate } = renderActivity();
    await screen.findByText('Payment recorded');
    expect(screen.getByRole('button', { name: 'Open payments' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Open billing' }),
    ).not.toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Open payments' }));
    expect(onNavigate).toHaveBeenCalledWith('Payments');
  });

  it('appends the next page without replacing existing activity', async () => {
    const { activity } = renderActivity();
    await screen.findByText('Payment recorded');
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Load more activity' }));
    await waitFor(() =>
      expect(activity).toHaveBeenCalledWith('subscriber-1', {
        page: 2,
        pageSize: 20,
      }),
    );
    expect(screen.getByText('Payment recorded')).toBeVisible();
    expect(await screen.findByText('Invoice issued')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Load more activity' }),
    ).not.toBeInTheDocument();
  });

  it('shows a useful empty state for subscribers without account history', async () => {
    window.bcis = {
      masterData: {
        activity: vi.fn(async () => ({
          items: [],
          page: 1,
          pageSize: 20,
          total: 0,
        })),
      },
    } as unknown as NonNullable<typeof window.bcis>;
    render(
      <SubscriberActivity
        subscriberId="subscriber-empty"
        permissions={['subscriber.view']}
        onNavigate={vi.fn()}
      />,
    );
    expect(await screen.findByText('No account activity yet')).toBeVisible();
  });

  it('clears the previous subscriber timeline while the next profile loads', async () => {
    let resolveSecond!: (result: {
      items: SubscriberActivityDto[];
      page: number;
      pageSize: number;
      total: number;
    }) => void;
    const secondResult = new Promise<{
      items: SubscriberActivityDto[];
      page: number;
      pageSize: number;
      total: number;
    }>((resolve) => {
      resolveSecond = resolve;
    });
    const secondEvent: SubscriberActivityDto = {
      id: 'subscriber-b:1',
      occurredAt: '2026-10-03T10:00:00.000Z',
      category: 'SUBSCRIBER',
      label: 'Subscriber B activity',
      reference: null,
      status: 'ACTIVE',
      amountCentavos: null,
      reason: null,
    };
    const activity = vi.fn((subscriberId: string) =>
      subscriberId === 'subscriber-a'
        ? Promise.resolve({ items: events, page: 1, pageSize: 20, total: 2 })
        : secondResult,
    );
    window.bcis = { masterData: { activity } } as unknown as NonNullable<
      typeof window.bcis
    >;
    const onNavigate = vi.fn();
    const permissions: PermissionCode[] = ['subscriber.view'];
    const { rerender } = render(
      <SubscriberActivity
        subscriberId="subscriber-a"
        permissions={permissions}
        onNavigate={onNavigate}
      />,
    );
    expect(await screen.findByText('Payment recorded')).toBeVisible();

    rerender(
      <SubscriberActivity
        subscriberId="subscriber-b"
        permissions={permissions}
        onNavigate={onNavigate}
      />,
    );
    expect(screen.queryByText('Payment recorded')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading account activity',
    );
    await act(async () => {
      resolveSecond({
        items: [secondEvent],
        page: 1,
        pageSize: 20,
        total: 1,
      });
      await secondResult;
    });
    expect(await screen.findByText('Subscriber B activity')).toBeVisible();
    expect(screen.queryByText('Payment recorded')).not.toBeInTheDocument();
  });
});
