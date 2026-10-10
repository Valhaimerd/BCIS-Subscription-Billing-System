import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import type { PlanDto } from '@bcis/contracts';
import { PlansView } from './MasterDataViews';

const plan: PlanDto = {
  id: 'plan-1',
  serviceTypeCode: 'INTERNET',
  code: 'NET-25',
  name: 'Internet 25',
  priceCentavos: 79900,
  speedMbps: 25,
  channelCount: null,
  description: null,
  isActive: true,
};

afterEach(() => {
  cleanup();
  delete window.bcis;
  vi.restoreAllMocks();
});

it('opens an app-owned price dialog from the plan action and updates centavos on submit', async () => {
  const user = userEvent.setup();
  const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);
  const listPlans = vi.fn(async () => [plan]);
  const updatePlan = vi.fn(async () => plan);
  window.bcis = {
    masterData: { listPlans, updatePlan },
  } as unknown as NonNullable<typeof window.bcis>;
  render(<PlansView canManage />);

  await user.click(await screen.findByRole('button', { name: 'Change price' }));

  const dialog = await screen.findByRole('dialog', {
    name: 'Change plan price',
  });
  expect(dialog).toBeVisible();
  expect(prompt).not.toHaveBeenCalled();
  expect(screen.getByLabelText('New monthly price (PHP)')).toHaveValue(799);
  expect(updatePlan).not.toHaveBeenCalled();

  await user.clear(screen.getByLabelText('New monthly price (PHP)'));
  await user.type(screen.getByLabelText('New monthly price (PHP)'), '850.25');
  await user.type(
    screen.getByLabelText('Reason for price change'),
    'Approved annual rate update',
  );
  await user.click(screen.getByRole('button', { name: 'Save price' }));

  expect(updatePlan).toHaveBeenCalledWith('plan-1', {
    priceCentavos: 85025,
    reason: 'Approved annual rate update',
  });
  expect(await screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('filters plans by name, code, and active status', async () => {
  const user = userEvent.setup();
  const archivedPlan = {
    ...plan,
    id: 'plan-2',
    code: 'TV-PLUS',
    name: 'Cable Plus',
    serviceTypeCode: 'CABLE' as const,
    isActive: false,
  };
  window.bcis = {
    masterData: { listPlans: vi.fn(async () => [plan, archivedPlan]) },
  } as unknown as NonNullable<typeof window.bcis>;
  render(<PlansView canManage={false} />);

  expect(
    screen.queryByRole('button', { name: 'Add service plan' }),
  ).not.toBeInTheDocument();
  const table = screen.getByRole('table');
  expect(await within(table).findByText('Internet 25')).toBeVisible();
  expect(within(table).getByText('Cable Plus')).toBeVisible();
  await user.type(
    screen.getByRole('searchbox', { name: 'Search service plans' }),
    'cable',
  );
  await user.selectOptions(screen.getByLabelText('Plan status'), 'inactive');

  expect(within(table).getByText('Cable Plus')).toBeVisible();
  expect(within(table).queryByText('Internet 25')).not.toBeInTheDocument();
  expect(screen.getByText(/1 of 2 plans/)).toBeVisible();
});

it('shows only attributes required for the selected plan type', async () => {
  const user = userEvent.setup();
  window.bcis = {
    masterData: { listPlans: vi.fn(async () => []) },
  } as unknown as NonNullable<typeof window.bcis>;
  render(<PlansView canManage />);

  await user.click(screen.getByRole('button', { name: 'Add service plan' }));
  await user.selectOptions(screen.getByLabelText('Service type'), 'CABLE');

  expect(screen.queryByLabelText('Speed (Mbps)')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Channels')).toBeVisible();
});

it('creates plans using integer centavos and shows the created plan', async () => {
  const user = userEvent.setup();
  const createdPlan = {
    ...plan,
    code: 'NET-40',
    name: 'Internet 40',
    priceCentavos: 120050,
  };
  const listPlans = vi
    .fn()
    .mockResolvedValueOnce([])
    .mockResolvedValue([createdPlan]);
  const createPlan = vi.fn(async () => createdPlan);
  window.bcis = {
    masterData: { listPlans, createPlan },
  } as unknown as NonNullable<typeof window.bcis>;
  render(<PlansView canManage />);

  await user.click(screen.getByRole('button', { name: 'Add service plan' }));
  await user.type(screen.getByLabelText('Code'), 'NET-40');
  await user.type(screen.getByLabelText('Name'), 'Internet 40');
  await user.type(screen.getByLabelText('Monthly price (PHP)'), '1200.50');
  await user.clear(screen.getByLabelText('Speed (Mbps)'));
  await user.type(screen.getByLabelText('Speed (Mbps)'), '40');
  await user.click(screen.getByRole('button', { name: 'Create plan' }));

  expect(createPlan).toHaveBeenCalledWith({
    serviceTypeCode: 'INTERNET',
    code: 'NET-40',
    name: 'Internet 40',
    priceCentavos: 120050,
    speedMbps: 40,
    channelCount: null,
  });
  expect(await screen.findByText('Internet 40')).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('Service plan created.');
});

it('offers a retry when the plan list cannot load', async () => {
  const user = userEvent.setup();
  const listPlans = vi
    .fn()
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValueOnce([plan]);
  window.bcis = {
    masterData: { listPlans },
  } as unknown as NonNullable<typeof window.bcis>;
  render(<PlansView canManage={false} />);

  expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
  await user.click(screen.getByRole('button', { name: 'Retry loading plans' }));
  expect(await screen.findByText('Internet 25')).toBeVisible();
  expect(listPlans).toHaveBeenCalledTimes(2);
});
