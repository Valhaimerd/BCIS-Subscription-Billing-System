import type {
  BillingCycleDto,
  BillingEligibilityDto,
  InvoiceDetailDto,
  InvoiceSummaryDto,
  LedgerEntryDto,
} from '@bcis/contracts';
import { useEffect, useRef, useState } from 'react';

import { ActionDialog } from './ActionDialog';
import { ModalDialog } from './ModalDialog';
import './billing-journey.css';

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

export function BillingView({
  canGenerate,
  onOpenReceipt,
}: {
  canGenerate: boolean;
  onOpenReceipt?: ((receiptNumber: string) => void) | undefined;
}) {
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
  const [page, setPage] = useState(1);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(currentPeriod());
  const [step, setStep] = useState(0);
  const [eligibility, setEligibility] = useState<BillingEligibilityDto | null>(
    null,
  );
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const loadRequest = useRef(0);
  const invoiceRequest = useRef(0);
  const eligibilityRequest = useRef(0);
  const generatingGuard = useRef(false);
  const [periodYear, periodMonth] = period.split('-').map(Number);
  const activeCycle = cycles.find(
    (cycle) =>
      cycle.periodYear === periodYear && cycle.periodMonth === periodMonth,
  );

  async function load(nextQuery = query, nextPage = page) {
    const request = ++loadRequest.current;
    if (!window.bcis) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const cycleRows = await window.bcis.billing.listCycles();
      const selectedCycle = cycleRows.find(
        (cycle) =>
          `${cycle.periodYear}-${String(cycle.periodMonth).padStart(2, '0')}` ===
          period,
      );
      const invoiceRows = selectedCycle
        ? await window.bcis.billing.listInvoices({
            q: nextQuery,
            page: nextPage,
            pageSize: 50,
            billingCycleId: selectedCycle.id,
          })
        : { items: [] as InvoiceSummaryDto[], total: 0 };
      if (request !== loadRequest.current) return;
      setCycles(cycleRows);
      setInvoices(invoiceRows.items);
      setInvoiceTotal(invoiceRows.total);
      setPage(nextPage);
    } catch (caught) {
      if (request === loadRequest.current) setError(errorMessage(caught));
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load('', 1);
  }, [period]);

  useEffect(() => {
    const request = ++eligibilityRequest.current;
    if (!window.bcis?.billing.eligibility) return;
    setEligibility(null);
    setEligibilityLoading(true);
    void window.bcis.billing
      .eligibility(periodYear!, periodMonth!)
      .then((result) => {
        if (request === eligibilityRequest.current) setEligibility(result);
      })
      .catch((caught) => {
        if (request === eligibilityRequest.current)
          setError(errorMessage(caught));
      })
      .finally(() => {
        if (request === eligibilityRequest.current)
          setEligibilityLoading(false);
      });
    return () => {
      eligibilityRequest.current += 1;
    };
  }, [period]);

  async function generate() {
    if (generatingGuard.current) return;
    generatingGuard.current = true;
    setGenerating(true);
    setError('');
    setNotice('');
    try {
      const result = await window.bcis!.billing.generate(
        periodYear!,
        periodMonth!,
      );
      setNotice(
        `${result.created} draft invoices created; ${result.skipped} already existed.`,
      );
      await load();
      setStep(2);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      generatingGuard.current = false;
      setGenerating(false);
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
      setStep(0);
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
      <section
        className="billing-hero data-card"
        aria-label="Selected billing month"
      >
        <div className="billing-hero-copy">
          <span className="section-kicker">Billing run</span>
          <h2>{periodLabel(periodYear!, periodMonth!)}</h2>
          <p>
            {activeCycle?.status === 'FINALIZED'
              ? 'Posted to subscriber ledgers. This run is part of financial history.'
              : activeCycle?.status === 'DRAFT'
                ? 'Drafts are ready for review before posting.'
                : 'Choose a month to prepare charges for active services.'}
          </p>
          {activeCycle?.finalizedAt ? (
            <p className="billing-posted-date">
              Posted {new Date(activeCycle.finalizedAt).toLocaleString('en-PH')}
            </p>
          ) : null}
          <div className="billing-hero-metrics">
            <div>
              <span>Run state</span>
              <strong>{activeCycle?.status ?? 'Not started'}</strong>
            </div>
            <div>
              <span>
                {activeCycle?.status === 'FINALIZED'
                  ? 'Eligible now · live'
                  : 'Eligible services'}
              </span>
              <strong>
                {eligibilityLoading
                  ? '…'
                  : (eligibility?.eligibleServices ?? '—')}
              </strong>
            </div>
            <div>
              <span>Invoices</span>
              <strong>{activeCycle?.invoiceCount ?? 0}</strong>
            </div>
            <div>
              <span>Run total</span>
              <strong>{money(activeCycle?.totalCentavos ?? 0)}</strong>
            </div>
          </div>
        </div>
        <div className="billing-hero-action">
          <label htmlFor="billing-month">Billing month</label>
          <input
            id="billing-month"
            onChange={(event) => {
              setPeriod(event.target.value);
              setStep(0);
              setQuery('');
              setError('');
            }}
            type="month"
            value={period}
          />
          {canGenerate && activeCycle?.status !== 'FINALIZED' ? (
            <button
              className="primary-action"
              onClick={() => setStep(activeCycle ? 2 : 1)}
              type="button"
            >
              {activeCycle ? 'Review draft run' : 'Prepare billing'}
            </button>
          ) : null}
        </div>
      </section>
      {canGenerate && step > 0 && activeCycle?.status !== 'FINALIZED' ? (
        <section
          aria-label="Generate billing"
          className="billing-flow data-card"
        >
          <div className="billing-flow-heading">
            <div>
              <span className="section-kicker">Guided billing</span>
              <h2>{step === 1 ? 'Review eligibility' : 'Review draft run'}</h2>
            </div>
            <button onClick={() => setStep(0)} type="button">
              Close flow
            </button>
          </div>
          <ol className="billing-flow-steps" aria-label="Billing steps">
            {[
              'Select month',
              'Eligibility',
              'Generate drafts',
              'Review and post',
            ].map((label, index) => (
              <li
                className={index <= (step === 1 ? 1 : 3) ? 'is-current' : ''}
                key={label}
              >
                <span>{index + 1}</span>
                {label}
              </li>
            ))}
          </ol>
          {step === 1 ? (
            <div className="billing-flow-body">
              <h3>Services for {periodLabel(periodYear!, periodMonth!)}</h3>
              <p>
                Active services with a billing start date on or before the last
                day of this month are eligible. Counts are a live preview;
                generation checks again when you continue.
              </p>
              {eligibilityLoading ? (
                <p role="status">Checking service eligibility…</p>
              ) : eligibility ? (
                <>
                  <div className="billing-eligibility-grid">
                    <div>
                      <span>Eligible services</span>
                      <strong>{eligibility.eligibleServices}</strong>
                    </div>
                    <div>
                      <span>Already invoiced</span>
                      <strong>{eligibility.existingInvoices}</strong>
                    </div>
                    <div>
                      <span>New drafts expected</span>
                      <strong>{eligibility.remainingServices}</strong>
                      <small>
                        {money(eligibility.estimatedNewCentavos)} estimated
                      </small>
                    </div>
                  </div>
                  {eligibility.inactiveServices > 0 ||
                  eligibility.futureStartServices > 0 ? (
                    <div className="billing-exceptions">
                      <strong>Not included this month</strong>
                      <p>
                        {eligibility.inactiveServices} inactive service
                        {eligibility.inactiveServices === 1 ? '' : 's'} ·{' '}
                        {eligibility.futureStartServices} future start
                        {eligibility.futureStartServices === 1 ? '' : 's'}
                      </p>
                    </div>
                  ) : null}
                  <div className="billing-flow-actions">
                    <button onClick={() => setStep(0)} type="button">
                      Back to month
                    </button>
                    <button
                      className="primary-action"
                      disabled={
                        generating || eligibility.cycleStatus === 'FINALIZED'
                      }
                      onClick={() => void generate()}
                      type="button"
                    >
                      {generating ? 'Generating…' : 'Generate drafts'}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div className="billing-flow-body">
              {activeCycle ? (
                <>
                  <h3>
                    {activeCycle.invoiceCount} draft invoices ready for review
                  </h3>
                  <p>
                    Review the count and total, then open invoices below for
                    line details. Posting adds ledger debits and cannot be
                    undone; later corrections use linked adjustments or void
                    records.
                  </p>
                  <div className="billing-eligibility-grid">
                    <div>
                      <span>Draft invoices</span>
                      <strong>{activeCycle.invoiceCount}</strong>
                    </div>
                    <div>
                      <span>Total to post</span>
                      <strong>{money(activeCycle.totalCentavos)}</strong>
                    </div>
                    <div>
                      <span>Period</span>
                      <strong>{periodLabel(periodYear!, periodMonth!)}</strong>
                    </div>
                  </div>
                  {activeCycle.invoiceCount === 0 ? (
                    <div className="billing-exceptions">
                      No eligible services produced invoices for this period.
                    </div>
                  ) : null}
                  <div className="billing-flow-actions">
                    <button onClick={() => setStep(1)} type="button">
                      Review eligibility
                    </button>
                    <button onClick={() => setShowRegister(true)} type="button">
                      View invoice register
                    </button>
                    <button
                      className="primary-action"
                      disabled={!activeCycle.invoiceCount}
                      onClick={() => setConfirmCycle(activeCycle)}
                      type="button"
                    >
                      Review and finalize
                    </button>
                  </div>
                </>
              ) : (
                <p role="status">Refreshing draft run…</p>
              )}
            </div>
          )}
        </section>
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
      <section
        aria-busy={loading}
        className="billing-months"
        aria-label="Other billing months"
      >
        <div className="billing-section-heading">
          <div>
            <span className="section-kicker">History</span>
            <h2>Billing months</h2>
          </div>
          <span>{cycles.length} runs</span>
        </div>
        <div className="billing-month-grid">
          {cycles
            .filter((cycle) => cycle.id !== activeCycle?.id)
            .map((cycle) => (
              <button
                className="billing-month-card"
                key={cycle.id}
                onClick={() => {
                  setPeriod(
                    `${cycle.periodYear}-${String(cycle.periodMonth).padStart(2, '0')}`,
                  );
                  setStep(0);
                  setQuery('');
                }}
                type="button"
              >
                <span
                  className={`record-status ${cycle.status === 'FINALIZED' ? 'active' : ''}`}
                >
                  {cycle.status === 'FINALIZED' ? 'Posted' : 'Draft'}
                </span>
                <strong>
                  {periodLabel(cycle.periodYear, cycle.periodMonth)}
                </strong>
                <span>
                  {cycle.invoiceCount} invoices · {money(cycle.totalCentavos)}
                </span>
                <small>Open month →</small>
              </button>
            ))}
          {!loading && !cycles.length ? (
            <p className="empty-state">
              No billing runs yet. Select a month above to begin.
            </p>
          ) : null}
        </div>
      </section>
      <section aria-busy={loading} className="data-card table-card">
        <div className="card-heading">
          <div>
            <span>Invoice register</span>
            <h2>Invoices</h2>
          </div>
          <button
            onClick={() => setShowRegister((value) => !value)}
            type="button"
          >
            {showRegister ? 'Hide register' : 'Open register'}
          </button>
        </div>
        {showRegister ? (
          <>
            <form
              className="list-search"
              onSubmit={(event) => {
                event.preventDefault();
                void load(query, 1);
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
            {invoiceTotal > 0 ? (
              <div className="billing-register-pages">
                <span>
                  {Math.min((page - 1) * 50 + 1, invoiceTotal)}–
                  {Math.min(page * 50, invoiceTotal)} of {invoiceTotal} invoices
                </span>
                <div>
                  <button
                    disabled={loading || page === 1}
                    onClick={() => void load(query, page - 1)}
                    type="button"
                  >
                    Previous
                  </button>
                  <button
                    disabled={loading || page * 50 >= invoiceTotal}
                    onClick={() => void load(query, page + 1)}
                    type="button"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="billing-invoice-preview">
            {invoices.slice(0, 4).map((invoice) => (
              <button
                className="billing-invoice-card"
                key={invoice.id}
                onClick={() => void open(invoice)}
                type="button"
              >
                <span>
                  <strong>{invoice.subscriberName}</strong>
                  <small>
                    {invoice.invoiceNumber} · {invoice.billingPeriodLabel}
                  </small>
                </span>
                <span>
                  <strong>{money(invoice.balanceCentavos)}</strong>
                  <small>{invoice.status}</small>
                </span>
              </button>
            ))}
            {!loading && !invoices.length ? <p>No invoices yet.</p> : null}
          </div>
        )}
      </section>
      {selected ? (
        <ModalDialog
          ariaLabel="Invoice detail"
          onClose={() => setSelected(null)}
        >
          <InvoicePanel
            invoice={selected}
            canGenerate={canGenerate}
            onOpenReceipt={onOpenReceipt}
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
  onOpenReceipt,
  onVoid,
}: {
  invoice: InvoiceDetailDto;
  canGenerate: boolean;
  onAdjust: () => void;
  onClose: () => void;
  onOpenReceipt?: ((receiptNumber: string) => void) | undefined;
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
        <div>
          <dt>Original total</dt>
          <dd>{money(invoice.totalCentavos)}</dd>
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
        {invoice.allocations?.map((allocation) => (
          <div className="amount-row" key={allocation.id}>
            <span>
              {allocation.status === 'REVERSED'
                ? 'Reversed payment'
                : 'Payment'}{' '}
              on {new Date(allocation.paymentDate).toLocaleDateString('en-PH')}
              {allocation.receiptNumber ? ` · ${allocation.receiptNumber}` : ''}
            </span>
            <strong>
              {allocation.status === 'REVERSED'
                ? 'Reversed'
                : `−${money(allocation.amountCentavos)}`}
            </strong>
            {allocation.receiptNumber && onOpenReceipt ? (
              <button
                className="table-action"
                onClick={() => onOpenReceipt(allocation.receiptNumber!)}
                type="button"
              >
                Open receipt
              </button>
            ) : null}
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
