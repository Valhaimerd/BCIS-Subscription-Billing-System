import type {
  ReportKind,
  ReportQuery,
  ReportResultDto,
  SubscriberSummaryDto,
} from '@bcis/contracts';
import { useEffect, useRef, useState } from 'react';

const TODAY = (() => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
})();
const FROM = `${TODAY.slice(0, 7)}-01`;
const TO = TODAY;
const money = (value: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
    value / 100,
  );
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The request could not be completed.';

const reportGroups: Array<{
  label: string;
  items: Array<[ReportKind, string, string]>;
}> = [
  {
    label: 'Revenue & collection',
    items: [
      [
        'COLLECTIONS',
        'Collection report',
        'What was collected and left outstanding?',
      ],
      [
        'BILLING_COLLECTION',
        'Billing versus collection',
        'How does collected cash compare with billed revenue?',
      ],
      [
        'REVENUE',
        'Revenue by plan/service/area',
        'Where is billed revenue coming from?',
      ],
      [
        'COLLECTOR_PERFORMANCE',
        'Collector remittance and performance',
        'How do route collections compare with remittances?',
      ],
      [
        'ADJUSTMENTS_REVERSALS_VOIDS',
        'Adjustments, reversals, and voids',
        'Which financial records were corrected or reversed?',
      ],
    ],
  },
  {
    label: 'Subscriber accounts',
    items: [
      [
        'AR_AGING',
        'Accounts receivable aging',
        'Which balances need follow-up, and how old are they?',
      ],
      [
        'SUBSCRIBER_MASTER',
        'Subscriber master list',
        'Which subscribers and services are on file?',
      ],
      [
        'SUBSCRIBER_SOA',
        'Subscriber ledger / Statement of Account',
        'What charges and payments make up one account balance?',
      ],
    ],
  },
  {
    label: 'Controls & audit',
    items: [
      [
        'USER_ACTIVITY',
        'User activity',
        'Which users performed system actions?',
      ],
      [
        'AUDIT',
        'Audit trail',
        'What changes and financial events were recorded?',
      ],
    ],
  },
];
const reportDescriptions = new Map(
  reportGroups.flatMap(({ items }) =>
    items.map(([kind, , description]) => [kind, description]),
  ),
);

export function ReportsView({
  canExport,
  canAudit,
  canViewSubscribers,
}: {
  canExport: boolean;
  canAudit: boolean;
  canViewSubscribers: boolean;
}) {
  const [kind, setKind] = useState<ReportKind>('COLLECTIONS');
  const [query, setQuery] = useState<ReportQuery>({
    from: FROM,
    to: TO,
    asOf: TO,
    granularity: 'MONTHLY',
    dimension: 'PLAN',
    q: '',
    page: 1,
    pageSize: 20,
  });
  const [subscribers, setSubscribers] = useState<SubscriberSummaryDto[]>([]);
  const [report, setReport] = useState<ReportResultDto | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const previewRequest = useRef(0);

  useEffect(() => {
    if (!canViewSubscribers) return;
    void window.bcis?.masterData
      .listSubscribers({ q: '', page: 1, pageSize: 100 })
      .then((result) => setSubscribers(result.items))
      .catch((caught: unknown) => setError(message(caught)));
  }, [canViewSubscribers]);

  async function load(targetPage = query.page) {
    const request = ++previewRequest.current;
    try {
      setLoading(true);
      setError('');
      const result = await window.bcis!.reports.preview(kind, {
        ...query,
        page: targetPage,
      });
      if (request !== previewRequest.current) return;
      setReport(result);
      setQuery((current) => ({ ...current, page: result.page }));
    } catch (caught) {
      if (request === previewRequest.current) setError(message(caught));
    } finally {
      if (request === previewRequest.current) setLoading(false);
    }
  }

  function invalidatePreview() {
    previewRequest.current += 1;
    setLoading(false);
    setReport(null);
  }

  async function exportReport(format: 'pdf' | 'xlsx') {
    try {
      setError('');
      const filters = {
        from: query.from,
        to: query.to,
        asOf: query.asOf,
        granularity: query.granularity,
        dimension: query.dimension,
        q: query.q,
        ...(query.subscriberId ? { subscriberId: query.subscriberId } : {}),
      };
      const result = await window.bcis!.reports.export(kind, filters, format);
      setNotice(
        result.saved ? `${result.filename} saved.` : 'Report export cancelled.',
      );
    } catch (caught) {
      setError(message(caught));
    }
  }

  const set = <K extends keyof ReportQuery>(key: K, value: ReportQuery[K]) => {
    invalidatePreview();
    setError('');
    setQuery((current) => ({ ...current, [key]: value, page: 1 }));
  };
  return (
    <div className="data-layout reports-view">
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
      <section className="data-card report-controls">
        <div className="card-heading">
          <div>
            <span>Management reporting</span>
            <h2>Report filters</h2>
          </div>
        </div>
        <form
          className="filter-grid report-filter-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void load(1);
          }}
        >
          <label>
            Report
            <select
              value={kind}
              onChange={(event) => {
                invalidatePreview();
                setError('');
                setKind(event.target.value as ReportKind);
              }}
            >
              {reportGroups.map((group) => {
                const items =
                  group.label === 'Controls & audit' && !canAudit
                    ? []
                    : group.items.filter(
                        ([value]) =>
                          value !== 'SUBSCRIBER_SOA' || canViewSubscribers,
                      );
                return items.length ? (
                  <optgroup key={group.label} label={group.label}>
                    {items.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
          </label>
          <p className="report-description">{reportDescriptions.get(kind)}</p>
          <label>
            From
            <input
              type="date"
              value={query.from}
              onChange={(event) => set('from', event.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={query.to}
              onChange={(event) => set('to', event.target.value)}
            />
          </label>
          <label>
            As of
            <input
              type="date"
              value={query.asOf}
              onChange={(event) => set('asOf', event.target.value)}
            />
          </label>
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
          <label>
            Revenue dimension
            <select
              value={query.dimension}
              onChange={(event) =>
                set('dimension', event.target.value as ReportQuery['dimension'])
              }
            >
              <option value="PLAN">Plan</option>
              <option value="SERVICE">Service</option>
              <option value="AREA">Area</option>
            </select>
          </label>
          {kind === 'SUBSCRIBER_SOA' ? (
            <label>
              Subscriber
              <select
                required
                value={query.subscriberId ?? ''}
                onChange={(event) =>
                  set('subscriberId', event.target.value || undefined)
                }
              >
                <option value="">Select subscriber</option>
                {subscribers.map((subscriber) => (
                  <option key={subscriber.id} value={subscriber.id}>
                    {subscriber.accountNumber} · {subscriber.fullName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            Search results
            <input
              value={query.q}
              onChange={(event) => set('q', event.target.value)}
            />
          </label>
          <button
            className="primary-action"
            disabled={
              loading || (kind === 'SUBSCRIBER_SOA' && !query.subscriberId)
            }
            type="submit"
          >
            {loading ? 'Loading…' : 'Preview report'}
          </button>
        </form>
      </section>
      {report ? (
        <section
          aria-busy={loading}
          className="data-card table-card report-preview print-report"
        >
          <div className="card-heading">
            <div>
              <span>
                Generated {report.generatedAt.slice(0, 19).replace('T', ' ')}
              </span>
              <h2>{report.title}</h2>
            </div>
            <div className="report-actions">
              <button onClick={() => window.print()} type="button">
                Print
              </button>
              {canExport ? (
                <>
                  <button
                    onClick={() => void exportReport('pdf')}
                    type="button"
                  >
                    Export PDF
                  </button>
                  <button
                    onClick={() => void exportReport('xlsx')}
                    type="button"
                  >
                    Export XLSX
                  </button>
                </>
              ) : null}
            </div>
          </div>
          <p className="report-filter-summary">
            {Object.entries(report.filters)
              .map(([key, value]) => `${key}: ${value}`)
              .join(' · ')}
          </p>
          <div
            aria-label="Report rows, horizontally scrollable"
            className="table-scroll report-table-scroll"
            role="region"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  {report.columns.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row, index) => (
                  <tr key={index}>
                    {report.columns.map((column) => (
                      <td
                        className={
                          column.type === 'money' || column.type === 'integer'
                            ? 'number-cell'
                            : undefined
                        }
                        key={column.key}
                      >
                        {column.type === 'money'
                          ? money(Number(row[column.key] ?? 0))
                          : String(row[column.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!report.rows.length ? (
            <div className="empty-state" role="status">
              No records match these filters. Widen the date range or clear the
              search to see more results.
            </div>
          ) : null}
          <p className="report-export-scope">
            Preview shows page {report.page} of{' '}
            {Math.max(1, Math.ceil(report.total / report.pageSize))}. Export
            includes all authorized rows matching these filters.
          </p>
          <dl className="report-totals">
            {Object.entries(report.totals).map(([key, value]) => (
              <div key={key}>
                <dt>
                  {key.replace(/Centavos$/, '').replace(/([A-Z])/g, ' $1')}
                </dt>
                <dd>
                  {key.toLowerCase().includes('centavos')
                    ? money(value)
                    : value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="pagination">
            <button
              disabled={loading || report.page <= 1}
              onClick={() => void load(report.page - 1)}
              type="button"
            >
              Previous
            </button>
            <span>
              Page {report.page} of{' '}
              {Math.max(1, Math.ceil(report.total / report.pageSize))}
            </span>
            <button
              disabled={
                loading || report.page * report.pageSize >= report.total
              }
              onClick={() => void load(report.page + 1)}
              type="button"
            >
              Next
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
