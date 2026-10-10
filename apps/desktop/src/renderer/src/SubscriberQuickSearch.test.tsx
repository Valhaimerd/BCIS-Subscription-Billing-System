import '@testing-library/jest-dom/vitest';

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SubscriberQuickSearch } from './SubscriberQuickSearch';

const subscriber = {
  id: 'subscriber-1',
  accountNumber: 'SUB-0001',
  fullName: 'Maria Santos',
  status: 'ACTIVE' as const,
  primaryAddress: '1 Mabini Street',
  primaryContact: '09170000001',
  serviceCount: 1,
};

function renderSearch() {
  const listSubscribers = vi.fn(async () => ({
    items: [subscriber],
    page: 1,
    pageSize: 8,
    total: 1,
  }));
  window.bcis = {
    masterData: { listSubscribers },
  } as unknown as NonNullable<typeof window.bcis>;
  const onSelect = vi.fn();
  render(<SubscriberQuickSearch canSearch onSelect={onSelect} />);
  return { listSubscribers, onSelect };
}

afterEach(() => {
  cleanup();
  delete window.bcis;
  vi.useRealTimers();
});

describe('SubscriberQuickSearch', () => {
  it('debounces subscriber search and opens the selected profile', async () => {
    const user = userEvent.setup();
    const { listSubscribers, onSelect } = renderSearch();
    await user.type(
      screen.getByRole('searchbox', { name: 'Search subscribers' }),
      'Maria',
    );
    expect(listSubscribers).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('option', { name: /Maria Santos/ }),
    ).toBeVisible();
    expect(listSubscribers).toHaveBeenCalledWith({
      q: 'Maria',
      page: 1,
      pageSize: 8,
    });
    await user.click(screen.getByRole('option', { name: /Maria Santos/ }));
    expect(onSelect).toHaveBeenCalledWith('subscriber-1');
  });

  it('supports arrow-key selection, Enter, and Escape', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderSearch();
    const input = screen.getByRole('searchbox', { name: 'Search subscribers' });
    await user.type(input, 'Maria');
    await screen.findByRole('option', { name: /Maria Santos/ });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('subscriber-1');

    await user.type(input, 'Maria');
    await screen.findByRole('option', { name: /Maria Santos/ });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('announces empty results and does not search before the minimum query', async () => {
    const listSubscribers = vi.fn(async () => ({
      items: [],
      page: 1,
      pageSize: 8,
      total: 0,
    }));
    window.bcis = { masterData: { listSubscribers } } as unknown as NonNullable<
      typeof window.bcis
    >;
    render(<SubscriberQuickSearch canSearch onSelect={vi.fn()} />);
    const input = screen.getByRole('searchbox', { name: 'Search subscribers' });
    await userEvent.setup().type(input, 'M');
    await waitFor(() => expect(listSubscribers).not.toHaveBeenCalled());
    await userEvent.setup().type(input, 'a');
    expect(await screen.findByText('No matching subscribers.')).toBeVisible();
  });
});
