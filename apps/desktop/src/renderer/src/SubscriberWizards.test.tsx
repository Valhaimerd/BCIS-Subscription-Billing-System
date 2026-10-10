import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SubscriberProfileDto } from '@bcis/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReferenceData } from '../../shared/desktop-api';
import { SubscribersView } from './MasterDataViews';
import {
  ServiceCreateWizard,
  SubscriberCreateWizard,
} from './SubscriberWizards';

const references = {
  serviceTypes: [],
  collectionAreas: [{ id: 'area-1', code: 'NORTH', name: 'North District' }],
  collectors: [{ id: 'collector-1', code: 'ALEX', name: 'Alex Rivera' }],
  plans: [
    {
      id: 'plan-1',
      code: 'NET-25',
      name: 'Internet 25',
      priceCentavos: 79900,
      serviceTypeCode: 'INTERNET',
      speedMbps: 25,
      channelCount: null,
      description: null,
      isActive: true,
    },
  ],
} as ReferenceData;
const profile = {
  id: 'subscriber-1',
  accountNumber: 'SUB-0001',
  fullName: 'Maria Santos',
  addresses: [
    {
      id: 'address-1',
      label: 'Primary',
      addressLine: '1 Mabini Street',
      isPrimary: true,
    },
  ],
  assignedCollector: { id: 'collector-1', name: 'Alex Rivera' },
} as SubscriberProfileDto;

afterEach(() => {
  cleanup();
  delete window.bcis;
});

describe('subscriber journeys', () => {
  it('shows bounded subscriber cards and hides registration without permission', async () => {
    window.bcis = {
      masterData: {
        listSubscribers: vi.fn(async () => ({
          items: [
            {
              id: 'subscriber-1',
              accountNumber: 'SUB-0001',
              fullName: 'Maria Santos',
              status: 'ACTIVE',
              primaryContact: '09170000001',
              primaryAddress: '1 Mabini Street',
              serviceCount: 2,
            },
          ],
          page: 1,
          pageSize: 20,
          total: 1,
        })),
        references: vi.fn(async () => references),
      },
    } as unknown as NonNullable<typeof window.bcis>;
    render(<SubscribersView permissions={[]} onNavigate={vi.fn()} />);
    expect(
      await screen.findByRole('button', {
        name: 'Open profile for Maria Santos',
      }),
    ).toHaveTextContent('SUB-0001');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Register subscriber' }),
    ).not.toBeInTheDocument();
  });

  it('registers one subscriber after identity, contact, defaults, and review', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(async () => undefined);
    render(
      <SubscriberCreateWizard
        references={references}
        onCancel={vi.fn()}
        onCreate={onCreate}
      />,
    );
    await user.type(screen.getByLabelText('Subscriber number'), 'SUB-0002');
    await user.type(screen.getByLabelText('Full name'), 'Jose Reyes');
    await user.click(screen.getByRole('button', { name: 'Continue →' }));
    await user.type(screen.getByLabelText('Primary contact'), '09170000002');
    await user.type(screen.getByLabelText('Primary address'), '2 Rizal Avenue');
    await user.click(screen.getByRole('button', { name: 'Continue →' }));
    await user.selectOptions(
      screen.getByLabelText('Collection area'),
      'area-1',
    );
    await user.click(screen.getByRole('button', { name: 'Continue →' }));
    expect(screen.getByText('Jose Reyes · SUB-0002')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Create subscriber' }));
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          accountNumber: 'SUB-0002',
          fullName: 'Jose Reyes',
          collectionAreaId: 'area-1',
          addresses: [
            {
              label: 'Primary',
              addressLine: '2 Rizal Avenue',
              isPrimary: true,
            },
          ],
        }),
      ),
    );
  });

  it('preserves entered values on Back and confirms a mid-flow exit', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <SubscriberCreateWizard
        references={references}
        onCancel={onCancel}
        onCreate={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText('Subscriber number'), 'SUB-0002');
    await user.type(screen.getByLabelText('Full name'), 'Jose Reyes');
    await user.click(screen.getByRole('button', { name: 'Continue →' }));
    await user.click(screen.getByRole('button', { name: '← Back' }));
    expect(screen.getByLabelText('Full name')).toHaveValue('Jose Reyes');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Full name')).toHaveValue('Jose Reyes');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('keeps the registration review available after a duplicate error', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(async () => {
      throw new Error('Subscriber number already exists.');
    });
    render(
      <SubscriberCreateWizard
        references={references}
        onCancel={vi.fn()}
        onCreate={onCreate}
      />,
    );
    await user.type(screen.getByLabelText('Subscriber number'), 'SUB-0002');
    await user.type(screen.getByLabelText('Full name'), 'Jose Reyes');
    await user.click(screen.getByRole('button', { name: 'Continue →' }));
    await user.type(screen.getByLabelText('Primary contact'), '09170000002');
    await user.type(screen.getByLabelText('Primary address'), '2 Rizal Avenue');
    await user.click(screen.getByRole('button', { name: 'Continue →' }));
    await user.click(screen.getByRole('button', { name: 'Continue →' }));
    await user.click(screen.getByRole('button', { name: 'Create subscriber' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'already exists',
    );
    await user.click(screen.getByRole('button', { name: '← Back' }));
    expect(
      screen.getByRole('heading', { name: 'Set the account defaults' }),
    ).toBeVisible();
  });

  it('creates a service after plan, installation, schedule, and review', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(async () => undefined);
    render(
      <ServiceCreateWizard
        profile={profile}
        references={references}
        onCancel={vi.fn()}
        onCreate={onCreate}
      />,
    );
    await user.type(screen.getByLabelText('Service number'), 'SVC-0002');
    await user.click(screen.getByRole('button', { name: /Internet 25/ }));
    await user.click(screen.getByRole('button', { name: 'Continue →' }));
    expect(screen.getByLabelText('Installation address')).toHaveValue(
      'address-1',
    );
    await user.click(screen.getByRole('button', { name: 'Continue →' }));
    await user.click(screen.getByRole('button', { name: 'Continue →' }));
    expect(screen.getByText('₱799.00')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Create service' }));
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          accountNumber: 'SVC-0002',
          planId: 'plan-1',
          installationAddressId: 'address-1',
          status: 'ACTIVE',
        }),
      ),
    );
  });

  it('keeps an unavailable service number in review for correction', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(async () => {
      throw new Error('Service number already exists.');
    });
    render(
      <ServiceCreateWizard
        profile={profile}
        references={references}
        onCancel={vi.fn()}
        onCreate={onCreate}
      />,
    );
    await user.type(screen.getByLabelText('Service number'), 'SVC-0002');
    await user.click(screen.getByRole('button', { name: /Internet 25/ }));
    for (let step = 0; step < 3; step += 1)
      await user.click(screen.getByRole('button', { name: 'Continue →' }));
    await user.click(screen.getByRole('button', { name: 'Create service' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Service number already exists.',
    );
    await user.click(screen.getByRole('button', { name: '← Back' }));
    expect(
      screen.getByRole('heading', { name: 'When does billing begin?' }),
    ).toBeVisible();
  });

  it('allows a pending service without a saved installation address', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(async () => undefined);
    render(
      <ServiceCreateWizard
        profile={{ ...profile, addresses: [], assignedCollector: null }}
        references={references}
        onCancel={vi.fn()}
        onCreate={onCreate}
      />,
    );
    await user.type(screen.getByLabelText('Service number'), 'SVC-0003');
    await user.click(screen.getByRole('button', { name: /Internet 25/ }));
    await user.click(screen.getByRole('button', { name: 'Continue →' }));
    await user.click(screen.getByRole('button', { name: 'Continue →' }));
    await user.click(screen.getByLabelText('Activate service now'));
    await user.click(screen.getByRole('button', { name: 'Continue →' }));
    await user.click(screen.getByRole('button', { name: 'Create service' }));
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          installationAddressId: null,
          assignedCollectorId: null,
          status: 'PENDING',
          activationDate: null,
        }),
      ),
    );
  });
});
