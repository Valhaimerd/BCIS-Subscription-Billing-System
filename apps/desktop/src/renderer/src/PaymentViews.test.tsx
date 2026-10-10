import '@testing-library/jest-dom/vitest';

import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PaymentsView } from './PaymentViews';

const subscriber = {
  id: 'subscriber-1',
  accountNumber: 'SUB-0001',
  fullName: 'Maria Santos',
  status: 'ACTIVE' as const,
  primaryContact: '09170000001',
  primaryAddress: '1 Mabini Street',
  serviceCount: 1,
};

function renderPayments(
  rows: Array<Record<string, unknown>> = [],
  permissions: {
    canCreate?: boolean;
    canReverse?: boolean;
    canVerify?: boolean;
  } = {},
) {
  const create = vi.fn(async () => ({ receiptNumber: 'RCT-0001' }));
  const preview = vi.fn(async () => ({
    subscriberId: subscriber.id,
    fingerprint: 'a'.repeat(64),
    balanceCentavos: 50000,
    invoices: [
      {
        id: 'invoice-1',
        invoiceNumber: 'INV-1',
        dueDate: '2026-10-15',
        balanceCentavos: 50000,
        proposedCentavos: 25000,
      },
    ],
    unallocatedCreditCentavos: 0,
  }));
  const submitGcash = vi.fn(async () => ({ status: 'PENDING_VERIFICATION' }));
  const decideGcash = vi.fn(async () => ({ status: 'REJECTED' }));
  const reverse = vi.fn(async () => undefined);
  const proof = vi.fn(async (id: string) => ({
    id,
    filename: 'synthetic-proof.png',
    mimeType: 'image/png',
    dataBase64: 'c3ludGhldGlj',
  }));
  window.bcis = {
    masterData: {
      listSubscribers: vi.fn(async () => ({
        items: [subscriber],
        page: 1,
        pageSize: 20,
        total: 1,
      })),
    },
    payments: {
      list: vi.fn(async () => ({
        items: rows,
        page: 1,
        pageSize: 50,
        total: rows.length,
      })),
      preview,
      create,
      submitGcash,
      decideGcash,
      reverse,
      proof,
    },
  } as unknown as NonNullable<typeof window.bcis>;
  render(
    <PaymentsView
      canCreate={permissions.canCreate ?? true}
      canVerify={permissions.canVerify ?? false}
      canReverse={permissions.canReverse ?? false}
    />,
  );
  return { create, preview, submitGcash, decideGcash, reverse, proof };
}

async function selectSubscriber(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByRole('searchbox', { name: 'Subscriber or account number' }),
    'Maria',
  );
  await user.click(screen.getByRole('button', { name: 'Find account' }));
  await user.click(await screen.findByRole('button', { name: /Maria Santos/ }));
  await user.type(screen.getByLabelText('Amount received (PHP)'), '250.00');
}

async function reviewPayment(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Review payment →' }));
  await screen.findByRole('heading', { name: 'Confirm before posting' });
}

afterEach(() => {
  cleanup();
  delete window.bcis;
});

describe('PaymentsView', () => {
  it('moves through payment workspaces with the arrow keys', async () => {
    const user = userEvent.setup();
    renderPayments([], { canVerify: true });
    const receiveTab = screen.getByRole('tab', { name: 'Receive payment' });
    receiveTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(
      screen.getByRole('tab', { name: 'Payment history' }),
    ).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowRight}');
    expect(
      screen.getByRole('tab', { name: 'GCash verification' }),
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('opens directly to an available workspace for a read-only payment role', async () => {
    renderPayments([], { canCreate: false });
    expect(
      await screen.findByRole('tab', { name: 'Payment history' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.queryByRole('tab', { name: 'Receive payment' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Payment history' }),
    ).toBeVisible();
  });

  it('does not offer posting until the allocation review is ready', async () => {
    const user = userEvent.setup();
    const { create } = renderPayments();
    await selectSubscriber(user);
    expect(
      screen.queryByRole('button', { name: /Post ₱/ }),
    ).not.toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    await reviewPayment(user);
    expect(
      screen.getByRole('button', { name: 'Post ₱250.00 payment' }),
    ).toBeVisible();
  });

  it('keeps GCash submissions pending and does not issue a receipt', async () => {
    const user = userEvent.setup();
    const { create, submitGcash } = renderPayments();
    await selectSubscriber(user);
    await user.selectOptions(screen.getByLabelText('Payment method'), 'GCASH');
    await user.type(screen.getByLabelText('Reference number'), 'GC-12345');
    await user.type(screen.getByLabelText('Sender details'), 'Maria Santos');
    const proof = new File(['synthetic proof'], 'proof.png', {
      type: 'image/png',
    });
    await user.upload(screen.getByLabelText('Proof image'), proof);
    await user.click(screen.getByRole('button', { name: 'Review payment →' }));
    expect(
      await screen.findByRole('heading', { name: 'Review submission' }),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'Submit for verification' }),
    );
    await waitFor(() => expect(submitGcash).toHaveBeenCalled());
    expect(create).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('heading', {
        name: 'Submitted for verification',
      }),
    ).toBeVisible();
    expect(screen.getByText(/No payment has been posted yet/)).toBeVisible();
  });

  it('posts cash with the reviewed fingerprint and reports the receipt number', async () => {
    const user = userEvent.setup();
    const { create, preview } = renderPayments();
    await selectSubscriber(user);
    await reviewPayment(user);
    expect(preview).toHaveBeenCalledWith('subscriber-1', 25000);
    await user.click(
      screen.getByRole('button', { name: 'Post ₱250.00 payment' }),
    );
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriberId: subscriber.id,
        amountCentavos: 25000,
        previewFingerprint: 'a'.repeat(64),
        idempotencyKey: expect.any(String),
      }),
    );
    expect(await screen.findByText(/Receipt RCT-0001 is ready/)).toBeVisible();
  });

  it('submits one direct payment while the posting request is in flight', async () => {
    const user = userEvent.setup();
    const { create } = renderPayments();
    let finish!: (value: { receiptNumber: string }) => void;
    create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await selectSubscriber(user);
    await reviewPayment(user);
    const post = screen.getByRole('button', { name: 'Post ₱250.00 payment' });
    await user.dblClick(post);
    expect(create).toHaveBeenCalledTimes(1);
    await act(async () => finish({ receiptNumber: 'RCT-0001' }));
    expect(await screen.findByText(/Receipt RCT-0001 is ready/)).toBeVisible();
  });

  it('opens the new posted receipt after the cashier chooses View receipt', async () => {
    const user = userEvent.setup();
    renderPayments([
      {
        id: 'payment-new',
        subscriberId: subscriber.id,
        subscriberName: subscriber.fullName,
        subscriberAccountNumber: subscriber.accountNumber,
        amountCentavos: 25000,
        allocatedCentavos: 25000,
        creditCentavos: 0,
        method: 'CASH',
        status: 'POSTED',
        referenceNumber: null,
        senderDetails: null,
        notes: null,
        paymentDate: '2026-10-10T00:00:00Z',
        receiptNumber: 'RCT-0001',
        receiptVoidedAt: null,
        proofId: null,
        proofFilename: null,
        rejectedReason: null,
        reversedReason: null,
      },
    ]);
    await selectSubscriber(user);
    await reviewPayment(user);
    await user.click(
      screen.getByRole('button', { name: 'Post ₱250.00 payment' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'View receipt →' }),
    );
    const receipt = await screen.findByRole('dialog', {
      name: 'Receipt detail',
    });
    expect(receipt).toHaveTextContent('RCT-0001');
    expect(screen.getByRole('button', { name: 'Print receipt' })).toBeVisible();
  });

  it('keeps the server-provided oldest-first allocation order and exposes excess credit', async () => {
    const user = userEvent.setup();
    const { preview } = renderPayments();
    preview.mockResolvedValue({
      subscriberId: subscriber.id,
      fingerprint: 'b'.repeat(64),
      balanceCentavos: 30000,
      invoices: [
        {
          id: 'invoice-old',
          invoiceNumber: 'INV-OLD',
          dueDate: '2026-09-15',
          balanceCentavos: 10000,
          proposedCentavos: 10000,
        },
        {
          id: 'invoice-new',
          invoiceNumber: 'INV-NEW',
          dueDate: '2026-10-15',
          balanceCentavos: 20000,
          proposedCentavos: 10000,
        },
      ],
      unallocatedCreditCentavos: 5000,
    });
    await selectSubscriber(user);
    await reviewPayment(user);
    const review = screen.getByRole('region', { name: 'Receive payment' });
    const older = within(review).getByText('INV-OLD');
    const newer = within(review).getByText('INV-NEW');
    expect(
      older.compareDocumentPosition(newer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(review).toHaveTextContent('Remaining account credit');
    expect(review).toHaveTextContent('₱50.00');
  });

  it('returns to details when the server reports a changed invoice balance', async () => {
    const user = userEvent.setup();
    const { create } = renderPayments();
    create.mockRejectedValueOnce(
      new Error(
        'The invoice balance changed. Review the allocation again before posting.',
      ),
    );
    await selectSubscriber(user);
    await reviewPayment(user);
    await user.click(
      screen.getByRole('button', { name: 'Post ₱250.00 payment' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'invoice balance changed',
    );
    expect(
      screen.getByRole('heading', { name: 'How much was received?' }),
    ).toBeVisible();
  });

  it('shows rejection history and keeps reversal unavailable to a read-only cashier', async () => {
    const user = userEvent.setup();
    renderPayments([
      {
        id: 'payment-1',
        subscriberId: subscriber.id,
        subscriberName: subscriber.fullName,
        subscriberAccountNumber: subscriber.accountNumber,
        amountCentavos: 25000,
        allocatedCentavos: 0,
        creditCentavos: 0,
        method: 'GCASH',
        status: 'REJECTED',
        referenceNumber: 'GC-1',
        senderDetails: 'Maria',
        notes: null,
        paymentDate: '2026-10-10T00:00:00Z',
        receiptNumber: null,
        receiptVoidedAt: null,
        proofId: null,
        proofFilename: null,
        rejectedReason: 'Proof does not match.',
        reversedReason: null,
      },
    ]);
    await user.click(screen.getByRole('tab', { name: 'Payment history' }));
    await user.click(await screen.findByRole('button', { name: 'GC-1' }));
    expect(
      screen.getByText('Rejection reason: Proof does not match.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reverse' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('REJECTED')).toHaveLength(2);
  });

  it('requires confirmation and a reason before rejecting a GCash proof', async () => {
    const user = userEvent.setup();
    const { decideGcash, proof } = renderPayments(
      [
        {
          id: 'payment-pending',
          subscriberId: subscriber.id,
          subscriberName: subscriber.fullName,
          subscriberAccountNumber: subscriber.accountNumber,
          amountCentavos: 25000,
          allocatedCentavos: 0,
          creditCentavos: 0,
          method: 'GCASH',
          status: 'PENDING_VERIFICATION',
          referenceNumber: 'GC-123',
          senderDetails: 'Maria Santos',
          notes: null,
          paymentDate: '2026-10-10T00:00:00Z',
          receiptNumber: null,
          receiptVoidedAt: null,
          proofId: 'proof-1',
          proofFilename: 'synthetic-proof.png',
          rejectedReason: null,
          reversedReason: null,
        },
      ],
      { canVerify: true },
    );
    await user.click(screen.getByRole('tab', { name: 'GCash verification' }));
    await user.click(await screen.findByRole('button', { name: 'GC-123' }));
    await waitFor(() => expect(proof).toHaveBeenCalledWith('proof-1'));
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(
      await screen.findByRole('dialog', { name: 'Reject GCash proof' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(decideGcash).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await user.type(
      screen.getByLabelText('Rejection reason'),
      'Proof is unreadable',
    );
    await user.click(screen.getByRole('button', { name: 'Reject proof' }));
    expect(decideGcash).toHaveBeenCalledWith('payment-pending', {
      decision: 'REJECT',
      reason: 'Proof is unreadable',
    });
  });

  it('requires explicit review before approving a GCash payment', async () => {
    const user = userEvent.setup();
    const { decideGcash, proof } = renderPayments(
      [
        {
          id: 'payment-pending-approval',
          subscriberId: subscriber.id,
          subscriberName: subscriber.fullName,
          subscriberAccountNumber: subscriber.accountNumber,
          amountCentavos: 25000,
          allocatedCentavos: 0,
          creditCentavos: 0,
          method: 'GCASH',
          status: 'PENDING_VERIFICATION',
          referenceNumber: 'GC-APPROVE',
          senderDetails: 'Maria Santos',
          notes: null,
          paymentDate: '2026-10-10T00:00:00Z',
          receiptNumber: null,
          receiptVoidedAt: null,
          proofId: 'proof-approval',
          proofFilename: 'synthetic-proof.png',
          rejectedReason: null,
          reversedReason: null,
        },
      ],
      { canVerify: true },
    );
    await user.click(screen.getByRole('tab', { name: 'GCash verification' }));
    await user.click(await screen.findByRole('button', { name: 'GC-APPROVE' }));
    await waitFor(() => expect(proof).toHaveBeenCalledWith('proof-approval'));
    await user.click(screen.getByRole('button', { name: 'Approve and post' }));
    const review = await screen.findByRole('dialog', {
      name: 'Approve GCash payment',
    });
    expect(review).toHaveTextContent('₱250.00');
    expect(review).toHaveTextContent('GC-APPROVE');
    expect(decideGcash).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(decideGcash).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Approve and post' }));
    await user.click(screen.getByRole('button', { name: 'Approve payment' }));
    await waitFor(() =>
      expect(decideGcash).toHaveBeenCalledWith('payment-pending-approval', {
        decision: 'APPROVE',
      }),
    );
  });

  it('explains when a pending GCash submission has no attached proof file', async () => {
    const user = userEvent.setup();
    const { proof } = renderPayments(
      [
        {
          id: 'payment-without-proof',
          subscriberId: subscriber.id,
          subscriberName: subscriber.fullName,
          subscriberAccountNumber: subscriber.accountNumber,
          amountCentavos: 25000,
          allocatedCentavos: 0,
          creditCentavos: 0,
          method: 'GCASH',
          status: 'PENDING_VERIFICATION',
          referenceNumber: 'GC-NO-PROOF',
          senderDetails: 'Maria Santos',
          notes: null,
          paymentDate: '2026-10-10T00:00:00Z',
          receiptNumber: null,
          receiptVoidedAt: null,
          proofId: null,
          proofFilename: null,
          rejectedReason: null,
          reversedReason: null,
        },
      ],
      { canVerify: true },
    );
    await user.click(screen.getByRole('tab', { name: 'GCash verification' }));
    await user.click(
      await screen.findByRole('button', { name: 'GC-NO-PROOF' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No proof file is attached to this submission.',
    );
    expect(proof).not.toHaveBeenCalled();
  });

  it('does not display an earlier proof after the reviewer selects another submission', async () => {
    const user = userEvent.setup();
    type ProofFile = {
      id: string;
      filename: string;
      mimeType: string;
      dataBase64: string;
    };
    let resolveFirst!: (file: ProofFile) => void;
    let resolveSecond!: (file: ProofFile) => void;
    const firstProof = new Promise<ProofFile>((resolve) => {
      resolveFirst = resolve;
    });
    const secondProof = new Promise<ProofFile>((resolve) => {
      resolveSecond = resolve;
    });
    const { proof } = renderPayments(
      [
        {
          id: 'payment-proof-a',
          subscriberId: subscriber.id,
          subscriberName: subscriber.fullName,
          subscriberAccountNumber: subscriber.accountNumber,
          amountCentavos: 25000,
          allocatedCentavos: 0,
          creditCentavos: 0,
          method: 'GCASH',
          status: 'PENDING_VERIFICATION',
          referenceNumber: 'GC-A',
          senderDetails: 'Maria Santos',
          notes: null,
          paymentDate: '2026-10-10T00:00:00Z',
          receiptNumber: null,
          receiptVoidedAt: null,
          proofId: 'proof-a',
          proofFilename: 'first.png',
          rejectedReason: null,
          reversedReason: null,
        },
        {
          id: 'payment-proof-b',
          subscriberId: subscriber.id,
          subscriberName: subscriber.fullName,
          subscriberAccountNumber: subscriber.accountNumber,
          amountCentavos: 50000,
          allocatedCentavos: 0,
          creditCentavos: 0,
          method: 'GCASH',
          status: 'PENDING_VERIFICATION',
          referenceNumber: 'GC-B',
          senderDetails: 'Maria Santos',
          notes: null,
          paymentDate: '2026-10-10T00:00:00Z',
          receiptNumber: null,
          receiptVoidedAt: null,
          proofId: 'proof-b',
          proofFilename: 'second.png',
          rejectedReason: null,
          reversedReason: null,
        },
      ],
      { canVerify: true },
    );
    proof.mockImplementation((id) =>
      id === 'proof-a' ? firstProof : secondProof,
    );
    await user.click(screen.getByRole('tab', { name: 'GCash verification' }));
    await user.click(await screen.findByRole('button', { name: 'GC-A' }));
    await user.click(await screen.findByRole('button', { name: 'GC-B' }));
    await act(async () => {
      resolveFirst({
        id: 'proof-a',
        filename: 'first.png',
        mimeType: 'image/png',
        dataBase64: 'Zmlyc3Q=',
      });
      await firstProof;
    });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    await act(async () => {
      resolveSecond({
        id: 'proof-b',
        filename: 'second.png',
        mimeType: 'image/png',
        dataBase64: 'c2Vjb25k',
      });
      await secondProof;
    });
    expect(
      await screen.findByRole('img', { name: 'Proof second.png' }),
    ).toBeVisible();
  });

  it('opens the payment reversal dialog from the receipt and preserves history on cancel', async () => {
    const user = userEvent.setup();
    const { reverse } = renderPayments(
      [
        {
          id: 'payment-posted',
          subscriberId: subscriber.id,
          subscriberName: subscriber.fullName,
          subscriberAccountNumber: subscriber.accountNumber,
          amountCentavos: 25000,
          allocatedCentavos: 25000,
          creditCentavos: 0,
          method: 'CASH',
          status: 'POSTED',
          referenceNumber: null,
          senderDetails: null,
          notes: null,
          paymentDate: '2026-10-10T00:00:00Z',
          receiptNumber: 'RCT-5001',
          receiptVoidedAt: null,
          proofId: null,
          proofFilename: null,
          rejectedReason: null,
          reversedReason: null,
        },
      ],
      { canReverse: true },
    );
    await user.click(screen.getByRole('tab', { name: 'Payment history' }));
    await user.click(await screen.findByRole('button', { name: 'RCT-5001' }));
    await user.click(await screen.findByRole('button', { name: 'Reverse' }));
    expect(
      await screen.findByRole('dialog', { name: 'Reverse payment' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(reverse).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Reverse' }));
    await user.type(
      screen.getByLabelText('Reason for reversal'),
      'Duplicate receipt',
    );
    await user.click(screen.getByRole('button', { name: 'Reverse payment' }));
    expect(reverse).toHaveBeenCalledWith('payment-posted', 'Duplicate receipt');
  });
});
