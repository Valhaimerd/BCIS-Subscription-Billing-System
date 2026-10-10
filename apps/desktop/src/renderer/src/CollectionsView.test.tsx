import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CollectionBatchDetailDto } from '@bcis/contracts';
import { CollectionsView } from './CollectionsView';

const detail = {
  id: 'batch-1',
  collectorId: 'collector-1',
  batchDate: '2026-10-10',
  collectorName: 'Alex Rivera',
  collectionAreaId: 'area-1',
  collectionAreaName: 'North',
  status: 'SUBMITTED',
  expectedReceivableCentavos: 10000,
  cashCollectedCentavos: 7000,
  nonCashCollectedCentavos: 1000,
  uncollectedCentavos: 2000,
  remittedCashCentavos: 0,
  differenceCentavos: 0,
  accountCount: 0,
  accounts: [],
} satisfies CollectionBatchDetailDto;

function setup(
  items = [
    {
      id: 'batch-1',
      batchDate: '2026-10-10',
      collectorName: 'Alex Rivera',
      collectionAreaName: 'North',
      accountCount: 0,
      expectedReceivableCentavos: 10000,
      status: 'SUBMITTED',
    },
  ],
  batchDetail: CollectionBatchDetailDto = detail,
  canReconcile = true,
) {
  const get = vi.fn(async () => batchDetail);
  const reconcile = vi.fn(async () => ({
    ...batchDetail,
    status: 'RECONCILED',
  }));
  const close = vi.fn(async () => ({ ...batchDetail, status: 'CLOSED' }));
  window.bcis = {
    collections: {
      list: vi.fn(async (query: { status?: string }) => ({
        items: query.status
          ? items.filter(() => batchDetail.status === query.status)
          : items,
        page: 1,
        pageSize: 20,
        total: query.status
          ? items.filter(() => batchDetail.status === query.status).length
          : items.length,
      })),
      preview: vi.fn(),
      get,
      start: vi.fn(async () => ({ ...batchDetail, status: 'IN_PROGRESS' })),
      submit: vi.fn(async () => ({ ...batchDetail, status: 'SUBMITTED' })),
      reconcile,
      close,
      remit: vi.fn(async () => ({ ...batchDetail, status: 'REMITTED' })),
    },
    masterData: {
      references: vi.fn(async () => ({ collectors: [], collectionAreas: [] })),
    },
  } as unknown as NonNullable<typeof window.bcis>;
  render(<CollectionsView canReconcile={canReconcile} />);
  return { get, reconcile, close };
}

afterEach(() => {
  cleanup();
  delete window.bcis;
});

describe('CollectionsView', () => {
  it('explains empty route assignments and shows lifecycle progress', async () => {
    const user = userEvent.setup();
    const { get } = setup();
    await user.click(
      await screen.findByRole('button', { name: /open batch.*2026-10-10/i }),
    );
    expect(get).toHaveBeenCalledWith('batch-1');
    expect(
      screen.getByRole('list', { name: 'Batch progress' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'No assigned active service accounts were found for this route.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Record remittance' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Start batch' }),
    ).not.toBeInTheDocument();
  });

  it('shows a clear empty state when there are no batches', async () => {
    setup([]);
    expect(
      await screen.findByText('No collection batches match this view.'),
    ).toBeInTheDocument();
  });

  it('shows the cash difference before reconciliation and leaves the batch unchanged on cancel', async () => {
    const user = userEvent.setup();
    const remittedDetail: CollectionBatchDetailDto = {
      ...detail,
      status: 'REMITTED',
      differenceCentavos: -1250,
    };
    const { reconcile } = setup(
      [
        {
          id: 'batch-1',
          batchDate: '2026-10-10',
          collectorName: 'Alex Rivera',
          collectionAreaName: 'North',
          accountCount: 1,
          expectedReceivableCentavos: 10000,
          status: 'REMITTED',
        },
      ],
      remittedDetail,
    );
    await user.click(
      await screen.findByRole('button', { name: /open batch.*2026-10-10/i }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Confirm reconciliation' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Confirm reconciliation',
    });
    expect(dialog).toHaveTextContent('₱12.50 shortage');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(reconcile).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', { name: 'Confirm reconciliation' }),
    );
    await user.click(
      screen
        .getByRole('dialog', { name: 'Confirm reconciliation' })
        .querySelector('button[type="submit"]') as HTMLElement,
    );
    expect(reconcile).toHaveBeenCalledWith('batch-1', -1250);
  });

  it('requires an explicit close confirmation for a reconciled batch', async () => {
    const user = userEvent.setup();
    const reconciledDetail: CollectionBatchDetailDto = {
      ...detail,
      status: 'RECONCILED',
    };
    const { close } = setup(
      [
        {
          id: 'batch-1',
          batchDate: '2026-10-10',
          collectorName: 'Alex Rivera',
          collectionAreaName: 'North',
          accountCount: 1,
          expectedReceivableCentavos: 10000,
          status: 'RECONCILED',
        },
      ],
      reconciledDetail,
    );
    await user.click(
      await screen.findByRole('button', { name: /open batch.*2026-10-10/i }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Confirm and close batch' }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Close collection batch' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(close).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Confirm and close batch' }),
    );
    await user.click(screen.getByRole('button', { name: 'Close batch' }));
    expect(close).toHaveBeenCalledWith('batch-1', 0);
  });

  it.each([
    ['OPEN', 'Start batch', 'Submit batch'],
    ['IN_PROGRESS', 'Submit batch', 'Start batch'],
    ['SUBMITTED', 'Record remittance', 'Confirm reconciliation'],
    ['REMITTED', 'Confirm reconciliation', 'Record remittance'],
    ['RECONCILED', 'Confirm and close batch', 'Record remittance'],
    ['CLOSED', null, 'Start batch'],
  ] as const)(
    'marks %s as current and exposes only its legal next step',
    async (status, nextAction, illegalAction) => {
      const user = userEvent.setup();
      const currentDetail = { ...detail, status } as CollectionBatchDetailDto;
      setup(
        [
          {
            id: 'batch-1',
            batchDate: '2026-10-10',
            collectorName: 'Alex Rivera',
            collectionAreaName: 'North',
            accountCount: 0,
            expectedReceivableCentavos: 10000,
            status,
          },
        ],
        currentDetail,
      );
      if (status === 'CLOSED')
        await user.click(
          screen.getByRole('button', { name: /Search full register/i }),
        );
      const openButton = await screen.findByRole('button', {
        name: /open batch.*2026-10-10/i,
      });
      openButton.focus();
      await user.keyboard('{Enter}');

      const currentStep = screen
        .getByRole('list', { name: 'Batch progress' })
        .querySelector('[aria-current="step"]');
      expect(currentStep).toHaveTextContent(status.replace('_', ' '));
      if (nextAction)
        expect(
          screen.getByRole('button', { name: nextAction }),
        ).toBeInTheDocument();
      else
        expect(
          screen.queryByRole('button', {
            name: /start batch|submit batch|record remittance|confirm reconciliation|confirm and close batch/i,
          }),
        ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: illegalAction }),
      ).not.toBeInTheDocument();
    },
  );

  it('keeps collection actions hidden for read-only staff and labels pending GCash proof', async () => {
    const user = userEvent.setup();
    const inProgress: CollectionBatchDetailDto = {
      ...detail,
      status: 'IN_PROGRESS',
      accounts: [
        {
          id: 'account-1',
          subscriberId: 'subscriber-1',
          subscriberAccountNumber: 'SUB-00001',
          subscriberName: 'Maria Santos',
          serviceAccountNumber: 'SVC-00001',
          routeAddress: '101 North Street',
          currentBillCentavos: 5000,
          arrearsCentavos: 5000,
          totalDueCentavos: 10000,
          paymentId: 'payment-pending',
          paymentMethod: 'GCASH',
          paymentAmountCentavos: 0,
        },
      ],
    };
    setup(
      [
        {
          id: 'batch-1',
          batchDate: '2026-10-10',
          collectorName: 'Alex Rivera',
          collectionAreaName: 'North',
          accountCount: 1,
          expectedReceivableCentavos: 10000,
          status: 'IN_PROGRESS',
        },
      ],
      inProgress,
      false,
    );
    await user.click(
      await screen.findByRole('button', { name: /open batch.*2026-10-10/i }),
    );
    expect(screen.getAllByText(/pending verification/i).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.queryByRole('button', { name: 'Record' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Submit batch' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Print route sheet' }),
    ).toBeInTheDocument();
  });

  it('shows an overage in words and amount before reconciliation', async () => {
    const user = userEvent.setup();
    const overageDetail: CollectionBatchDetailDto = {
      ...detail,
      status: 'REMITTED',
      differenceCentavos: 1250,
    };
    const { reconcile } = setup(
      [
        {
          id: 'batch-1',
          batchDate: '2026-10-10',
          collectorName: 'Alex Rivera',
          collectionAreaName: 'North',
          accountCount: 1,
          expectedReceivableCentavos: 10000,
          status: 'REMITTED',
        },
      ],
      overageDetail,
    );
    await user.click(
      await screen.findByRole('button', { name: /open batch.*2026-10-10/i }),
    );
    expect(screen.getByText('₱12.50 overage')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Confirm reconciliation' }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Confirm reconciliation' }),
    ).toHaveTextContent('₱12.50 overage');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(reconcile).not.toHaveBeenCalled();
  });
});
