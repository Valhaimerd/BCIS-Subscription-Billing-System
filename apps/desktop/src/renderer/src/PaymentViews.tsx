import type {
  PaymentPreviewDto,
  PaymentProofDto,
  PaymentSummaryDto,
  SubscriberSummaryDto,
} from '@bcis/contracts';
import { useEffect, useRef, useState } from 'react';

import { ActionDialog } from './ActionDialog';
import { fileBase64 } from './payment-files';
import { ModalDialog } from './ModalDialog';

const money = (value: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
    value / 100,
  );
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The request could not be completed.';
function centavos(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}
export function PaymentsView({
  canCreate,
  canVerify,
  canReverse,
}: {
  canCreate: boolean;
  canVerify: boolean;
  canReverse: boolean;
}) {
  const [tab, setTab] = useState<'receive' | 'history' | 'gcash'>(() =>
    canCreate ? 'receive' : canVerify ? 'gcash' : 'history',
  );
  const [rows, setRows] = useState<PaymentSummaryDto[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [subscribers, setSubscribers] = useState<SubscriberSummaryDto[]>([]);
  const [selected, setSelected] = useState<PaymentSummaryDto | null>(null);
  const [reasonAction, setReasonAction] = useState<
    | { kind: 'reject'; id: string }
    | { kind: 'reverse'; payment: PaymentSummaryDto }
    | { kind: 'approve'; payment: PaymentSummaryDto }
    | null
  >(null);
  const [preview, setPreview] = useState<PaymentPreviewDto | null>(null);
  const [previewKey, setPreviewKey] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [method, setMethod] = useState('CASH');
  const [proof, setProof] = useState<PaymentProofDto | null>(null);
  const [proofLoading, setProofLoading] = useState(false);
  const [proofError, setProofError] = useState('');
  const [search, setSearch] = useState('');
  const [subscriberQuery, setSubscriberQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const listRequest = useRef(0);
  const subscriberRequest = useRef(0);
  const proofRequest = useRef(0);
  const previewRequest = useRef(0);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  async function load(status?: string, query = search) {
    const request = ++listRequest.current;
    if (!window.bcis) {
      setRowsLoading(false);
      return [];
    }
    setRowsLoading(true);
    setError('');
    try {
      const result = await window.bcis.payments.list({
        q: query,
        page: 1,
        pageSize: 50,
        ...(status ? { status } : {}),
      });
      if (request !== listRequest.current) return [];
      setRows(result.items);
      return result.items;
    } catch (caught) {
      if (request === listRequest.current) setError(message(caught));
      return [];
    } finally {
      if (request === listRequest.current) setRowsLoading(false);
    }
  }
  useEffect(() => {
    if (tab === 'history') void load();
    else if (tab === 'gcash') void load('PENDING_VERIFICATION');
  }, []);

  const paymentTabs = [
    ...(canCreate
      ? [{ id: 'receive' as const, label: 'Receive payment' }]
      : []),
    { id: 'history' as const, label: 'Payment history' },
    ...(canVerify
      ? [{ id: 'gcash' as const, label: 'GCash verification' }]
      : []),
  ];

  function selectTab(next: 'receive' | 'history' | 'gcash') {
    setTab(next);
    setSelected(null);
    setReasonAction(null);
    if (next !== 'gcash') {
      proofRequest.current += 1;
      setProof(null);
      setProofLoading(false);
      setProofError('');
    }
    if (next !== 'receive') {
      previewRequest.current += 1;
      setPreview(null);
      setPreviewKey('');
      setPreviewLoading(false);
    }
    if (next === 'history') void load();
    else if (next === 'gcash') void load('PENDING_VERIFICATION');
  }

  function moveTab(event: React.KeyboardEvent<HTMLButtonElement>) {
    const activeIndex = paymentTabs.findIndex((item) => item.id === tab);
    let nextIndex: number;
    if (event.key === 'ArrowRight')
      nextIndex = (activeIndex + 1) % paymentTabs.length;
    else if (event.key === 'ArrowLeft')
      nextIndex = (activeIndex - 1 + paymentTabs.length) % paymentTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = paymentTabs.length - 1;
    else return;
    event.preventDefault();
    const next = paymentTabs[nextIndex];
    if (!next) return;
    selectTab(next.id);
    tabRefs.current[next.id]?.focus();
  }

  async function findSubscriber(event: React.FormEvent) {
    event.preventDefault();
    const request = ++subscriberRequest.current;
    setError('');
    try {
      const result = await window.bcis!.masterData.listSubscribers({
        q: subscriberQuery,
        page: 1,
        pageSize: 20,
      });
      if (request === subscriberRequest.current) setSubscribers(result.items);
    } catch (caught) {
      if (request === subscriberRequest.current) setError(message(caught));
    }
  }

  async function previewPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const amountCentavos = centavos(String(form.get('amount')));
    const subscriberId = String(form.get('subscriberId'));
    if (!amountCentavos || !subscriberId) {
      setError('Select a subscriber and enter a valid positive amount.');
      return;
    }
    const request = ++previewRequest.current;
    const requestedKey = `${subscriberId}:${amountCentavos}`;
    try {
      setError('');
      setPreview(null);
      setPreviewKey('');
      setPreviewLoading(true);
      const result = await window.bcis!.payments.preview(
        subscriberId,
        amountCentavos,
      );
      const currentForm = new FormData(formElement);
      const currentAmount = centavos(String(currentForm.get('amount') ?? ''));
      if (
        request !== previewRequest.current ||
        `${String(currentForm.get('subscriberId'))}:${currentAmount}` !==
          requestedKey
      )
        return;
      setPreview(result);
      setPreviewKey(requestedKey);
    } catch (caught) {
      if (request === previewRequest.current) setError(message(caught));
    } finally {
      if (request === previewRequest.current) setPreviewLoading(false);
    }
  }

  async function post(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const amountCentavos = centavos(String(form.get('amount')));
    const subscriberId = String(form.get('subscriberId'));
    const method = String(form.get('method'));
    if (!amountCentavos || !subscriberId) {
      setError('Select a subscriber and enter a valid positive amount.');
      return;
    }
    if (
      method !== 'GCASH' &&
      previewKey !== `${subscriberId}:${amountCentavos}`
    ) {
      setError('Preview the allocation before posting this payment.');
      return;
    }
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      if (method === 'GCASH') {
        const fileInput = formElement.elements.namedItem(
          'proof',
        ) as HTMLInputElement | null;
        const file = fileInput?.files?.[0];
        if (String(form.get('referenceNumber')).trim().length < 3)
          throw new Error('Enter the GCash reference number.');
        if (!String(form.get('senderDetails')).trim())
          throw new Error('Enter the GCash sender details.');
        if (!file || !file.size) throw new Error('Choose a GCash proof image.');
        const proofFile = file as File;
        await window.bcis!.payments.submitGcash({
          subscriberId,
          amountCentavos,
          referenceNumber: String(form.get('referenceNumber')),
          senderDetails: String(form.get('senderDetails')),
          notes: String(form.get('notes')) || undefined,
          proof: {
            filename: proofFile.name,
            mimeType: proofFile.type,
            dataBase64: await fileBase64(proofFile),
          },
        });
        setNotice('GCash proof submitted. It is not posted until approved.');
        setPreview(null);
        setPreviewKey('');
        setMethod('CASH');
        formElement.reset();
      } else {
        const result = (await window.bcis!.payments.create({
          subscriberId,
          amountCentavos,
          method,
          referenceNumber: String(form.get('referenceNumber')) || undefined,
          notes: String(form.get('notes')) || undefined,
        })) as { receiptNumber: string };
        setNotice(`Payment posted. Receipt ${result.receiptNumber} created.`);
        previewRequest.current += 1;
        setPreview(null);
        setPreviewKey('');
        setMethod('CASH');
        formElement.reset();
        setSearch('');
        const refreshedRows = await load(undefined, '');
        setSelected(
          refreshedRows.find(
            (row) => row.receiptNumber === result.receiptNumber,
          ) ?? null,
        );
        setTab('history');
      }
    } catch (caught) {
      setError(message(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function showProof(row: PaymentSummaryDto) {
    const request = ++proofRequest.current;
    setSelected(row);
    setProof(null);
    setProofError('');
    if (!row.proofId) {
      setProofError('No proof file is attached to this submission.');
      setProofLoading(false);
      return;
    }
    setProofLoading(true);
    try {
      const result = await window.bcis!.payments.proof(row.proofId);
      if (request === proofRequest.current) setProof(result);
    } catch (caught) {
      if (request === proofRequest.current) setProofError(message(caught));
    } finally {
      if (request === proofRequest.current) setProofLoading(false);
    }
  }
  async function decide(
    id: string,
    decision: 'APPROVE' | 'REJECT',
    reason?: string,
  ) {
    await window.bcis!.payments.decideGcash(
      id,
      decision === 'APPROVE'
        ? { decision }
        : { decision, reason: reason?.trim() ?? '' },
    );
    proofRequest.current += 1;
    setSelected(null);
    setProof(null);
    setProofLoading(false);
    setNotice(
      `GCash payment ${decision === 'APPROVE' ? 'approved' : 'rejected'}.`,
    );
    await load('PENDING_VERIFICATION');
  }
  async function reverse(row: PaymentSummaryDto, reason: string) {
    await window.bcis!.payments.reverse(row.id, reason.trim());
    setNotice('Payment reversed; receipt voided and balances restored.');
    setSelected(null);
    await load();
  }

  return (
    <div className="data-layout">
      <div
        aria-label="Payment workspaces"
        className="profile-tabs payment-tabs"
        role="tablist"
      >
        {paymentTabs.map((item) => (
          <button
            aria-controls={`payment-panel-${item.id}`}
            aria-selected={tab === item.id}
            id={`payment-tab-${item.id}`}
            key={item.id}
            onClick={() => selectTab(item.id)}
            onKeyDown={moveTab}
            ref={(element) => {
              tabRefs.current[item.id] = element;
            }}
            role="tab"
            tabIndex={tab === item.id ? 0 : -1}
          >
            {item.label}
          </button>
        ))}
      </div>
      {notice ? (
        <div className="success-notice" role="status">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}

      {tab === 'receive' && canCreate ? (
        <div
          aria-labelledby="payment-tab-receive"
          className="payment-workspace"
          id="payment-panel-receive"
          role="tabpanel"
          tabIndex={0}
        >
          <section className="data-card">
            <div className="card-heading">
              <div>
                <span>Cashier workflow</span>
                <h2>Receive payment</h2>
              </div>
            </div>
            <ol aria-label="Payment steps" className="payment-steps">
              <li>
                <span>1</span> Find subscriber
              </li>
              <li>
                <span>2</span> Enter amount and method
              </li>
              <li>
                <span>3</span>
                {method === 'GCASH'
                  ? 'Submit proof for review'
                  : 'Preview, then post'}
              </li>
            </ol>
            <form className="list-search" onSubmit={findSubscriber}>
              <label>
                <span className="sr-only">Find subscriber</span>
                <input
                  aria-label="Find subscriber"
                  onChange={(event) => setSubscriberQuery(event.target.value)}
                  placeholder="Account number or subscriber name"
                  type="search"
                  value={subscriberQuery}
                />
              </label>
              <button type="submit">Find</button>
            </form>
            <form
              className="form-grid wide-form embedded-form"
              onSubmit={post}
              onChange={() => {
                previewRequest.current += 1;
                setPreview(null);
                setPreviewKey('');
                setPreviewLoading(false);
                setError('');
                setNotice('');
              }}
            >
              <label>
                Subscriber
                <select name="subscriberId" required>
                  <option value="">Select subscriber</option>
                  {subscribers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.accountNumber} — {item.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Amount (PHP)
                <input
                  min="0.01"
                  name="amount"
                  required
                  step="0.01"
                  type="number"
                />
              </label>
              <div className="payment-method-field">
                <label htmlFor="payment-method">Method</label>
                <select
                  aria-describedby="payment-method-hint"
                  id="payment-method"
                  name="method"
                  onChange={(event) => setMethod(event.target.value)}
                  value={method}
                >
                  <option value="CASH">Cash</option>
                  <option value="GCASH">GCash</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="OTHER">Other</option>
                </select>
                <span className="field-hint" id="payment-method-hint">
                  {method === 'GCASH'
                    ? 'GCash stays pending until an authorized verifier approves the proof.'
                    : 'Preview the oldest-first invoice allocation before posting.'}
                </span>
              </div>
              {method !== 'CASH' ? (
                <label>
                  Reference number
                  <input name="referenceNumber" />
                </label>
              ) : null}
              {method === 'GCASH' ? (
                <>
                  <label>
                    Sender details
                    <input name="senderDetails" />
                  </label>
                  <label>
                    GCash proof image
                    <input
                      accept="image/jpeg,image/png,image/webp"
                      name="proof"
                      type="file"
                    />
                  </label>
                </>
              ) : null}
              <label className="span-two">
                Notes
                <textarea name="notes" rows={2} />
              </label>
              <div className="row-actions span-two payment-actions">
                {method !== 'GCASH' ? (
                  <button
                    disabled={previewLoading || submitting}
                    onClick={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget.closest('form');
                      if (form)
                        void previewPayment({
                          preventDefault() {},
                          currentTarget: form,
                        } as React.FormEvent<HTMLFormElement>);
                    }}
                    type="button"
                  >
                    {previewLoading ? 'Previewing…' : 'Preview allocation'}
                  </button>
                ) : null}
                <button
                  className="primary-action"
                  disabled={submitting || previewLoading}
                  type="submit"
                >
                  {submitting
                    ? method === 'GCASH'
                      ? 'Submitting…'
                      : 'Posting…'
                    : method === 'GCASH'
                      ? 'Submit for verification'
                      : 'Post payment'}
                </button>
              </div>
            </form>
          </section>
          {method === 'GCASH' ? (
            <GcashSubmissionGuide />
          ) : (
            <AllocationPreview loading={previewLoading} preview={preview} />
          )}
        </div>
      ) : null}

      {tab === 'history' ? (
        <div
          aria-labelledby="payment-tab-history"
          className="payment-history-panel"
          id="payment-panel-history"
          role="tabpanel"
          tabIndex={0}
        >
          <PaymentHistory
            loading={rowsLoading}
            rows={rows}
            search={search}
            setSearch={setSearch}
            onSearch={() => void load()}
            onSelect={setSelected}
          />
        </div>
      ) : null}

      {tab === 'gcash' ? (
        <div
          aria-labelledby="payment-tab-gcash"
          className="gcash-workspace"
          id="payment-panel-gcash"
          role="tabpanel"
          tabIndex={0}
        >
          <PaymentHistory
            loading={rowsLoading}
            rows={rows}
            search={search}
            setSearch={setSearch}
            onSearch={() => void load('PENDING_VERIFICATION')}
            onSelect={showProof}
          />
          <section
            className="data-card proof-panel"
            aria-label="GCash proof review"
          >
            {proofLoading ? (
              <div className="empty-state" role="status">
                Loading proof…
              </div>
            ) : proofError ? (
              <div className="form-error" role="alert">
                {proofError}
              </div>
            ) : selected && proof ? (
              <>
                <div className="card-heading">
                  <div>
                    <span>{selected.referenceNumber}</span>
                    <h2>{selected.subscriberName}</h2>
                    <p>
                      {money(selected.amountCentavos)} ·{' '}
                      {selected.senderDetails}
                    </p>
                  </div>
                </div>
                <img
                  alt={`Proof ${proof.filename}`}
                  src={`data:${proof.mimeType};base64,${proof.dataBase64}`}
                />
                <div className="row-actions">
                  <button
                    className="danger-action"
                    onClick={() =>
                      setReasonAction({ kind: 'reject', id: selected.id })
                    }
                  >
                    Reject
                  </button>
                  <button
                    className="primary-action"
                    onClick={() =>
                      setReasonAction({ kind: 'approve', payment: selected })
                    }
                  >
                    Approve and post
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-state">
                Select a pending GCash submission to review its proof.
              </div>
            )}
          </section>
        </div>
      ) : null}

      {selected && tab === 'history' ? (
        <ModalDialog
          ariaLabel="Receipt detail"
          onClose={() => setSelected(null)}
        >
          <section className="data-card receipt-sheet">
            <div className="card-heading">
              <div>
                <span>{selected.receiptNumber ?? 'No receipt'}</span>
                <h2>{selected.subscriberName}</h2>
                <p>
                  {selected.method.replace('_', ' ')} ·{' '}
                  {new Date(selected.paymentDate).toLocaleString()}
                </p>
              </div>
              <div className="row-actions">
                <button onClick={() => setSelected(null)}>Close</button>
                {selected.receiptNumber && selected.status === 'POSTED' ? (
                  <button onClick={() => window.print()}>Print receipt</button>
                ) : null}
                {canReverse && selected.status === 'POSTED' ? (
                  <button
                    className="danger-action"
                    onClick={() =>
                      setReasonAction({ kind: 'reverse', payment: selected })
                    }
                  >
                    Reverse
                  </button>
                ) : null}
              </div>
            </div>
            <dl className="payment-reference-grid">
              <div>
                <dt>Receipt</dt>
                <dd>{selected.receiptNumber ?? 'Not issued'}</dd>
              </div>
              <div>
                <dt>Payment reference</dt>
                <dd>{selected.referenceNumber ?? '—'}</dd>
              </div>
              <div>
                <dt>Received</dt>
                <dd>{new Date(selected.paymentDate).toLocaleString()}</dd>
              </div>
              {selected.receiptVoidedAt ? (
                <div>
                  <dt>Receipt status</dt>
                  <dd>
                    Voided {new Date(selected.receiptVoidedAt).toLocaleString()}
                  </dd>
                </div>
              ) : null}
            </dl>
            <dl className="invoice-summary">
              <div>
                <dt>Amount</dt>
                <dd>{money(selected.amountCentavos)}</dd>
              </div>
              <div>
                <dt>Allocated</dt>
                <dd>{money(selected.allocatedCentavos)}</dd>
              </div>
              <div>
                <dt>Subscriber credit</dt>
                <dd>{money(selected.creditCentavos)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{selected.status}</dd>
              </div>
            </dl>
            {selected.reversedReason ? (
              <p>Reversal reason: {selected.reversedReason}</p>
            ) : null}
            {selected.rejectedReason ? (
              <p>Rejection reason: {selected.rejectedReason}</p>
            ) : null}
            {selected.notes ? <p>Notes: {selected.notes}</p> : null}
          </section>
        </ModalDialog>
      ) : null}
      {reasonAction?.kind === 'reject' ? (
        <ActionDialog
          ariaLabel="Reject GCash proof"
          title="Reject this GCash proof?"
          description="The submission will remain in payment history as rejected and will not post to the subscriber ledger. Record the reason for the audit trail."
          submitLabel="Reject proof"
          tone="danger"
          fields={[
            {
              name: 'reason',
              label: 'Rejection reason',
              type: 'text',
              required: true,
            },
          ]}
          onClose={() => setReasonAction(null)}
          onSubmit={({ reason }) =>
            decide(reasonAction.id, 'REJECT', reason ?? '')
          }
          validate={({ reason }) =>
            (reason ?? '').trim()
              ? null
              : 'Enter a reason for rejecting this proof.'
          }
        />
      ) : reasonAction?.kind === 'approve' ? (
        <ActionDialog
          ariaLabel="Approve GCash payment"
          title="Approve this GCash payment?"
          description={`Approving ${reasonAction.payment.referenceNumber ?? 'this submission'} for ${reasonAction.payment.subscriberName} posts ${money(reasonAction.payment.amountCentavos)} to the ledger and creates a receipt.`}
          submitLabel="Approve payment"
          fields={[]}
          onClose={() => setReasonAction(null)}
          onSubmit={() => decide(reasonAction.payment.id, 'APPROVE')}
        />
      ) : reasonAction?.kind === 'reverse' ? (
        <ActionDialog
          ariaLabel="Reverse payment"
          title={`Reverse receipt ${reasonAction.payment.receiptNumber ?? ''}?`}
          description={`This reverses ${money(reasonAction.payment.amountCentavos)}, voids its receipt, and restores the linked balances. The original payment stays in history.`}
          submitLabel="Reverse payment"
          tone="danger"
          fields={[
            {
              name: 'reason',
              label: 'Reason for reversal',
              type: 'text',
              required: true,
            },
          ]}
          onClose={() => setReasonAction(null)}
          onSubmit={({ reason }) => reverse(reasonAction.payment, reason ?? '')}
          validate={({ reason }) =>
            (reason ?? '').trim()
              ? null
              : 'Enter a reason for reversing this payment.'
          }
        />
      ) : null}
    </div>
  );
}

function AllocationPreview({
  preview,
  loading,
}: {
  preview: PaymentPreviewDto | null;
  loading: boolean;
}) {
  return (
    <section
      aria-label="Allocation preview"
      aria-live="polite"
      className="data-card allocation-preview"
      role="region"
    >
      <div className="card-heading">
        <div>
          <span>Oldest first</span>
          <h2>Allocation preview</h2>
        </div>
      </div>
      {loading ? (
        <div className="empty-state" role="status">
          Reviewing the oldest unpaid invoices…
        </div>
      ) : preview ? (
        <>
          <p>
            Outstanding balance:{' '}
            <strong>{money(preview.balanceCentavos)}</strong>
          </p>
          {preview.invoices
            .filter((item) => item.proposedCentavos > 0)
            .map((item) => (
              <div className="amount-row" key={item.id}>
                <span>
                  {item.invoiceNumber}
                  <small>Due {item.dueDate}</small>
                </span>
                <strong>{money(item.proposedCentavos)}</strong>
              </div>
            ))}
          <div className="amount-row">
            <span>Remaining subscriber credit</span>
            <strong>{money(preview.unallocatedCreditCentavos)}</strong>
          </div>
        </>
      ) : (
        <div className="empty-state">
          Find a subscriber, enter an amount, then preview the allocation.
        </div>
      )}
    </section>
  );
}

function GcashSubmissionGuide() {
  return (
    <section
      aria-label="GCash verification steps"
      className="data-card verification-guide"
    >
      <div className="card-heading">
        <div>
          <span>Separate verification</span>
          <h2>Proof is reviewed before posting</h2>
        </div>
      </div>
      <p>
        A submitted GCash payment stays pending. It will not change the ledger
        or create a receipt until an authorized verifier approves it.
      </p>
      <ol>
        <li>Attach a clear proof image and submit the reference and sender.</li>
        <li>A verifier checks the sender, reference, amount, and proof.</li>
        <li>
          Approval posts the payment and creates a receipt; rejection records a
          reason.
        </li>
      </ol>
    </section>
  );
}

function PaymentHistory({
  rows,
  loading,
  search,
  setSearch,
  onSearch,
  onSelect,
}: {
  rows: PaymentSummaryDto[];
  loading: boolean;
  search: string;
  setSearch: (value: string) => void;
  onSearch: () => void;
  onSelect: (row: PaymentSummaryDto) => void;
}) {
  return (
    <section aria-busy={loading} className="data-card table-card">
      <div className="card-heading">
        <div>
          <span>Payments and receipts</span>
          <h2>Payment history</h2>
        </div>
      </div>
      <form
        className="list-search"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
      >
        <label>
          <span className="sr-only">Search payments</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Receipt, GCash reference, or subscriber"
            value={search}
          />
        </label>
        <button type="submit">Search</button>
      </form>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Receipt / reference</th>
              <th>Subscriber</th>
              <th>Method</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <button
                    className="record-link"
                    onClick={() => onSelect(row)}
                    type="button"
                  >
                    {row.receiptNumber ?? row.referenceNumber ?? 'Pending'}
                  </button>
                  {row.receiptNumber && row.referenceNumber ? (
                    <small>Reference {row.referenceNumber}</small>
                  ) : null}
                </td>
                <td>
                  {row.subscriberName}
                  <small>{row.subscriberAccountNumber}</small>
                </td>
                <td>{row.method.replace('_', ' ')}</td>
                <td>{money(row.amountCentavos)}</td>
                <td>
                  <span
                    className={`record-status ${row.status === 'POSTED' ? 'active' : ['REJECTED', 'REVERSED'].includes(row.status) ? 'attention' : row.status === 'PENDING_VERIFICATION' ? 'follow-up' : ''}`}
                  >
                    {row.status.replace('_', ' ')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loading && !rows.length ? (
        <div className="empty-state" role="status">
          Loading payment records…
        </div>
      ) : !loading && !rows.length ? (
        <div className="empty-state">No payments match this view.</div>
      ) : null}
    </section>
  );
}
