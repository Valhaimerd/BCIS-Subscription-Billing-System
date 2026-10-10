import type {
  BatchAccountDto,
  CollectionBatchDetailDto,
  CollectionBatchSummaryDto,
  ReferenceItemDto,
} from '@bcis/contracts';
import { useEffect, useRef, useState } from 'react';

import { fileBase64 } from './payment-files';
import { ActionDialog } from './ActionDialog';
import { ModalDialog } from './ModalDialog';

const PAGE_SIZE = 20;
const lifecycle = [
  'OPEN',
  'IN_PROGRESS',
  'SUBMITTED',
  'REMITTED',
  'RECONCILED',
  'CLOSED',
] as const;

function nextStep(status: CollectionBatchSummaryDto['status']) {
  switch (status) {
    case 'OPEN':
      return 'Start route';
    case 'IN_PROGRESS':
      return 'Record collections';
    case 'SUBMITTED':
      return 'Record cash remittance';
    case 'REMITTED':
      return 'Review difference';
    case 'RECONCILED':
      return 'Close batch';
    case 'CLOSED':
      return 'Complete';
  }
}

function localDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

const money = (value: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
    value / 100,
  );
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The request could not be completed.';
function centavos(value: string, allowZero = false) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(result) && (allowZero ? result >= 0 : result > 0)
    ? result
    : null;
}

export function CollectionsView({ canReconcile }: { canReconcile: boolean }) {
  const [rows, setRows] = useState<CollectionBatchSummaryDto[]>([]);
  const [detail, setDetail] = useState<CollectionBatchDetailDto | null>(null);
  const [collectors, setCollectors] = useState<ReferenceItemDto[]>([]);
  const [areas, setAreas] = useState<ReferenceItemDto[]>([]);
  const [selectedAccount, setSelectedAccount] =
    useState<BatchAccountDto | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [collectionMethod, setCollectionMethod] = useState('CASH');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingAction, setPendingAction] = useState<
    'reconcile' | 'close' | null
  >(null);
  const [loading, setLoading] = useState(true);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);

  async function load(targetPage = page) {
    if (!window.bcis) return;
    const request = ++listRequest.current;
    setLoading(true);
    setError('');
    try {
      const result = await window.bcis!.collections.list({
        q: search,
        page: targetPage,
        pageSize: PAGE_SIZE,
      });
      if (request !== listRequest.current) return;
      setRows(result.items);
      setPage(result.page);
      setTotal(result.total);
    } catch (caught) {
      if (request === listRequest.current) {
        setRows([]);
        setTotal(0);
        setError(message(caught));
      }
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (!window.bcis) return;
    void load(1);
    void window.bcis.masterData
      .references()
      .then((references) => {
        setCollectors(references.collectors);
        setAreas(references.collectionAreas);
      })
      .catch((caught: unknown) => setError(message(caught)));
  }, []);

  async function open(id: string) {
    if (!window.bcis) return;
    const request = ++detailRequest.current;
    try {
      setError('');
      const loaded = await window.bcis.collections.get(id);
      if (request !== detailRequest.current) return;
      setDetail(loaded);
      setSelectedAccount(null);
      setCollectionMethod('CASH');
    } catch (caught) {
      if (request === detailRequest.current) setError(message(caught));
    }
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const created = await window.bcis!.collections.create({
        collectorId: String(form.get('collectorId')),
        collectionAreaId: String(form.get('collectionAreaId')),
        batchDate: String(form.get('batchDate')),
      });
      setDetail(created);
      setNotice(
        'Route sheet generated from the current assignments and balances.',
      );
      await load(1);
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function action(next: 'start' | 'submit' | 'reconcile' | 'close') {
    if (!detail) return;
    if (next === 'reconcile' || next === 'close') {
      setPendingAction(next);
      return;
    }
    await performAction(next).catch(() => undefined);
  }

  async function performAction(
    next: 'start' | 'submit' | 'reconcile' | 'close',
  ) {
    if (!detail) return;
    try {
      const updated =
        next === 'reconcile' || next === 'close'
          ? await window.bcis!.collections[next](
              detail.id,
              detail.differenceCentavos,
            )
          : await window.bcis!.collections[next](detail.id);
      setDetail(updated);
      setNotice(`Batch moved to ${updated.status.replace('_', ' ')}.`);
      await load(page);
    } catch (caught) {
      setError(message(caught));
      throw caught;
    }
  }

  async function collect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAccount) return;
    const form = new FormData(event.currentTarget);
    const amountCentavos = centavos(String(form.get('amount')));
    if (!amountCentavos)
      return setError('Enter a valid positive collection amount.');
    try {
      if (collectionMethod === 'GCASH') {
        const file = form.get('proof');
        if (!(file instanceof File) || !file.size)
          throw new Error('Choose a GCash proof image.');
        await window.bcis!.payments.submitGcash({
          subscriberId: selectedAccount.subscriberId,
          batchAccountId: selectedAccount.id,
          amountCentavos,
          referenceNumber: String(form.get('referenceNumber')),
          senderDetails: String(form.get('senderDetails')),
          notes: 'House-to-house collection',
          proof: {
            filename: file.name,
            mimeType: file.type,
            dataBase64: await fileBase64(file),
          },
        });
        setNotice('GCash proof submitted. It is not posted until approved.');
      } else {
        const result = (await window.bcis!.payments.create({
          subscriberId: selectedAccount.subscriberId,
          batchAccountId: selectedAccount.id,
          amountCentavos,
          method: collectionMethod,
          referenceNumber: String(form.get('referenceNumber')) || undefined,
          notes: 'House-to-house collection',
        })) as { receiptNumber: string };
        setNotice(
          `Collection posted. Receipt ${result.receiptNumber} created.`,
        );
      }
      await open(detail!.id);
      setSelectedAccount(null);
      setCollectionMethod('CASH');
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function remit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const form = new FormData(event.currentTarget);
    const amountCentavos = centavos(String(form.get('amount')), true);
    if (amountCentavos === null)
      return setError('Enter a valid remittance amount.');
    try {
      const updated = await window.bcis!.collections.remit(
        detail.id,
        amountCentavos,
        String(form.get('notes')) || undefined,
      );
      setDetail(updated);
      setNotice(
        'Cash remittance recorded; the calculated difference remains visible.',
      );
      await load(page);
    } catch (caught) {
      setError(message(caught));
    }
  }

  return (
    <div className="data-layout collections-view">
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
      {canReconcile ? (
        <form
          className="data-card form-grid collection-generator"
          onSubmit={create}
        >
          <div className="card-heading">
            <div>
              <span>Route assignment</span>
              <h2>Generate collection batch</h2>
            </div>
          </div>
          <label>
            Collector
            <select name="collectorId" required>
              <option value="">Select collector</option>
              {collectors.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} — {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Collection area
            <select name="collectionAreaId" required>
              <option value="">Select area</option>
              {areas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} — {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Route date
            <input
              defaultValue={localDate()}
              name="batchDate"
              required
              type="date"
            />
          </label>
          <button className="primary-action" type="submit">
            Generate route sheet
          </button>
        </form>
      ) : null}
      <section className="data-card table-card collection-list">
        <div className="card-heading">
          <div>
            <span>Collector work</span>
            <h2>Collection batches</h2>
          </div>
        </div>
        <form
          className="list-search"
          onSubmit={(event) => {
            event.preventDefault();
            void load(1);
          }}
        >
          <label>
            <span className="sr-only">Search collection batches</span>
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Collector or collection area"
              value={search}
            />
          </label>
          <button type="submit">Search</button>
        </form>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Collector / area</th>
                <th>Expected</th>
                <th>Status</th>
                <th>Next step</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <button
                      aria-label={`Open batch for ${row.collectorName}, ${row.collectionAreaName}, ${row.batchDate}`}
                      className="record-link"
                      onClick={() => void open(row.id)}
                      type="button"
                    >
                      {row.batchDate}
                    </button>
                  </td>
                  <td>
                    {row.collectorName}
                    <small>
                      {row.collectionAreaName} · {row.accountCount} accounts
                    </small>
                  </td>
                  <td>{money(row.expectedReceivableCentavos)}</td>
                  <td>
                    <span
                      className={`record-status ${row.status === 'CLOSED' ? 'active' : ''}`}
                    >
                      {row.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <span className="collection-next-step">
                      {nextStep(row.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading ? (
          <div className="workspace-loading" role="status">
            Loading collection batches…
          </div>
        ) : null}
        {error ? (
          <div className="collection-load-error" role="alert">
            <span>{error}</span>
            <button onClick={() => void load(page)} type="button">
              Retry
            </button>
          </div>
        ) : null}
        {!loading && !error && !rows.length ? (
          <div className="empty-state">
            No collection batches match this view.
          </div>
        ) : null}
        <div className="pagination">
          <button
            aria-label="Previous batches"
            disabled={loading || page <= 1}
            onClick={() => void load(page - 1)}
            type="button"
          >
            Previous
          </button>
          <span>
            Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </span>
          <button
            aria-label="Next batches"
            disabled={loading || page * PAGE_SIZE >= total}
            onClick={() => void load(page + 1)}
            type="button"
          >
            Next
          </button>
        </div>
      </section>
      {detail ? (
        <ModalDialog
          ariaLabel="Collection batch detail"
          onClose={() => {
            setDetail(null);
            setSelectedAccount(null);
          }}
        >
          <section className="data-card table-card route-sheet">
            <div className="card-heading">
              <div>
                <span>
                  {detail.batchDate} · {detail.status.replace('_', ' ')}
                </span>
                <h2>
                  {detail.collectorName} — {detail.collectionAreaName}
                </h2>
              </div>
              <div className="row-actions">
                <button
                  onClick={() => {
                    detailRequest.current += 1;
                    setDetail(null);
                    setSelectedAccount(null);
                    setPendingAction(null);
                  }}
                  type="button"
                >
                  Close
                </button>
                <button onClick={() => window.print()} type="button">
                  Print route sheet
                </button>
                {canReconcile && detail.status === 'OPEN' ? (
                  <button
                    className="primary-action"
                    onClick={() => void action('start')}
                    type="button"
                  >
                    Start batch
                  </button>
                ) : null}
                {canReconcile && detail.status === 'IN_PROGRESS' ? (
                  <button
                    className="primary-action"
                    onClick={() => void action('submit')}
                    type="button"
                  >
                    Submit batch
                  </button>
                ) : null}
              </div>
            </div>
            <ol className="collection-lifecycle" aria-label="Batch progress">
              {lifecycle.map((status, index) => {
                const currentIndex = lifecycle.indexOf(detail.status);
                return (
                  <li
                    key={status}
                    className={
                      index < currentIndex
                        ? 'complete'
                        : index === currentIndex
                          ? 'current'
                          : ''
                    }
                    aria-current={index === currentIndex ? 'step' : undefined}
                  >
                    <span>{index + 1}</span>
                    {status.replace('_', ' ')}
                  </li>
                );
              })}
            </ol>
            <dl className="invoice-summary collection-totals">
              <div>
                <dt>Expected</dt>
                <dd>{money(detail.expectedReceivableCentavos)}</dd>
              </div>
              <div>
                <dt>Cash collected</dt>
                <dd>{money(detail.cashCollectedCentavos)}</dd>
              </div>
              <div>
                <dt>Non-cash</dt>
                <dd>{money(detail.nonCashCollectedCentavos)}</dd>
              </div>
              <div>
                <dt>Uncollected</dt>
                <dd>{money(detail.uncollectedCentavos)}</dd>
              </div>
              <div>
                <dt>Cash remitted</dt>
                <dd>{money(detail.remittedCashCentavos)}</dd>
              </div>
              <div
                className={detail.differenceCentavos ? 'difference-alert' : ''}
              >
                <dt>Difference</dt>
                <dd>
                  {detail.differenceCentavos < 0
                    ? `${money(-detail.differenceCentavos)} shortage`
                    : detail.differenceCentavos > 0
                      ? `${money(detail.differenceCentavos)} overage`
                      : money(0)}
                </dd>
              </div>
            </dl>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Route address</th>
                    <th>Current</th>
                    <th>Arrears</th>
                    <th>Total due</th>
                    <th>Collection</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.accounts.map((account) => (
                    <tr key={account.id}>
                      <td>
                        {account.subscriberName}
                        <small>
                          {account.subscriberAccountNumber} ·{' '}
                          {account.serviceAccountNumber}
                        </small>
                      </td>
                      <td>{account.routeAddress}</td>
                      <td>{money(account.currentBillCentavos)}</td>
                      <td>{money(account.arrearsCentavos)}</td>
                      <td>{money(account.totalDueCentavos)}</td>
                      <td>
                        {account.paymentId ? (
                          <>
                            {account.paymentAmountCentavos
                              ? money(account.paymentAmountCentavos)
                              : 'Pending'}
                            <small>
                              {account.paymentAmountCentavos
                                ? account.paymentMethod?.replace('_', ' ')
                                : `${account.paymentMethod?.replace('_', ' ') ?? 'Payment'} · pending verification`}
                            </small>
                          </>
                        ) : detail.status === 'IN_PROGRESS' && canReconcile ? (
                          <button
                            className="table-action"
                            onClick={() => setSelectedAccount(account)}
                            type="button"
                          >
                            Record
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!detail.accounts.length ? (
              <div className="empty-state">
                No assigned active service accounts were found for this route.
              </div>
            ) : null}
            {selectedAccount ? (
              <form
                className="wide-form form-grid collection-entry"
                onSubmit={collect}
              >
                <h3 className="span-two">
                  Record collection — {selectedAccount.subscriberName}
                </h3>
                <label>
                  Amount (PHP)
                  <input
                    defaultValue={(
                      selectedAccount.totalDueCentavos / 100
                    ).toFixed(2)}
                    min="0.01"
                    name="amount"
                    required
                    step="0.01"
                    type="number"
                  />
                </label>
                <label>
                  Method
                  <select
                    name="method"
                    onChange={(event) =>
                      setCollectionMethod(event.target.value)
                    }
                    value={collectionMethod}
                  >
                    <option value="CASH">Cash</option>
                    <option value="GCASH">GCash</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label
                  className={collectionMethod === 'GCASH' ? '' : 'span-two'}
                >
                  Reference (required by office policy when applicable)
                  <input
                    name="referenceNumber"
                    required={collectionMethod === 'GCASH'}
                  />
                </label>
                {collectionMethod === 'GCASH' ? (
                  <>
                    <label>
                      Sender details
                      <input name="senderDetails" required />
                    </label>
                    <label className="span-two">
                      GCash proof image
                      <input
                        accept="image/jpeg,image/png,image/webp"
                        name="proof"
                        required
                        type="file"
                      />
                    </label>
                  </>
                ) : null}
                <div className="row-actions span-two">
                  <button
                    onClick={() => setSelectedAccount(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button className="primary-action" type="submit">
                    Post collection
                  </button>
                </div>
              </form>
            ) : null}
            {canReconcile && detail.status === 'SUBMITTED' ? (
              <form
                className="wide-form form-grid remittance-form"
                onSubmit={remit}
              >
                <h3 className="span-two">Record Cash remittance</h3>
                <label>
                  Amount (PHP)
                  <input
                    defaultValue={(detail.cashCollectedCentavos / 100).toFixed(
                      2,
                    )}
                    min="0"
                    name="amount"
                    required
                    step="0.01"
                    type="number"
                  />
                </label>
                <label>
                  Notes
                  <input name="notes" />
                </label>
                <button className="primary-action span-two" type="submit">
                  Record remittance
                </button>
              </form>
            ) : null}
            {canReconcile && detail.status === 'REMITTED' ? (
              <div className="reconciliation-action">
                <p>
                  <strong>
                    Review the visible difference before confirmation.
                  </strong>{' '}
                  Shortages and overages remain recorded; they are never forced
                  to zero.
                </p>
                <button
                  className="primary-action"
                  onClick={() => void action('reconcile')}
                  type="button"
                >
                  Confirm reconciliation
                </button>
              </div>
            ) : null}
            {canReconcile && detail.status === 'RECONCILED' ? (
              <div className="reconciliation-action">
                <p>
                  The reconciled difference is{' '}
                  {money(detail.differenceCentavos)}.
                </p>
                <button
                  className="primary-action"
                  onClick={() => void action('close')}
                  type="button"
                >
                  Confirm and close batch
                </button>
              </div>
            ) : null}
          </section>
        </ModalDialog>
      ) : null}
      {pendingAction && detail ? (
        <ActionDialog
          ariaLabel={
            pendingAction === 'reconcile'
              ? 'Confirm reconciliation'
              : 'Close collection batch'
          }
          title={
            pendingAction === 'reconcile'
              ? 'Confirm reconciliation?'
              : 'Close this batch?'
          }
          description={
            pendingAction === 'reconcile'
              ? `Batch ${detail.batchDate} for ${detail.collectorName}: confirm the recorded Cash difference of ${detail.differenceCentavos < 0 ? `${money(-detail.differenceCentavos)} shortage` : detail.differenceCentavos > 0 ? `${money(detail.differenceCentavos)} overage` : money(0)}. The recorded difference remains visible in the batch history.`
              : `Close the reconciled batch for ${detail.collectorName} on ${detail.batchDate}. The recorded remittance and difference remain in the audit history.`
          }
          submitLabel={
            pendingAction === 'reconcile'
              ? 'Confirm reconciliation'
              : 'Close batch'
          }
          onClose={() => setPendingAction(null)}
          onSubmit={() => performAction(pendingAction)}
          fields={[]}
        />
      ) : null}
    </div>
  );
}
