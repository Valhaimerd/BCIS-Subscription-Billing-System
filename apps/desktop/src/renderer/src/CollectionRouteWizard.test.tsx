import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { CollectionRouteWizard } from './CollectionRouteWizard';

afterEach(() => {
  cleanup();
  delete window.bcis;
});

it('reviews eligible accounts, removes one, and issues only the chosen account', async () => {
  const preview = vi.fn(async () => ({
    accountCount: 2,
    expectedReceivableCentavos: 30000,
    accounts: [
      {
        serviceAccountId: 'service-1',
        subscriberName: 'Maria Santos',
        subscriberAccountNumber: 'SUB-001',
        serviceAccountNumber: 'SVC-001',
        routeAddress: 'North',
        currentBillCentavos: 10000,
        arrearsCentavos: 0,
        totalDueCentavos: 10000,
      },
      {
        serviceAccountId: 'service-2',
        subscriberName: 'Jose Reyes',
        subscriberAccountNumber: 'SUB-002',
        serviceAccountNumber: 'SVC-002',
        routeAddress: 'North',
        currentBillCentavos: 20000,
        arrearsCentavos: 0,
        totalDueCentavos: 20000,
      },
    ],
  }));
  const create = vi.fn(async () => ({ id: 'batch-1' }));
  window.bcis = { collections: { preview, create } } as unknown as NonNullable<
    typeof window.bcis
  >;
  const onCreated = vi.fn();
  render(
    <CollectionRouteWizard
      collectors={[{ id: 'collector-1', code: 'C1', name: 'Alex Rivera' }]}
      areas={[{ id: 'area-1', code: 'N', name: 'North' }]}
      onCancel={vi.fn()}
      onCreated={onCreated}
    />,
  );
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText('Collector'), 'collector-1');
  await user.selectOptions(screen.getByLabelText('Collection area'), 'area-1');
  await user.click(screen.getByRole('button', { name: 'Review accounts' }));
  expect(await screen.findByText('2 of 2 accounts')).toBeInTheDocument();
  await user.click(screen.getByRole('checkbox', { name: /Jose Reyes/ }));
  await user.click(screen.getByRole('button', { name: 'Review route' }));
  expect(screen.getByText('₱100.00')).toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Issue collection route' }),
  );
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ selectedServiceAccountIds: ['service-1'] }),
  );
  expect(onCreated).toHaveBeenCalledWith({ id: 'batch-1' });
});
