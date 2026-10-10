import type {
  BillingCycleDto,
  InvoiceDetailDto,
  InvoiceSummaryDto,
  LedgerEntryDto,
} from '@bcis/contracts';
import { useEffect, useRef, useState } from 'react';

import { ActionDialog } from './ActionDialog';
import { ModalDialog } from './ModalDialog';

const money = (centavos: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(centavos / 100);
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The request could not be completed.';
function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
function periodLabel(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1)).toLocaleDateString('en-PH', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function BillingView({ canGenerate }: { canGenerate: boolean }) {
  const [cycles, setCycles] = useState<BillingCycleDto[]>([]);
  const [invoices, setInvoices] = useState<InvoiceSummaryDto[]>([]);
  const [selected, setSelected] = useState<InvoiceDetailDto | null>(null);
  const [invoiceAction, setInvoiceAction] = useState<
    | { kind: 'adjustment'; invoice: InvoiceDetailDto }
    | { kind: 'void'; invoice: InvoiceDetailDto }
    | null
  >(null);
  const [confirmCycle, setConfirmCycle] = useState<BillingCycleDto | null>(
    null,
  );
  const [finalizing, setFinalizing] = useState(false);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const loadRequest = useRef(0);
  const invoiceRequest = useRef(0);

  async function load(nextQuery = query) {
    const request = ++loadRequest.current;
    if (!window.bcis) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [cycleRows, invoiceRows] = await Promise.all([
        window.bcis.billing.listCycles(),
        window.bcis.billing.listInvoices({
          q: nextQuery,
          page: 1,
          pageSize: 50,
        }),
      ]);
      if (request !== loadRequest.current) return;
      setCycles(cycleRows);
      setInvoices(invoiceRows.items);
    } catch (caught) {
      if (request === loadRequest.current) setError(errorMessage(caught));
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const period = String(new FormData(event.currentTarget).get('period'));
    setNotice('');
    const [year, month] = period.split('-').map(Number);
    try {
      const result = await window.bcis!.billing.generate(year!, month!);
      setNotice(
        `${result.created} draft invoices created; ${result.skipped} already existed.`,
      );
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function finalize(cycle: BillingCycleDto) {
    try {
      setFinalizing(true);
      setError('');
      const result = await window.bcis!.billing.finalize(cycle.id);
      setNotice(
        `${result.finalized} invoices finalized and posted to ledgers.`,
      );
      setConfirmCycle(null);
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setFinalizing(false);
    }
  }

  async function open(invoice: InvoiceSummaryDto) {
    const request = ++invoiceRequest.current;
    try {
      const detail = await window.bcis!.billing.getInvoice(invoice.id);
      if (request === invoiceRequest.current) setSelected(detail);
    } catch (caught) {
      if (request === invoiceRequest.current) setError(errorMessage(caught));
    }
  }

  async function adjust(
    invoice: InvoiceDetailDto,
    amount: string,
    reason: string,
  ) {
    const [whole, fraction = ''] = amount.replace('-', '').split('.');
    const centavos =
      (Number(whole) * 100 + Number(fraction.padEnd(2, '0'))) *
      (amount.startsWith('-') ? -1 : 1);
    await window.bcis!.billing.addAdjustment(
      invoice.id,
      centavos,
      reason.trim(),
    );
    setSelected(await window.bcis!.billing.getInvoice(invoice.id));
    await load();
  }

  async function voidInvoice(invoice: InvoiceDetailDto, reason: string) {
    await window.bcis!.billing.voidInvoice(invoice.id, reason.trim());
    setSelected(await window.bcis!.billing.getInvoice(invoice.id));
    await load();
  }

  return (
    <div className="data-layout">
      {canGenerate ? (
        <form className="data-card billing-generator" onSubmit={generate}>
          <div>
            <span className="section-kicker">Monthly billing</span>
            <h2>Generate draft cycle</h2>
            <p>
              Choose a billing period, review the draft totals, then finalize to
              post invoices to subscriber ledgers. Repeated generation skips
              existing service-period invoices.
            </p>
          </div>
          <label>
            Billing month
            <input
              defaultValue={currentPeriod()}
              name="period"
              required
              type="month"
            />
          </label>
          <button className="primary-action" type="submit">
            Generate drafts
          </button>
        </form>
      ) : null}
      {notice ? (
        <div className="success-notice" role="status">
          {notice}
        </div>
      ) : null}
      {error && !confirmCycle ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      {loading ? (
        <div className="workspace-loading" role="status">
          {cycles.length || invoices.length
            ? 'Refreshing billing records…'
            : 'Loading billing records…'}
        </div>
      ) : null}
      <section aria-busy={loading} className="data-card table-card">
        <div className="card-heading">
          <div>
            <span>Billing cycles</span>
            <h2>Monthly runs</h2>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Invoices</th>
                <th>Total</th>
                <th>Status</th>
                <th>Draft review</th>
                {canGenerate ? <th>Action</th> : null}
              </tr>
            </thead>
            <tbody>
              {cycles.map((cycle) => (
                <tr key={cycle.id}>
                  <td>{periodLabel(cycle.periodYear, cycle.periodMonth)}</td>
                  <td>{cycle.invoiceCount}</td>
                  <td>{money(cycle.totalCentavos)}</td>
                  <td>
                    <span
                      className={`record-status ${cycle.status === 'FINALIZED' ? 'active' : ''}`}
                    >
                      {cycle.status}
                    </span>
                  </td>
                  <td>
                    {cycle.status === 'DRAFT' ? (
                      cycle.invoiceCount > 0 ? (
                        <span className="draft-review-ready">
                          {cycle.invoiceCount} draft invoices ready for review
                        </span>
                      ) : (
                        <span className="draft-review-empty">
                          No eligible services produced invoices for this
                          period.
                        </span>
                      )
                    ) : (
                      'Finalized and posted'
                    )}
                  </td>
                  {canGenerate ? (
                    <td>
                      {cycle.status === 'DRAFT' ? (
                        <button
                          className="table-action"
                          disabled={!cycle.invoiceCount}
                          onClick={() => setConfirmCycle(cycle)}
                          type="button"
                        >
                          Review and finalize
                        </button>
                      ) : (
                        'Posted'
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !cycles.length ? (
          <div className="empty-state">
            No billing cycles have been generated.
          </div>
        ) : null}
      </section>
      <section aria-busy={loading} className="data-card table-card">
        <div className="card-heading">
          <div>
            <span>Invoice register</span>
            <h2>Invoices</h2>
          </div>
        </div>
        <form
          className="list-search"
          onSubmit={(event) => {
            event.preventDefault();
            void load(query);
          }}
        >
          <label>
            <span className="sr-only">Search invoices</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Invoice, subscriber, or service account number"
              value={query}
            />
          </label>
          <button type="submit">Search</button>
        </form>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Subscriber</th>
                <th>Period</th>
                <th>Due</th>
                <th>Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <button
                      className="record-link"
                      onClick={() => void open(invoice)}
                      type="button"
                    >
                      {invoice.invoiceNumber}
                    </button>
                  </td>
                  <td>
                    {invoice.subscriberName}
                    <small>{invoice.serviceAccountNumber}</small>
                  </td>
                  <td>{invoice.billingPeriodLabel}</td>
                  <td>{invoice.dueDate}</td>
                  <td>{money(invoice.balanceCentavos)}</td>
                  <td>
                    <span
                      className={`record-status ${invoice.status === 'PAID' ? 'active' : ''}`}
                    >
                      {invoice.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !invoices.length ? (
          <div className="empty-state">No invoices match this search.</div>
        ) : null}
      </section>
      {selected ? (
        <ModalDialog
          ariaLabel="Invoice detail"
          onClose={() => setSelected(null)}
        >
          <InvoicePanel
            invoice={selected}
            canGenerate={canGenerate}
            onAdjust={() =>
              setInvoiceAction({ kind: 'adjustment', invoice: selected })
            }
            onClose={() => setSelected(null)}
            onVoid={() => setInvoiceAction({ kind: 'void', invoice: selected })}
          />
        </ModalDialog>
      ) : null}
      {invoiceAction?.kind === 'adjustment' ? (
        <ActionDialog
          ariaLabel="Invoice adjustment"
          title={`Adjust ${invoiceAction.invoice.invoiceNumber}`}
          description={`Enter a debit or credit for ${invoiceAction.invoice.subscriberName}. This creates a linked ledger adjustment; the posted invoice remains unchanged.`}
          submitLabel="Post adjustment"
          fields={[
            {
              name: 'amount',
              label: 'Adjustment amount (PHP)',
              type: 'text',
              inputMode: 'decimal',
              placeholder: 'Use a minus sign for a credit',
              required: true,
            },
            {
              name: 'reason',
              label: 'Reason',
              type: 'text',
              required: true,
            },
          ]}
          onClose={() => setInvoiceAction(null)}
          onSubmit={({ amount, reason }) =>
            adjust(invoiceAction.invoice, amount ?? '', reason ?? '')
          }
          validate={({ amount, reason }) =>
            !/^-?\d+(\.\d{1,2})?$/.test(amount ?? '')
              ? 'Enter a valid amount with up to two decimal places.'
              : !(reason ?? '').trim()
                ? 'Enter an adjustment reason.'
                : null
          }
        />
      ) : null}
      {invoiceAction?.kind === 'void' ? (
        <ActionDialog
          ariaLabel="Void invoice"
          title={`Void ${invoiceAction.invoice.invoiceNumber}?`}
          description={`This removes ${money(invoiceAction.invoice.balanceCentavos)} from the open balance using the existing linked void record. The invoice remains in history.`}
          submitLabel="Void invoice"
          tone="danger"
          fields={[
            {
              name: 'reason',
              label: 'Reason for voiding',
              type: 'text',
              required: true,
            },
          ]}
          onClose={() => setInvoiceAction(null)}
          onSubmit={({ reason }) =>
            voidInvoice(invoiceAction.invoice, reason ?? '')
          }
          validate={({ reason }) =>
            (reason ?? '').trim()
              ? null
              : 'Enter a reason for voiding this invoice.'
          }
        />
      ) : null}
      {confirmCycle ? (
        <ModalDialog
          ariaLabel={`Finalize billing cycle ${confirmCycle.periodYear}-${String(confirmCycle.periodMonth).padStart(2, '0')}`}
          onClose={() => (finalizing ? undefined : setConfirmCycle(null))}
        >
          <section className="data-card cycle-confirmation">
            <span className="section-kicker">Draft review</span>
            <h2>Finalize billing cycle?</h2>
            <p>
              Review the period, invoice count, and total before posting. Posted
              invoices remain part of financial history.
            </p>
            <dl className="cycle-review-summary">
              <div>
                <dt>Billing period</dt>
                <dd>
                  {periodLabel(
                    confirmCycle.periodYear,
                    confirmCycle.periodMonth,
                  )}
                </dd>
              </div>
              <div>
                <dt>Invoices to post</dt>
                <dd>{confirmCycle.invoiceCount}</dd>
              </div>
              <div>
                <dt>Total to post</dt>
                <dd>{money(confirmCycle.totalCentavos)}</dd>
              </div>
            </dl>
            {error ? (
              <div className="form-error" role="alert">
                {error}
              </div>
            ) : null}
            <div className="row-actions">
              <button
                disabled={finalizing}
                onClick={() => setConfirmCycle(null)}
                type="button"
              >
                Keep as draft
              </button>
              <button
                className="primary-action"
                disabled={finalizing}
                onClick={() => void finalize(confirmCycle)}
                type="button"
              >
                {finalizing ? 'Finalizing…' : 'Confirm finalization'}
              </button>
            </div>
          </section>
        </ModalDialog>
      ) : null}
    </div>
  );
}

function InvoicePanel({
  invoice,
  canGenerate,
  onAdjust,
  onClose,
  onVoid,
}: {
  invoice: InvoiceDetailDto;
  canGenerate: boolean;
  onAdjust: () => void;
  onClose: () => void;
  onVoid: () => void;
}) {
  return (
    <section className="invoice-sheet data-card">
      <div className="card-heading">
        <div>
          <span>{invoice.invoiceNumber}</span>
          <h2>{invoice.subscriberName}</h2>
          <p>
            {invoice.serviceAccountNumber} · {invoice.billingPeriodLabel}
          </p>
        </div>
        <div className="row-actions">
          <button onClick={onClose}>Close</button>
          <button onClick={() => window.print()}>Print</button>
          {canGenerate && !['DRAFT', 'VOID'].includes(invoice.status) ? (
            <>
              <button onClick={onAdjust}>Adjustment</button>
              <button className="danger-action" onClick={onVoid}>
                Void
              </button>
            </>
          ) : null}
        </div>
      </div>
      <dl className="invoice-summary">
        <div>
          <dt>Invoice date</dt>
          <dd>{invoice.invoiceDate}</dd>
        </div>
        <div>
          <dt>Due date</dt>
          <dd>{invoice.dueDate}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{invoice.status}</dd>
        </div>
        <div>
          <dt>Balance</dt>
          <dd>{money(invoice.balanceCentavos)}</dd>
        </div>
      </dl>
      <div className="detail-list">
        {invoice.items.map((item) => (
          <div className="amount-row" key={item.id}>
            <span>{item.description}</span>
            <strong>{money(item.amountCentavos)}</strong>
          </div>
        ))}
        {invoice.adjustments.map((item) => (
          <div className="amount-row" key={item.id}>
            <span>Adjustment: {item.reason}</span>
            <strong>{money(item.amountCentavos)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SubscriberBillingPanel({
  subscriberId,
  mode,
}: {
  subscriberId: string;
  mode: 'billing' | 'ledger';
}) {
  const [invoices, setInvoices] = useState<InvoiceSummaryDto[]>([]);
  const [ledger, setLedger] = useState<LedgerEntryDto[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  async function loadLedger(nextFrom = from, nextTo = to) {
    if (!window.bcis) return;
    try {
      setError('');
      setLedger(
        await window.bcis.billing.ledger(
          subscriberId,
          nextFrom || undefined,
          nextTo || undefined,
        ),
      );
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }
  useEffect(() => {
    const request =
      mode === 'billing'
        ? window.bcis?.billing
            .listInvoices({ q: '', page: 1, pageSize: 100, subscriberId })
            .then((result) => setInvoices(result.items))
        : window.bcis?.billing.ledger(subscriberId).then(setLedger);
    void request?.catch((caught) => setError(errorMessage(caught)));
  }, [mode, subscriberId]);
  if (error) return <div className="form-error">{error}</div>;
  if (mode === 'billing')
    return (
      <section className="data-card detail-list">
        {invoices.map((invoice) => (
          <div className="amount-row" key={invoice.id}>
            <span>
              <strong>{invoice.invoiceNumber}</strong>
              <small>
                {invoice.billingPeriodLabel} · {invoice.status}
              </small>
            </span>
            <strong>{money(invoice.balanceCentavos)}</strong>
          </div>
        ))}
        {!invoices.length ? (
          <div className="empty-state">No invoices for this subscriber.</div>
        ) : null}
      </section>
    );
  return (
    <section className="data-card soa-sheet">
      <div className="card-heading">
        <div>
          <span>Statement of Account</span>
          <h2>Subscriber ledger</h2>
        </div>
        <button className="table-action" onClick={() => window.print()}>
          Print SOA
        </button>
      </div>
      <form
        className="soa-filters"
        onSubmit={(event) => {
          event.preventDefault();
          void loadLedger();
        }}
      >
        <label>
          From
          <input
            max={to || undefined}
            onChange={(event) => setFrom(event.target.value)}
            type="date"
            value={from}
          />
        </label>
        <label>
          To
          <input
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
            type="date"
            value={to}
          />
        </label>
        <button className="table-action" type="submit">
          Apply range
        </button>
      </form>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Reference</th>
              <th>Description</th>
              <th>Debit</th>
              <th>Credit</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((entry) => (
              <tr key={entry.id}>
                <td>{new Date(entry.occurredAt).toLocaleDateString()}</td>
                <td>{entry.reference}</td>
                <td>{entry.description}</td>
                <td>
                  {entry.debitCentavos ? money(entry.debitCentavos) : '—'}
                </td>
                <td>
                  {entry.creditCentavos ? money(entry.creditCentavos) : '—'}
                </td>
                <td>{money(entry.balanceCentavos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!ledger.length ? (
        <div className="empty-state">No posted ledger entries.</div>
      ) : null}
    </section>
  );
}
