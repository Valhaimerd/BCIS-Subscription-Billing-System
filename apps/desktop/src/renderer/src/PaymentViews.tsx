import type { PaymentProofDto, PaymentSummaryDto } from '@bcis/contracts';
import { useEffect, useRef, useState } from 'react';

import { ActionDialog } from './ActionDialog';
import { ReceivePaymentWizard } from './ReceivePaymentWizard';
import { ModalDialog } from './ModalDialog';

const money = (value: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
    value / 100,
  );
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The request could not be completed.';
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
  const [selected, setSelected] = useState<PaymentSummaryDto | null>(null);
  const [reasonAction, setReasonAction] = useState<
    | { kind: 'reject'; id: string }
    | { kind: 'reverse'; payment: PaymentSummaryDto }
    | { kind: 'approve'; payment: PaymentSummaryDto }
    | null
  >(null);
  const [proof, setProof] = useState<PaymentProofDto | null>(null);
  const [proofLoading, setProofLoading] = useState(false);
  const [proofError, setProofError] = useState('');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const listRequest = useRef(0);
  const proofRequest = useRef(0);
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
          className="payment-workspace payment-workspace--wizard"
          id="payment-panel-receive"
          role="tabpanel"
          tabIndex={0}
        >
          <ReceivePaymentWizard
            onOpenHistory={(receiptNumber) => {
              selectTab('history');
              if (receiptNumber)
                void load(undefined, '').then((items) =>
                  setSelected(
                    items.find(
                      (item) => item.receiptNumber === receiptNumber,
                    ) ?? null,
                  ),
                );
            }}
          />
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
