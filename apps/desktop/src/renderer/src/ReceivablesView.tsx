import type {
  DelinquencySettingsDto,
  ReceivableDetailDto,
  ReceivableSummaryDto,
  ReferenceItemDto,
  ServiceControlHistoryDto,
} from '@bcis/contracts';
import { useEffect, useRef, useState } from 'react';

import { ModalDialog } from './ModalDialog';
import './receivable-journey.css';

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const PAGE_SIZE = 12;
const money = (value: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
    value / 100,
  );
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The request could not be completed.';
const ageLabels: Record<string, string> = {
  CURRENT: 'Current',
  '1_30': '1–30 days',
  '31_60': '31–60 days',
  '61_90': '61–90 days',
  '90_PLUS': '90+ days',
};
type Queue = 'ACT_TODAY' | 'DUE_SOON' | 'ALL';
type Filters = {
  q: string;
  collectorId: string;
  areaId: string;
  planId: string;
  serviceTypeCode: string;
  agingBucket: string;
};
const emptyFilters: Filters = {
  q: '',
  collectorId: '',
  areaId: '',
  planId: '',
  serviceTypeCode: '',
  agingBucket: '',
};

export function ReceivablesView({
  canManage,
  canManageSettings = false,
  canViewBilling = false,
}: {
  canManage: boolean;
  canManageSettings?: boolean;
  canViewBilling?: boolean;
}) {
  const [date, setDate] = useState(today);
  const [snapshotDate, setSnapshotDate] = useState(today);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(emptyFilters);
  const [queue, setQueue] = useState<Queue>('ACT_TODAY');
  const [summary, setSummary] = useState<ReceivableSummaryDto | null>(null);
  const [rows, setRows] = useState<ReceivableDetailDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ReceivableDetailDto | null>(null);
  const [history, setHistory] = useState<ServiceControlHistoryDto | null>(null);
  const [settings, setSettings] = useState<DelinquencySettingsDto | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [invoice, setInvoice] = useState<Awaited<
    ReturnType<NonNullable<typeof window.bcis>['billing']['getInvoice']>
  > | null>(null);
  const [ledger, setLedger] = useState<Awaited<
    ReturnType<NonNullable<typeof window.bcis>['billing']['ledger']>
  > | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    'suspend' | 'request' | null
  >(null);
  const [completionTarget, setCompletionTarget] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [caseError, setCaseError] = useState('');
  const loadSequence = useRef(0);
  const caseSequence = useRef(0);
  const [references, setReferences] = useState<{
    collectors: ReferenceItemDto[];
    collectionAreas: ReferenceItemDto[];
    plans: ReferenceItemDto[];
    serviceTypes: ReferenceItemDto[];
  }>({ collectors: [], collectionAreas: [], plans: [], serviceTypes: [] });

  async function load(
    targetPage = 1,
    targetDate = snapshotDate,
    targetFilters = appliedFilters,
    targetQueue = queue,
    append = false,
  ) {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError('');
    const query = { ...targetFilters, asOf: targetDate };
    try {
      const [nextSummary, result] = await Promise.all([
        window.bcis!.receivables.summary(query),
        window.bcis!.receivables.list({
          ...query,
          queue: targetQueue,
          page: targetPage,
          pageSize: PAGE_SIZE,
        }),
      ]);
      if (sequence !== loadSequence.current) return;
      setSummary(nextSummary);
      setRows((current) =>
        append ? [...current, ...result.items] : result.items,
      );
      setTotal(result.total);
      setPage(result.page);
      setSnapshotDate(targetDate);
      setAppliedFilters(targetFilters);
      setQueue(targetQueue);
    } catch (caught) {
      if (sequence === loadSequence.current) setError(message(caught));
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (!window.bcis) return;
    void load(1, today(), emptyFilters, 'ACT_TODAY');
    void window.bcis.masterData
      .references()
      .then(setReferences)
      .catch((caught: unknown) => setError(message(caught)));
    void window.bcis.receivables
      .settings()
      .then(setSettings)
      .catch((caught: unknown) => setError(message(caught)));
    return () => {
      loadSequence.current += 1;
      caseSequence.current += 1;
    };
  }, []);

  async function open(row: ReceivableDetailDto) {
    const sequence = ++caseSequence.current;
    setSelected(row);
    setHistory(null);
    setInvoice(null);
    setLedger(null);
    setConfirmAction(null);
    setCompletionTarget(null);
    setError('');
    setCaseError('');
    try {
      const next = await window.bcis!.receivables.history(row.serviceAccountId);
      if (sequence === caseSequence.current) setHistory(next);
    } catch (caught) {
      if (sequence === caseSequence.current) setCaseError(message(caught));
    }
  }

  async function refreshCase(serviceAccountId: string) {
    await load(1, snapshotDate, appliedFilters, queue);
    const next = await window.bcis!.receivables.history(serviceAccountId);
    setHistory(next);
    setSelected((current) =>
      current?.serviceAccountId === serviceAccountId
        ? { ...current, serviceStatus: next.status, suspensionCandidate: false }
        : current,
    );
  }

  async function openInvoice(row: ReceivableDetailDto) {
    if (!row.oldestUnpaidInvoiceId) return;
    const sequence = caseSequence.current;
    try {
      const detail = await window.bcis!.billing.getInvoice(
        row.oldestUnpaidInvoiceId,
      );
      if (sequence === caseSequence.current) setInvoice(detail);
    } catch (caught) {
      if (sequence === caseSequence.current) setError(message(caught));
    }
  }

  async function openLedger(row: ReceivableDetailDto) {
    const sequence = caseSequence.current;
    try {
      const entries = await window.bcis!.billing.ledger(
        row.subscriberId,
        row.oldestDueDate < snapshotDate ? row.oldestDueDate : undefined,
        snapshotDate,
      );
      if (sequence === caseSequence.current) setLedger(entries);
    } catch (caught) {
      if (sequence === caseSequence.current) setError(message(caught));
    }
  }

  async function perform(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !confirmAction) return;
    const data = new FormData(event.currentTarget);
    setError('');
    try {
      if (confirmAction === 'suspend') {
        await window.bcis!.receivables.suspend(selected.serviceAccountId, {
          effectiveDate: String(data.get('date')),
          reason: String(data.get('reason')),
          notes: String(data.get('notes')) || undefined,
        });
        setNotice('Suspension recorded in the service history.');
      } else {
        await window.bcis!.receivables.requestReconnection(
          selected.serviceAccountId,
          {
            requestDate: String(data.get('date')),
            technician: String(data.get('technician')),
            reason: String(data.get('reason')),
            notes: String(data.get('notes')) || undefined,
          },
        );
        setNotice('Reconnection request recorded.');
      }
      setConfirmAction(null);
      await refreshCase(selected.serviceAccountId);
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function complete(id: string) {
    if (!selected) return;
    setError('');
    try {
      await window.bcis!.receivables.completeReconnection(id, {
        completionDate: today(),
      });
      setNotice('Reconnection completed and service restored.');
      setCompletionTarget(null);
      await refreshCase(selected.serviceAccountId);
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function savePolicy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSavingPolicy(true);
    setError('');
    try {
      setSettings(
        await window.bcis!.receivables.updateSettings({
          gracePeriodDays: Number(data.get('gracePeriodDays')),
          suspensionThresholdDays: Number(data.get('suspensionThresholdDays')),
          reconnectionFeeCentavos: Math.round(
            Number(data.get('reconnectionFee')) * 100,
          ),
        }),
      );
      setNotice('Delinquency policy saved and audited.');
    } catch (caught) {
      setError(message(caught));
    } finally {
      setSavingPolicy(false);
    }
  }

  const canAct = canManage && snapshotDate === today();
  const counts = summary?.caseCounts;
  const queueTabs: { key: Queue; title: string; count: number }[] = [
    { key: 'ACT_TODAY', title: 'Act today', count: counts?.actToday ?? 0 },
    { key: 'DUE_SOON', title: 'Due soon', count: counts?.dueSoon ?? 0 },
    { key: 'ALL', title: 'All cases', count: counts?.all ?? 0 },
  ];

  return (
    <div className="receivable-desk">
      {notice && (
        <div className="success-notice" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <header className="receivable-hero">
        <div>
          <span className="eyebrow">Receivables · {snapshotDate}</span>
          <h2>Follow-up desk</h2>
          <p>
            Start with the accounts that need attention. Open a case to see the
            balance, evidence, and next permitted step.
          </p>
        </div>
        <div className="receivable-date-actions">
          <label>
            Balance date
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <button
            className="primary-action"
            type="button"
            disabled={loading || !date}
            onClick={() => void load(1, date, appliedFilters, queue)}
          >
            Apply date
          </button>
        </div>
      </header>

      <section
        className="receivable-snapshot"
        aria-label="Receivables snapshot"
      >
        <div className="snapshot-figure">
          <span>Overdue balance</span>
          <strong>{summary ? money(summary.overdueCentavos) : '—'}</strong>
          <small>{summary?.overdueSubscribers ?? '—'} subscribers</small>
        </div>
        <div className="snapshot-figure">
          <span>Follow-up cases</span>
          <strong>{summary?.followUpAccounts ?? '—'}</strong>
          <small>Past the grace period</small>
        </div>
        <div className="snapshot-figure">
          <span>Eligible for suspension</span>
          <strong>{summary?.suspensionCandidates ?? '—'}</strong>
          <small>Requires review and approval</small>
        </div>
        <div className="snapshot-figure">
          <span>Total outstanding</span>
          <strong>{summary ? money(summary.totalCentavos) : '—'}</strong>
          <small>
            Including {summary ? money(summary.currentCentavos) : '—'} current
          </small>
        </div>
      </section>

      <section className="receivable-aging" aria-label="Aging distribution">
        <div className="receivable-section-title">
          <div>
            <span className="eyebrow">Where balances sit</span>
            <h3>Aging at a glance</h3>
          </div>
          <span>Click a range to focus every figure and case</span>
        </div>
        <div className="aging-visual">
          {summary &&
            Object.entries(summary.buckets).map(([bucket, amount]) => {
              const width = summary.totalCentavos
                ? Math.max(3, (amount / summary.totalCentavos) * 100)
                : 3;
              return (
                <button
                  key={bucket}
                  type="button"
                  aria-pressed={appliedFilters.agingBucket === bucket}
                  className="aging-tile"
                  onClick={() => {
                    const next = {
                      ...appliedFilters,
                      agingBucket:
                        appliedFilters.agingBucket === bucket ? '' : bucket,
                    };
                    setFilters(next);
                    void load(1, snapshotDate, next, queue);
                  }}
                >
                  <span>{ageLabels[bucket]}</span>
                  <strong>{money(amount)}</strong>
                  <small>
                    {summary.bucketCounts?.[
                      bucket as keyof NonNullable<typeof summary.bucketCounts>
                    ] ?? '—'}{' '}
                    accounts
                  </small>
                  <i style={{ width: `${width}%` }} />
                </button>
              );
            })}
        </div>
      </section>

      <section className="receivable-cases" aria-busy={loading}>
        <div className="receivable-section-title">
          <div>
            <span className="eyebrow">Case queue</span>
            <h3>Choose the next account</h3>
          </div>
          <button
            className="filter-toggle"
            type="button"
            aria-expanded={showFilters}
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? 'Hide filters' : 'Search & filters'}
          </button>
        </div>
        <div className="queue-tabs" role="tablist" aria-label="Case priority">
          {queueTabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={queue === tab.key}
              type="button"
              onClick={() =>
                void load(1, snapshotDate, appliedFilters, tab.key)
              }
            >
              {tab.title}
              <strong>{tab.count}</strong>
            </button>
          ))}
        </div>
        {showFilters && (
          <form
            className="receivable-filters"
            onSubmit={(event) => {
              event.preventDefault();
              void load(1, snapshotDate, filters, queue);
            }}
          >
            <label className="filter-search">
              Find a subscriber or service
              <input
                value={filters.q}
                placeholder="Name or account number"
                onChange={(event) =>
                  setFilters({ ...filters, q: event.target.value })
                }
              />
            </label>
            {(
              [
                ['collectorId', 'Collector', references.collectors],
                ['areaId', 'Area', references.collectionAreas],
                ['planId', 'Plan', references.plans],
              ] as const
            ).map(([key, label, options]) => (
              <label key={key}>
                {label}
                <select
                  value={filters[key]}
                  onChange={(event) =>
                    setFilters({ ...filters, [key]: event.target.value })
                  }
                >
                  <option value="">All {label.toLowerCase()}s</option>
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label>
              Service
              <select
                value={filters.serviceTypeCode}
                onChange={(event) =>
                  setFilters({
                    ...filters,
                    serviceTypeCode: event.target.value,
                  })
                }
              >
                <option value="">All services</option>
                {references.serviceTypes.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="filter-actions">
              <button className="primary-action" type="submit">
                Apply filters
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilters(emptyFilters);
                  void load(1, snapshotDate, emptyFilters, queue);
                }}
              >
                Clear
              </button>
            </div>
          </form>
        )}
        {loading && (
          <p role="status" className="receivable-loading">
            Updating cases…
          </p>
        )}
        {!loading && !rows.length && (
          <div className="empty-state">
            <strong>No cases in this view</strong>
            <span>Choose another priority or clear the filters.</span>
          </div>
        )}
        <div className="case-grid">
          {rows.map((row) => {
            const days = Math.round(
              (Date.parse(`${snapshotDate}T00:00:00Z`) -
                Date.parse(`${row.oldestDueDate}T00:00:00Z`)) /
                86_400_000,
            );
            const reason =
              row.serviceStatus === 'SUSPENDED' &&
              row.totalArrearsCentavos === 0
                ? 'Ready for reconnection review'
                : row.suspensionCandidate
                  ? 'Suspension threshold reached'
                  : row.followUp
                    ? 'Follow-up due'
                    : days > 0
                      ? 'Overdue in grace period'
                      : days >= -7
                        ? 'Due within 7 days'
                        : 'Current balance';
            return (
              <article className="case-card" key={row.serviceAccountId}>
                <div className="case-top">
                  <span className="case-avatar" aria-hidden="true">
                    {row.subscriberName.slice(0, 1)}
                  </span>
                  <div>
                    <h4>{row.subscriberName}</h4>
                    <small>
                      {row.serviceAccountNumber} · {row.planName}
                    </small>
                  </div>
                  <span
                    className={`case-state ${row.suspensionCandidate ? 'urgent' : row.followUp ? 'attention' : ''}`}
                  >
                    {reason}
                  </span>
                </div>
                <div className="case-facts">
                  <div>
                    <span>Overdue</span>
                    <strong>{money(row.totalArrearsCentavos)}</strong>
                  </div>
                  <div>
                    <span>Oldest due</span>
                    <strong>{row.oldestDueDate}</strong>
                  </div>
                </div>
                <p className="case-context">
                  {row.collectionAreaName ?? 'No area'} ·{' '}
                  {row.collectorName ?? 'No collector'} · Last payment{' '}
                  {row.lastPaymentAt?.slice(0, 10) ?? 'not recorded'}
                </p>
                <button
                  className="case-open"
                  type="button"
                  onClick={() => void open(row)}
                >
                  Review case <span aria-hidden="true">→</span>
                </button>
              </article>
            );
          })}
        </div>
        {rows.length < total && (
          <button
            className="load-cases"
            type="button"
            disabled={loading}
            onClick={() =>
              void load(page + 1, snapshotDate, appliedFilters, queue, true)
            }
          >
            Show more cases{' '}
            <span>
              {rows.length} of {total}
            </span>
          </button>
        )}
      </section>

      {canManageSettings && settings ? (
        <details className="policy-settings-card">
          <summary>
            <div>
              <span className="eyebrow">Owner settings</span>
              <strong>Delinquency policy</strong>
              <small>
                {settings.gracePeriodDays}-day grace ·{' '}
                {settings.suspensionThresholdDays}-day suspension threshold ·{' '}
                {money(settings.reconnectionFeeCentavos)} reconnection fee
              </small>
            </div>
            <span className="policy-settings-toggle">Adjust policy</span>
          </summary>
          <form className="policy-settings-form" onSubmit={savePolicy}>
            <label>
              Grace period (days)
              <input
                key={`policy-grace-${settings.gracePeriodDays}`}
                type="number"
                name="gracePeriodDays"
                min="0"
                max="365"
                required
                defaultValue={settings.gracePeriodDays}
              />
            </label>
            <label>
              Suspension threshold (days)
              <input
                key={`policy-threshold-${settings.suspensionThresholdDays}`}
                type="number"
                name="suspensionThresholdDays"
                min="1"
                max="730"
                required
                defaultValue={settings.suspensionThresholdDays}
              />
            </label>
            <label>
              Reconnection fee (PHP)
              <input
                key={`policy-fee-${settings.reconnectionFeeCentavos}`}
                type="number"
                name="reconnectionFee"
                min="0"
                step="0.01"
                required
                defaultValue={(settings.reconnectionFeeCentavos / 100).toFixed(
                  2,
                )}
              />
            </label>
            <button
              className="primary-action"
              disabled={savingPolicy}
              type="submit"
            >
              {savingPolicy ? 'Saving…' : 'Save policy'}
            </button>
          </form>
        </details>
      ) : null}

      {selected && (
        <ModalDialog
          ariaLabel="Receivable case"
          onClose={() => {
            caseSequence.current += 1;
            setSelected(null);
            setHistory(null);
            setConfirmAction(null);
          }}
        >
          <div className="case-sheet">
            <header>
              <div>
                <span className="eyebrow">
                  Case · {selected.serviceAccountNumber}
                </span>
                <h2>{selected.subscriberName}</h2>
                <p>
                  {selected.planName} ·{' '}
                  {selected.collectionAreaName ?? 'No area'} ·{' '}
                  {selected.collectorName ?? 'No collector'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  caseSequence.current += 1;
                  setSelected(null);
                  setHistory(null);
                }}
              >
                Close
              </button>
            </header>
            {!history ? (
              caseError ? (
                <div className="form-error" role="alert">
                  {caseError}{' '}
                  <button type="button" onClick={() => void open(selected)}>
                    Retry case
                  </button>
                </div>
              ) : (
                <p role="status">Loading service history…</p>
              )
            ) : (
              <>
                <div className="case-sheet-amount">
                  <span>Outstanding balance</span>
                  <strong>{money(selected.totalOutstandingCentavos)}</strong>
                  <small>
                    {money(selected.totalArrearsCentavos)} overdue · snapshot{' '}
                    {snapshotDate}
                  </small>
                </div>
                <div className="case-sheet-grid">
                  <div>
                    <span>Oldest invoice</span>
                    <strong>{selected.oldestUnpaidInvoice}</strong>
                    <small>Due {selected.oldestDueDate}</small>
                    {canViewBilling && selected.oldestUnpaidInvoiceId && (
                      <button
                        type="button"
                        onClick={() => void openInvoice(selected)}
                      >
                        View invoice details
                      </button>
                    )}
                  </div>
                  <div>
                    <span>Last payment</span>
                    <strong>
                      {selected.lastPaymentAt?.slice(0, 10) ?? 'None recorded'}
                    </strong>
                    <small>From posted payment history</small>
                    {canViewBilling && (
                      <button
                        type="button"
                        onClick={() => void openLedger(selected)}
                      >
                        View ledger entries
                      </button>
                    )}
                  </div>
                  <div>
                    <span>Service state</span>
                    <strong>{history.status}</strong>
                    <small>{selected.subscriberAccountNumber}</small>
                  </div>
                  <div>
                    <span>Policy basis</span>
                    <strong>
                      {settings
                        ? `${settings.gracePeriodDays}-day grace · ${settings.suspensionThresholdDays}-day threshold`
                        : 'Loading policy'}
                    </strong>
                    <small>
                      {selected.suspensionCandidate
                        ? 'Threshold met'
                        : selected.followUp
                          ? 'Follow-up eligible'
                          : 'No control action due'}
                    </small>
                  </div>
                </div>
                {invoice && (
                  <div className="case-evidence">
                    <strong>Invoice {invoice.invoiceNumber}</strong>
                    <p>
                      Issued {invoice.invoiceDate} · Due {invoice.dueDate} ·{' '}
                      {money(invoice.totalCentavos)}
                    </p>
                    <button type="button" onClick={() => setInvoice(null)}>
                      Hide invoice
                    </button>
                  </div>
                )}
                {ledger && (
                  <div className="case-evidence">
                    <strong>Subscriber ledger · through {snapshotDate}</strong>
                    {ledger.length ? (
                      <ol>
                        {ledger
                          .slice(-8)
                          .reverse()
                          .map((entry) => (
                            <li key={entry.id}>
                              {entry.occurredAt.slice(0, 10)} ·{' '}
                              {entry.reference} · {entry.description} · Debit{' '}
                              {money(entry.debitCentavos)} / Credit{' '}
                              {money(entry.creditCentavos)}
                            </li>
                          ))}
                      </ol>
                    ) : (
                      <p>No ledger entries in this period.</p>
                    )}
                    <button type="button" onClick={() => setLedger(null)}>
                      Hide ledger
                    </button>
                  </div>
                )}
                <details className="case-history">
                  <summary>
                    Service history · {history.events.length} events
                  </summary>
                  {history.events.length ? (
                    <ol>
                      {history.events.map((item) => (
                        <li key={item.id}>
                          <time>{item.createdAt.slice(0, 10)}</time>
                          <strong>
                            {item.previousStatus ?? 'Created'} →{' '}
                            {item.newStatus}
                          </strong>
                          <span>{item.reason}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p>No service changes recorded.</p>
                  )}
                </details>
                <details className="case-history">
                  <summary>Suspensions and reconnections</summary>
                  {history.suspensions.map((item) => (
                    <p key={item.id}>
                      Suspended {item.effectiveDate} · {item.reason}
                    </p>
                  ))}
                  {history.reconnections.map((item) => (
                    <p key={item.id}>
                      Reconnection {item.requestDate} · {item.status} ·{' '}
                      {item.technician}
                    </p>
                  ))}
                  {!history.suspensions.length &&
                    !history.reconnections.length && (
                      <p>No service-control records.</p>
                    )}
                </details>
                {snapshotDate !== today() && (
                  <p className="case-readonly">
                    Historical snapshots are for review. Apply today’s date to
                    take action.
                  </p>
                )}
                {canAct &&
                  history.reconnections
                    .filter((item) => item.status === 'REQUESTED')
                    .map((item) => (
                      <button
                        key={item.id}
                        className="primary-action"
                        type="button"
                        onClick={() => setCompletionTarget(item.id)}
                      >
                        Complete reconnection
                      </button>
                    ))}
                {completionTarget && (
                  <div className="case-action-form">
                    <h3>Confirm service restoration</h3>
                    <p>
                      Confirm that the technician has restored service.
                      Completion records the configured{' '}
                      {settings
                        ? money(settings.reconnectionFeeCentavos)
                        : 'reconnection'}{' '}
                      fee as an audited adjustment.
                    </p>
                    <div>
                      <button
                        className="primary-action"
                        type="button"
                        onClick={() => void complete(completionTarget)}
                      >
                        Complete and record
                      </button>
                      <button
                        type="button"
                        onClick={() => setCompletionTarget(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {canAct &&
                  selected.serviceStatus === 'ACTIVE' &&
                  selected.suspensionCandidate && (
                    <button
                      className="case-action"
                      type="button"
                      onClick={() => setConfirmAction('suspend')}
                    >
                      Review suspension
                    </button>
                  )}
                {canAct &&
                  selected.serviceStatus === 'SUSPENDED' &&
                  selected.totalArrearsCentavos === 0 &&
                  !history.reconnections.some(
                    (item) => item.status === 'REQUESTED',
                  ) && (
                    <button
                      className="case-action"
                      type="button"
                      onClick={() => setConfirmAction('request')}
                    >
                      Review reconnection request
                    </button>
                  )}
                {confirmAction && (
                  <form className="case-action-form" onSubmit={perform}>
                    <h3>
                      {confirmAction === 'suspend'
                        ? 'Confirm suspension'
                        : 'Confirm reconnection request'}
                    </h3>
                    <p>
                      Review the case evidence and policy before recording this
                      service change.
                    </p>
                    <label>
                      {confirmAction === 'suspend'
                        ? 'Effective date'
                        : 'Request date'}
                      <input
                        required
                        type="date"
                        name="date"
                        defaultValue={today()}
                      />
                    </label>
                    {confirmAction === 'request' && (
                      <label>
                        Technician
                        <input name="technician" required />
                      </label>
                    )}
                    <label>
                      Reason
                      <input
                        name="reason"
                        required
                        minLength={3}
                        defaultValue={
                          confirmAction === 'suspend'
                            ? 'Account exceeded the suspension threshold.'
                            : 'Qualifying payment confirmed.'
                        }
                      />
                    </label>
                    <label>
                      Notes (optional)
                      <textarea name="notes" />
                    </label>
                    <div>
                      <button className="primary-action" type="submit">
                        {confirmAction === 'suspend'
                          ? 'Record suspension'
                          : 'Record request'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmAction(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </ModalDialog>
      )}
    </div>
  );
}
