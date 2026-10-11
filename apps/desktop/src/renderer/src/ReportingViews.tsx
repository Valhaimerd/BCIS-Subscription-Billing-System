import type {
  InvoiceDetailDto,
  PaymentSummaryDto,
  ReportKind,
  ReportQuery,
  ReportResultDto,
  SubscriberProfileDto,
  SubscriberSummaryDto,
} from '@bcis/contracts';
import { useEffect, useRef, useState } from 'react';

import { ModalDialog } from './ModalDialog';
import './report-journey.css';

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const TODAY = today();
const defaults: ReportQuery = {
  from: `${TODAY.slice(0, 7)}-01`,
  to: TODAY,
  asOf: TODAY,
  granularity: 'MONTHLY',
  dimension: 'PLAN',
  q: '',
  page: 1,
  pageSize: 12,
};
const money = (value: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
    value / 100,
  );
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The request could not be completed.';
type Group =
  'Revenue & collection' | 'Subscriber accounts' | 'Controls & audit';
type Question = {
  kind: ReportKind;
  title: string;
  question: string;
  basis: string;
  group: Group;
};
const questions: Question[] = [
  {
    kind: 'COLLECTIONS',
    title: 'Collections',
    question: 'How much did we collect?',
    basis:
      'Posted payments by payment date and method, through the as-of date.',
    group: 'Revenue & collection',
  },
  {
    kind: 'BILLING_COLLECTION',
    title: 'Billed versus collected',
    question: 'Are collections keeping pace with billing?',
    basis:
      'Finalized invoices by invoice date versus posted payments by payment date.',
    group: 'Revenue & collection',
  },
  {
    kind: 'REVENUE',
    title: 'Revenue sources',
    question: 'Which plans, services, or areas brought in revenue?',
    basis:
      'Posted payment allocations in the date range, grouped by the selected dimension.',
    group: 'Revenue & collection',
  },
  {
    kind: 'COLLECTOR_PERFORMANCE',
    title: 'Collector accountability',
    question: 'What was collected and remitted by each collector?',
    basis:
      'Route batches by batch date; posted collections and recorded remittances through as-of.',
    group: 'Revenue & collection',
  },
  {
    kind: 'ADJUSTMENTS_REVERSALS_VOIDS',
    title: 'Financial corrections',
    question: 'Which financial records changed, and why?',
    basis:
      'Dated adjustments, payment reversals, and invoice voids, with actor and reason.',
    group: 'Revenue & collection',
  },
  {
    kind: 'AR_AGING',
    title: 'Receivables aging',
    question: 'Which balances are still outstanding?',
    basis:
      'Finalized, non-void invoice balances and credits at the as-of date.',
    group: 'Subscriber accounts',
  },
  {
    kind: 'SUBSCRIBER_MASTER',
    title: 'Subscriber register',
    question: 'Which subscribers and services are on file?',
    basis: 'Current master records. Date filters do not change this register.',
    group: 'Subscriber accounts',
  },
  {
    kind: 'SUBSCRIBER_SOA',
    title: 'Statement of account',
    question: 'What makes up one subscriber balance?',
    basis:
      'Ledger debits and credits in the date range, capped at the as-of date.',
    group: 'Subscriber accounts',
  },
  {
    kind: 'USER_ACTIVITY',
    title: 'User activity',
    question: 'What actions did each user perform?',
    basis: 'Audit events by actor and action in the date range, through as-of.',
    group: 'Controls & audit',
  },
  {
    kind: 'AUDIT',
    title: 'Audit trail',
    question: 'Who changed what, when, and why?',
    basis: 'Immutable audit events in the date range, through as-of.',
    group: 'Controls & audit',
  },
];
const valueLabel = (key: string) =>
  key
    .replace(/Centavos$/, '')
    .replace(/([A-Z])/g, ' $1')
    .trim();
const display = (value: unknown, type?: string) => {
  if (type === 'money') return money(Number(value ?? 0));
  if (type === 'date' && typeof value === 'string' && value.includes('T'))
    return new Date(value).toLocaleString('en-PH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  return String(value ?? '—');
};

export function ReportsView({
  canExport,
  canAudit,
  canViewSubscribers,
  canViewBilling = false,
  canViewPayments = false,
}: {
  canExport: boolean;
  canAudit: boolean;
  canViewSubscribers: boolean;
  canViewBilling?: boolean;
  canViewPayments?: boolean;
}) {
  const [group, setGroup] = useState<Group>('Revenue & collection');
  const [kind, setKind] = useState<ReportKind>('COLLECTIONS');
  const [query, setQuery] = useState<ReportQuery>(defaults);
  const [subscribers, setSubscribers] = useState<SubscriberSummaryDto[]>([]);
  const [report, setReport] = useState<ReportResultDto | null>(null);
  const [snapshot, setSnapshot] = useState<{
    kind: ReportKind;
    filters: ReportQuery;
  } | null>(null);
  const [selectedRow, setSelectedRow] = useState<Record<
    string,
    string | number | null
  > | null>(null);
  const [source, setSource] = useState<
    InvoiceDetailDto | PaymentSummaryDto | SubscriberProfileDto | null
  >(null);
  const [advanced, setAdvanced] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const requestSequence = useRef(0);
  const sourceSequence = useRef(0);

  useEffect(() => {
    if (!canViewSubscribers) return;
    void window.bcis?.masterData
      .listSubscribers({ q: '', page: 1, pageSize: 100 })
      .then((result) => setSubscribers(result.items))
      .catch((caught: unknown) => setError(message(caught)));
  }, [canViewSubscribers]);

  function invalidate() {
    requestSequence.current += 1;
    sourceSequence.current += 1;
    setReport(null);
    setSnapshot(null);
    setSelectedRow(null);
    setSource(null);
    setLoading(false);
    setError('');
  }
  function choose(next: ReportKind) {
    invalidate();
    setKind(next);
    setRegisterOpen(false);
  }
  function set<K extends keyof ReportQuery>(key: K, value: ReportQuery[K]) {
    invalidate();
    setQuery((current) => ({ ...current, [key]: value, page: 1 }));
  }
  async function preview(
    page = 1,
    active = snapshot ?? { kind, filters: query },
  ) {
    const sequence = ++requestSequence.current;
    const filters = { ...active.filters, page };
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const result = await window.bcis!.reports.preview(active.kind, filters);
      if (sequence !== requestSequence.current) return;
      setReport(result);
      setSnapshot({ kind: active.kind, filters: active.filters });
    } catch (caught) {
      if (sequence === requestSequence.current) setError(message(caught));
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }
  async function exportReport(format: 'pdf' | 'xlsx') {
    if (!snapshot || !report) return;
    setExporting(format);
    setError('');
    setNotice('');
    const { filters } = snapshot;
    try {
      const result = await window.bcis!.reports.export(
        snapshot.kind,
        {
          from: filters.from,
          to: filters.to,
          asOf: filters.asOf,
          granularity: filters.granularity,
          dimension: filters.dimension,
          q: filters.q,
          ...(filters.subscriberId
            ? { subscriberId: filters.subscriberId }
            : {}),
        },
        format,
      );
      setNotice(
        result.saved
          ? `${result.filename} saved with the preview filters.`
          : 'Export cancelled.',
      );
    } catch (caught) {
      setError(message(caught));
    } finally {
      setExporting(null);
    }
  }
  async function openSource(row: Record<string, string | number | null>) {
    const sequence = sourceSequence.current;
    const type = String(row.sourceType ?? row.entityType ?? '');
    const id = String(row.sourceId ?? row.entityId ?? '');
    if (!id || !['invoice', 'payment', 'subscriber'].includes(type)) return;
    if (
      (type === 'invoice' && !canViewBilling) ||
      (type === 'payment' && !canViewPayments) ||
      (type === 'subscriber' && !canViewSubscribers)
    )
      return;
    setSourceLoading(true);
    setSourceError('');
    try {
      const detail =
        type === 'invoice'
          ? await window.bcis!.billing.getInvoice(id)
          : type === 'payment'
            ? await window.bcis!.payments.get(id)
            : await window.bcis!.masterData.getSubscriber(id);
      if (sequence === sourceSequence.current) setSource(detail);
    } catch (caught) {
      if (sequence === sourceSequence.current) setSourceError(message(caught));
    } finally {
      if (sequence === sourceSequence.current) setSourceLoading(false);
    }
  }

  const allowedGroups: Group[] = canAudit
    ? ['Revenue & collection', 'Subscriber accounts', 'Controls & audit']
    : ['Revenue & collection', 'Subscriber accounts'];
  const visible = questions.filter(
    (item) =>
      item.group === group &&
      (item.kind !== 'SUBSCRIBER_SOA' || canViewSubscribers),
  );
  const activeQuestion = questions.find((item) => item.kind === kind)!;
  const chartKind =
    report &&
    [
      'COLLECTIONS',
      'BILLING_COLLECTION',
      'REVENUE',
      'AR_AGING',
      'COLLECTOR_PERFORMANCE',
    ].includes(report.kind);
  const chartData =
    report?.kind === 'AR_AGING'
      ? [
          {
            label: 'Current',
            amount: report.totals.currentCentavos ?? 0,
            secondary: undefined,
          },
          {
            label: 'Overdue',
            amount: report.totals.overdueCentavos ?? 0,
            secondary: undefined,
          },
        ]
      : (report?.rows.map((row) => ({
          label:
            String(
              row.period ?? row.label ?? row.collector ?? row.method ?? 'Group',
            ) +
            (report?.kind === 'COLLECTIONS'
              ? ` · ${String(row.method ?? '')}`
              : ''),
          amount: Number(
            row.amountCentavos ??
              row.allocatedRevenueCentavos ??
              row.collectedCentavos ??
              0,
          ),
          secondary:
            report?.kind === 'BILLING_COLLECTION'
              ? Number(row.billedCentavos ?? 0)
              : report?.kind === 'COLLECTOR_PERFORMANCE'
                ? Number(row.remittedCentavos ?? 0)
                : undefined,
        })) ?? []);
  const chartMax = Math.max(
    1,
    ...chartData.map((point) =>
      Math.max(0, point.amount, point.secondary ?? 0),
    ),
  );
  const columns = report?.columns ?? [];
  const primary =
    columns.find(
      (column) => column.type === 'text' || column.type === 'date',
    ) ?? columns[0];
  const sourceType = selectedRow
    ? String(selectedRow.sourceType ?? selectedRow.entityType ?? '')
    : '';
  const sourceId = selectedRow
    ? String(selectedRow.sourceId ?? selectedRow.entityId ?? '')
    : '';
  const canOpenSource = Boolean(
    sourceId &&
    ((sourceType === 'invoice' && canViewBilling) ||
      (sourceType === 'payment' && canViewPayments) ||
      (sourceType === 'subscriber' && canViewSubscribers)),
  );

  return (
    <div className="report-desk">
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
      <header className="report-hero">
        <div>
          <span className="eyebrow">Insights & accountability</span>
          <h2>Start with a question</h2>
          <p>
            Choose what you need to understand. Every preview keeps its date
            basis, totals, and source trail together.
          </p>
        </div>
      </header>
      <div
        className="report-group-tabs"
        role="tablist"
        aria-label="Report groups"
      >
        {allowedGroups.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={group === item}
            onClick={() => {
              setGroup(item);
              const first = questions.find(
                (question) =>
                  question.group === item &&
                  (question.kind !== 'SUBSCRIBER_SOA' || canViewSubscribers),
              );
              if (first) choose(first.kind);
            }}
          >
            {item}
          </button>
        ))}
      </div>
      <section className="report-question-grid" aria-label="Report questions">
        {visible.map((item) => (
          <button
            type="button"
            className="report-question"
            aria-pressed={kind === item.kind}
            key={item.kind}
            onClick={() => choose(item.kind)}
          >
            <span>{item.title}</span>
            <strong>{item.question}</strong>
            <small>{item.basis}</small>
            <b>Use this report</b>
          </button>
        ))}
      </section>

      <section className="report-setup" aria-label="Report setup">
        <div className="report-setup-head">
          <div>
            <span className="eyebrow">Selected question</span>
            <h3>{activeQuestion.question}</h3>
            <p>{activeQuestion.basis}</p>
          </div>
          <span className="report-basis">{activeQuestion.title}</span>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void preview(1, { kind, filters: query });
          }}
        >
          {kind !== 'SUBSCRIBER_MASTER' && (
            <div className="report-basic-filters">
              <label>
                From
                <input
                  type="date"
                  required
                  value={query.from}
                  onChange={(event) => set('from', event.target.value)}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  required
                  min={query.from}
                  value={query.to}
                  onChange={(event) => set('to', event.target.value)}
                />
              </label>
              <label>
                As of
                <input
                  type="date"
                  required
                  value={query.asOf}
                  onChange={(event) => set('asOf', event.target.value)}
                />
              </label>
            </div>
          )}
          {kind === 'SUBSCRIBER_SOA' && (
            <label className="report-subscriber">
              Subscriber
              <select
                required
                value={query.subscriberId ?? ''}
                onChange={(event) =>
                  set('subscriberId', event.target.value || undefined)
                }
              >
                <option value="">Choose a subscriber</option>
                {subscribers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.accountNumber} · {item.fullName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <details
            className="report-advanced"
            open={advanced}
            onToggle={(event) => setAdvanced(event.currentTarget.open)}
          >
            <summary>More filters</summary>
            <div className="report-advanced-grid">
              {(kind === 'COLLECTIONS' || kind === 'BILLING_COLLECTION') && (
                <label>
                  Grouping
                  <select
                    value={query.granularity}
                    onChange={(event) =>
                      set(
                        'granularity',
                        event.target.value as ReportQuery['granularity'],
                      )
                    }
                  >
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                    <option value="ANNUAL">Annual</option>
                  </select>
                </label>
              )}
              {kind === 'REVENUE' && (
                <label>
                  Group revenue by
                  <select
                    value={query.dimension}
                    onChange={(event) =>
                      set(
                        'dimension',
                        event.target.value as ReportQuery['dimension'],
                      )
                    }
                  >
                    <option value="PLAN">Plan</option>
                    <option value="SERVICE">Service</option>
                    <option value="AREA">Area</option>
                  </select>
                </label>
              )}
              <label>
                Search result text
                <input
                  value={query.q}
                  placeholder="Optional"
                  onChange={(event) => set('q', event.target.value)}
                />
              </label>
            </div>
          </details>
          <button
            className="primary-action report-preview-button"
            disabled={
              loading ||
              !query.from ||
              !query.to ||
              query.from > query.to ||
              (kind === 'SUBSCRIBER_SOA' && !query.subscriberId)
            }
            type="submit"
          >
            {loading ? 'Preparing preview…' : 'Preview answer'}
          </button>
        </form>
      </section>

      {report && snapshot && (
        <section className="report-answer print-report" aria-busy={loading}>
          <div className="report-answer-head">
            <div>
              <span className="eyebrow">Answer · {report.total} records</span>
              <h3>{report.title}</h3>
              <p>
                {Object.entries(report.filters)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(' · ')}
              </p>
            </div>
            <div className="report-answer-actions">
              <button type="button" onClick={() => window.print()}>
                Print preview
              </button>
              {canExport && (
                <>
                  <button
                    type="button"
                    disabled={!!exporting}
                    onClick={() => void exportReport('pdf')}
                  >
                    {exporting === 'pdf' ? 'Generating PDF…' : 'Export PDF'}
                  </button>
                  <button
                    type="button"
                    disabled={!!exporting}
                    onClick={() => void exportReport('xlsx')}
                  >
                    {exporting === 'xlsx' ? 'Generating XLSX…' : 'Export XLSX'}
                  </button>
                </>
              )}
            </div>
          </div>
          <dl className="report-total-grid">
            {Object.entries(report.totals).map(([key, value]) => (
              <div key={key}>
                <dt>{valueLabel(key)}</dt>
                <dd>
                  {key.toLowerCase().includes('centavos')
                    ? money(value)
                    : value}
                </dd>
              </div>
            ))}
          </dl>
          {chartKind && chartData.length > 0 && (
            <div className="report-chart">
              <div className="report-chart-title">
                <strong>
                  {report.kind === 'AR_AGING'
                    ? 'Balance composition'
                    : 'Visible groups'}
                </strong>
                <span>
                  {report.kind === 'BILLING_COLLECTION'
                    ? 'Blue: collected · teal: billed'
                    : report.kind === 'COLLECTOR_PERFORMANCE'
                      ? 'Blue: collected · teal: remitted'
                      : 'Labels and values are shown below each bar.'}
                </span>
              </div>
              <ol>
                {chartData.slice(0, 12).map((point, index) => (
                  <li key={`${point.label}-${index}`}>
                    <div>
                      <span>{point.label}</span>
                      <strong>
                        {money(point.amount)}
                        {point.secondary !== undefined
                          ? ` / ${money(point.secondary)}`
                          : ''}
                      </strong>
                    </div>
                    <i aria-hidden="true">
                      <b
                        style={{
                          width: `${Math.max(2, (Math.max(0, point.amount) / chartMax) * 100)}%`,
                        }}
                      />
                    </i>
                    {point.secondary !== undefined && (
                      <i aria-hidden="true">
                        <b
                          className="secondary"
                          style={{
                            width: `${Math.max(2, (Math.max(0, point.secondary) / chartMax) * 100)}%`,
                          }}
                        />
                      </i>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="report-record-head">
            <div>
              <h4>Records</h4>
              <p>Select a record to inspect its values and source trail.</p>
            </div>
            <span>
              Page {report.page} of{' '}
              {Math.max(1, Math.ceil(report.total / report.pageSize))}
            </span>
          </div>
          {report.rows.length ? (
            <div className="report-record-grid">
              {report.rows.map((row, index) => (
                <button
                  className="report-record"
                  type="button"
                  key={`${String(row.eventId ?? row.sourceId ?? row.reference ?? index)}-${index}`}
                  onClick={() => {
                    sourceSequence.current += 1;
                    setSource(null);
                    setSourceError('');
                    setSelectedRow(row);
                  }}
                >
                  <span>
                    {primary
                      ? display(row[primary.key], primary.type)
                      : `Record ${index + 1}`}
                  </span>
                  <strong>
                    {columns.find((column) => column.type === 'money')
                      ? display(
                          row[
                            columns.find((column) => column.type === 'money')!
                              .key
                          ],
                          'money',
                        )
                      : String(
                          row.action ?? row.status ?? row.type ?? report.kind,
                        )}
                  </strong>
                  <small>
                    {columns
                      .filter((column) => column.key !== primary?.key)
                      .slice(0, 3)
                      .map(
                        (column) =>
                          `${column.label}: ${display(row[column.key], column.type)}`,
                      )
                      .join(' · ')}
                  </small>
                  <b>Inspect record</b>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-state" role="status">
              <strong>No matching records</strong>
              <span>Widen the dates or clear search text.</span>
            </div>
          )}
          <div className="report-pager">
            <button
              type="button"
              disabled={loading || report.page <= 1}
              onClick={() => void preview(report.page - 1)}
            >
              Previous
            </button>
            <span>
              {report.page} /{' '}
              {Math.max(1, Math.ceil(report.total / report.pageSize))}
            </span>
            <button
              type="button"
              disabled={
                loading || report.page * report.pageSize >= report.total
              }
              onClick={() => void preview(report.page + 1)}
            >
              Next
            </button>
          </div>
          <details
            className="report-register"
            open={registerOpen}
            onToggle={(event) => setRegisterOpen(event.currentTarget.open)}
          >
            <summary>View detailed register</summary>
            <div
              className="table-scroll"
              role="region"
              aria-label="Detailed report register"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    {columns.map((column) => (
                      <th key={column.key}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row, index) => (
                    <tr key={index}>
                      {columns.map((column) => (
                        <td key={column.key}>
                          {display(row[column.key], column.type)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p className="report-scope">
            Preview and print show this page. PDF and XLSX include every
            authorized record matching the preview filters.
          </p>
        </section>
      )}

      {selectedRow && report && (
        <ModalDialog
          ariaLabel="Report record detail"
          onClose={() => {
            sourceSequence.current += 1;
            setSelectedRow(null);
            setSource(null);
          }}
        >
          <section className="report-source-sheet">
            <header>
              <div>
                <span className="eyebrow">Source trail</span>
                <h3>
                  {String(
                    selectedRow.reference ??
                      selectedRow.entity ??
                      selectedRow[primary?.key ?? ''] ??
                      'Report record',
                  )}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  sourceSequence.current += 1;
                  setSelectedRow(null);
                  setSource(null);
                }}
              >
                Close
              </button>
            </header>
            <dl>
              {columns.map((column) => (
                <div key={column.key}>
                  <dt>{column.label}</dt>
                  <dd>{display(selectedRow[column.key], column.type)}</dd>
                </div>
              ))}
            </dl>
            {selectedRow.eventId && (
              <p>
                Audit event #{selectedRow.eventId} ·{' '}
                {String(selectedRow.entityType ?? '')}{' '}
                {String(selectedRow.entityId ?? '')}
              </p>
            )}
            {selectedRow.oldValues && (
              <details>
                <summary>Previous values</summary>
                <pre>{String(selectedRow.oldValues)}</pre>
              </details>
            )}
            {selectedRow.newValues && (
              <details>
                <summary>Recorded values</summary>
                <pre>{String(selectedRow.newValues)}</pre>
              </details>
            )}
            {canOpenSource && (
              <button
                className="primary-action"
                disabled={sourceLoading}
                type="button"
                onClick={() => void openSource(selectedRow)}
              >
                {sourceLoading
                  ? 'Loading source…'
                  : `Open ${sourceType} record`}
              </button>
            )}
            {sourceError && (
              <p className="form-error" role="alert">
                {sourceError}
              </p>
            )}
            {source && (
              <div className="report-source-evidence">
                {'invoiceNumber' in source ? (
                  <>
                    <strong>Invoice {source.invoiceNumber}</strong>
                    <p>
                      {source.subscriberName} · {money(source.totalCentavos)} ·
                      Due {source.dueDate} · {source.status}
                    </p>
                    <p>
                      {source.adjustments.length} adjustments ·{' '}
                      {source.allocations.length} payment allocations
                    </p>
                  </>
                ) : 'paymentDate' in source ? (
                  <>
                    <strong>
                      {source.receiptNumber ??
                        source.referenceNumber ??
                        'Payment'}
                    </strong>
                    <p>
                      {source.subscriberName} · {money(source.amountCentavos)} ·{' '}
                      {source.method} · {source.status}
                    </p>
                    <p>
                      Paid {source.paymentDate.slice(0, 10)}
                      {source.reversedReason
                        ? ` · Reversed: ${source.reversedReason}`
                        : ''}
                    </p>
                  </>
                ) : (
                  <>
                    <strong>
                      {source.accountNumber} · {source.fullName}
                    </strong>
                    <p>
                      {source.status} · {source.serviceCount} services ·{' '}
                      {source.collectionArea?.name ?? 'No area'}
                    </p>
                  </>
                )}
              </div>
            )}
            {sourceId && !canOpenSource && (
              <p>
                Source ID: {sourceId}. Open the relevant workspace if your role
                has access.
              </p>
            )}
          </section>
        </ModalDialog>
      )}
    </div>
  );
}
