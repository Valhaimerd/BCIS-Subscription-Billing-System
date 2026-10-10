import type {
  DelinquencySettingsDto,
  ReceivableDetailDto,
  ReceivableSummaryDto,
  ReferenceItemDto,
  ServiceControlHistoryDto,
} from '@bcis/contracts';
import { useEffect, useRef, useState } from 'react';

import { ModalDialog } from './ModalDialog';

const AS_OF = (() => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
})();
const PAGE_SIZE = 20;
const money = (value: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
    value / 100,
  );
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The request could not be completed.';
const agingLabel = (bucket: string) =>
  ({
    CURRENT: 'Current',
    '1_30': '1–30',
    '31_60': '31–60',
    '61_90': '61–90',
    '90_PLUS': '90+',
  })[bucket] ?? bucket;

export function ReceivablesView({ canManage }: { canManage: boolean }) {
  const [asOf, setAsOf] = useState(AS_OF);
  const [appliedAsOf, setAppliedAsOf] = useState(AS_OF);
  const [summary, setSummary] = useState<ReceivableSummaryDto | null>(null);
  const [rows, setRows] = useState<ReceivableDetailDto[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [references, setReferences] = useState<{
    collectors: ReferenceItemDto[];
    collectionAreas: ReferenceItemDto[];
    plans: ReferenceItemDto[];
    serviceTypes: ReferenceItemDto[];
  }>({ collectors: [], collectionAreas: [], plans: [], serviceTypes: [] });
  const [settings, setSettings] = useState<DelinquencySettingsDto | null>(null);
  const [selected, setSelected] = useState<ReceivableDetailDto | null>(null);
  const [history, setHistory] = useState<ServiceControlHistoryDto | null>(null);
  const [filters, setFilters] = useState({
    q: '',
    collectorId: '',
    areaId: '',
    planId: '',
    serviceTypeCode: '',
    agingBucket: '',
  });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const loadSequence = useRef(0);

  async function load(
    targetPage = page,
    targetAsOf = asOf,
    targetFilters = filters,
  ) {
    const sequence = ++loadSequence.current;
    try {
      setLoading(true);
      setError('');
      const [nextSummary, result] = await Promise.all([
        window.bcis!.receivables.summary(targetAsOf),
        window.bcis!.receivables.list({
          ...targetFilters,
          asOf: targetAsOf,
          page: targetPage,
          pageSize: PAGE_SIZE,
        }),
      ]);
      if (sequence !== loadSequence.current) return;
      setSummary(nextSummary);
      setRows(result.items);
      setPage(result.page);
      setTotal(result.total);
      setAppliedAsOf(targetAsOf);
    } catch (caught) {
      if (sequence === loadSequence.current) setError(message(caught));
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (!window.bcis) return;
    let cancelled = false;
    void load(1, AS_OF);
    void window.bcis.masterData.references().then(
      (nextReferences) => {
        if (!cancelled) setReferences(nextReferences);
      },
      (caught: unknown) => {
        if (!cancelled) setError(message(caught));
      },
    );
    void window.bcis.receivables.settings().then(
      (nextSettings) => {
        if (!cancelled) setSettings(nextSettings);
      },
      (caught: unknown) => {
        if (!cancelled) setError(message(caught));
      },
    );
    return () => {
      cancelled = true;
      loadSequence.current += 1;
    };
  }, []);

  async function open(row: ReceivableDetailDto) {
    try {
      setSelected(row);
      setHistory(await window.bcis!.receivables.history(row.serviceAccountId));
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const updated = await window.bcis!.receivables.updateSettings({
        gracePeriodDays: Number(form.get('gracePeriodDays')),
        suspensionThresholdDays: Number(form.get('suspensionThresholdDays')),
        reconnectionFeeCentavos: Math.round(
          Number(form.get('reconnectionFee')) * 100,
        ),
      });
      setSettings(updated);
      setNotice('Delinquency settings updated.');
      await load(1, appliedAsOf);
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function suspend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    try {
      await window.bcis!.receivables.suspend(selected.serviceAccountId, {
        reason: String(form.get('reason')),
        effectiveDate: String(form.get('effectiveDate')),
        notes: String(form.get('notes')) || undefined,
      });
      setNotice('Service suspension approved and added to service history.');
      await load(page, appliedAsOf);
      const updatedHistory = await window.bcis!.receivables.history(
        selected.serviceAccountId,
      );
      setHistory(updatedHistory);
      setSelected((current) =>
        current
          ? {
              ...current,
              serviceStatus: updatedHistory.status,
              suspensionCandidate: false,
            }
          : null,
      );
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function reconnect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    try {
      await window.bcis!.receivables.requestReconnection(
        selected.serviceAccountId,
        {
          reason: String(form.get('reason')),
          requestDate: String(form.get('requestDate')),
          technician: String(form.get('technician')),
          notes: String(form.get('notes')) || undefined,
        },
      );
      setNotice('Reconnection request approved.');
      setHistory(
        await window.bcis!.receivables.history(selected.serviceAccountId),
      );
    } catch (caught) {
      setError(message(caught));
    }
  }

  async function complete(id: string) {
    try {
      await window.bcis!.receivables.completeReconnection(id, {
        completionDate: appliedAsOf,
      });
      setNotice('Reconnection completed and service restored.');
      await load(page, appliedAsOf);
      if (selected) {
        const updatedHistory = await window.bcis!.receivables.history(
          selected.serviceAccountId,
        );
        setHistory(updatedHistory);
        setSelected((current) =>
          current
            ? {
                ...current,
                serviceStatus: updatedHistory.status,
                suspensionCandidate: false,
              }
            : null,
        );
      }
    } catch (caught) {
      setError(message(caught));
    }
  }

  return (
    <div className="data-layout receivables-view">
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
      <section className="data-card receivable-overview">
        <div className="receivable-toolbar">
          <div>
            <span>RECEIVABLES SNAPSHOT · AS OF {appliedAsOf}</span>
            <h2>Accounts receivable</h2>
          </div>
          <div className="receivable-date-actions">
            <label>
              Balance date
              <input
                name="asOf"
                onChange={(event) => setAsOf(event.target.value)}
                type="date"
                value={asOf}
              />
            </label>
            <button
              className="primary-action"
              onClick={() => void load(1)}
              type="button"
            >
              Refresh
            </button>
          </div>
        </div>
        {summary ? (
          <>
            <dl className="receivable-priority-grid">
              <div className="priority-overdue">
                <dt>Overdue balance</dt>
                <dd>{money(summary.overdueCentavos)}</dd>
              </div>
              <div>
                <dt>Follow-up accounts</dt>
                <dd>{summary.followUpAccounts}</dd>
              </div>
              <div>
                <dt>Suspension candidates</dt>
                <dd>{summary.suspensionCandidates}</dd>
              </div>
              <div>
                <dt>Total receivables</dt>
                <dd>{money(summary.totalCentavos)}</dd>
              </div>
            </dl>
            <div className="receivable-secondary-metrics">
              <span>
                Current balance{' '}
                <strong>{money(summary.currentCentavos)}</strong>
              </span>
              <span>
                Overdue subscribers{' '}
                <strong>{summary.overdueSubscribers}</strong>
              </span>
            </div>
            <div className="aging-section">
              <div className="aging-heading">
                <strong>Balance by invoice age</strong>
                <span>Select an age range to focus the queue</span>
              </div>
              <div
                className="aging-strip"
                aria-label="Accounts receivable aging"
              >
                {Object.entries(summary.buckets).map(([bucket, value]) => (
                  <button
                    aria-label={`${agingLabel(bucket)} days, ${money(value)}`}
                    aria-pressed={filters.agingBucket === bucket}
                    key={bucket}
                    className={filters.agingBucket === bucket ? 'selected' : ''}
                    onClick={() => {
                      const nextFilters = { ...filters, agingBucket: bucket };
                      setFilters(nextFilters);
                      void load(1, asOf, nextFilters);
                    }}
                    type="button"
                  >
                    <span>{agingLabel(bucket)}</span>
                    <strong>{money(value)}</strong>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}
        {loading ? (
          <p className="receivable-loading" role="status">
            Updating balances and follow-up accounts…
          </p>
        ) : null}
      </section>

      <section
        aria-busy={loading}
        className="data-card table-card receivable-table"
      >
        <div className="card-heading">
          <div>
            <span>Outstanding accounts · as of {appliedAsOf}</span>
            <h2>Account follow-up</h2>
          </div>
          <div className="queue-context">
            <span>{total} accounts</span>
            <small>Sorted by eligibility, oldest due date, then arrears</small>
          </div>
        </div>
        <form
          className="filter-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void load(1);
          }}
        >
          <label>
            Search
            <input
              onChange={(event) =>
                setFilters({ ...filters, q: event.target.value })
              }
              value={filters.q}
            />
          </label>
          <label>
            Collector
            <select
              onChange={(event) =>
                setFilters({ ...filters, collectorId: event.target.value })
              }
              value={filters.collectorId}
            >
              <option value="">All collectors</option>
              {references.collectors.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Area
            <select
              onChange={(event) =>
                setFilters({ ...filters, areaId: event.target.value })
              }
              value={filters.areaId}
            >
              <option value="">All areas</option>
              {references.collectionAreas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Plan
            <select
              onChange={(event) =>
                setFilters({ ...filters, planId: event.target.value })
              }
              value={filters.planId}
            >
              <option value="">All plans</option>
              {references.plans.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Service
            <select
              onChange={(event) =>
                setFilters({ ...filters, serviceTypeCode: event.target.value })
              }
              value={filters.serviceTypeCode}
            >
              <option value="">All services</option>
              {references.serviceTypes.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Age
            <select
              onChange={(event) =>
                setFilters({ ...filters, agingBucket: event.target.value })
              }
              value={filters.agingBucket}
            >
              <option value="">All ages</option>
              <option value="CURRENT">Current</option>
              <option value="1_30">1–30</option>
              <option value="31_60">31–60</option>
              <option value="61_90">61–90</option>
              <option value="90_PLUS">90+</option>
            </select>
          </label>
          <button type="submit">Apply filters</button>
        </form>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Subscriber / service</th>
                <th>Area / collector</th>
                <th>Months overdue</th>
                <th>Oldest unpaid</th>
                <th>Last payment</th>
                <th>Arrears</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.serviceAccountId}>
                  <td>
                    <button
                      aria-label={`Review ${row.subscriberName} receivable details`}
                      className="record-link"
                      onClick={() => void open(row)}
                      type="button"
                    >
                      {row.subscriberName}
                    </button>
                    <small>
                      {row.subscriberAccountNumber} · {row.serviceAccountNumber}{' '}
                      · {row.planName}
                    </small>
                  </td>
                  <td>
                    {row.collectionAreaName ?? 'Unassigned'}
                    <small>{row.collectorName ?? 'No collector'}</small>
                  </td>
                  <td>{row.monthsUnpaid}</td>
                  <td>
                    {row.oldestUnpaidInvoice}
                    <small>
                      Due {row.oldestDueDate} ·{' '}
                      {row.oldestAgingBucket.replace('_', '–')}
                    </small>
                  </td>
                  <td>
                    {row.lastPaymentAt
                      ? row.lastPaymentAt.slice(0, 10)
                      : 'None'}
                  </td>
                  <td>
                    {money(row.totalArrearsCentavos)}
                    <small>{money(row.totalOutstandingCentavos)} total</small>
                  </td>
                  <td>
                    <span
                      className={`record-status ${row.suspensionCandidate ? 'attention' : row.followUp ? 'follow-up' : row.serviceStatus === 'ACTIVE' ? 'active' : ''}`}
                    >
                      {row.suspensionCandidate
                        ? 'Suspension candidate'
                        : row.followUp
                          ? 'Follow-up'
                          : row.serviceStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && summary && !rows.length ? (
          <div className="empty-state">
            <strong>No accounts match these filters.</strong>
            <span>Try clearing a filter or choosing a wider age range.</span>
          </div>
        ) : null}
        <div className="pagination">
          <button
            aria-label="Previous receivables"
            disabled={page <= 1}
            onClick={() => void load(page - 1)}
            type="button"
          >
            Previous
          </button>
          <span>
            Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </span>
          <button
            aria-label="Next receivables"
            disabled={page * PAGE_SIZE >= total}
            onClick={() => void load(page + 1)}
            type="button"
          >
            Next
          </button>
        </div>
      </section>

      {canManage && settings ? (
        <form
          className="data-card form-grid delinquency-settings"
          onSubmit={saveSettings}
        >
          <div className="card-heading span-two">
            <div>
              <span>Policy settings</span>
              <h2>Delinquency policy</h2>
            </div>
            <p>These thresholds govern service-control eligibility.</p>
          </div>
          <label>
            Grace period (days)
            <input
              defaultValue={settings.gracePeriodDays}
              min="0"
              name="gracePeriodDays"
              required
              type="number"
            />
          </label>
          <label>
            Suspension threshold (days)
            <input
              defaultValue={settings.suspensionThresholdDays}
              min="1"
              name="suspensionThresholdDays"
              required
              type="number"
            />
          </label>
          <label>
            Reconnection fee (PHP)
            <input
              defaultValue={(settings.reconnectionFeeCentavos / 100).toFixed(2)}
              min="0"
              name="reconnectionFee"
              required
              step="0.01"
              type="number"
            />
          </label>
          <button className="primary-action" type="submit">
            Save policy
          </button>
        </form>
      ) : null}

      {selected && history ? (
        <ModalDialog
          ariaLabel="Receivable service control detail"
          onClose={() => {
            setSelected(null);
            setHistory(null);
          }}
        >
          <section className="data-card service-control">
            <div className="card-heading">
              <div>
                <span>Service control</span>
                <h2>
                  {selected.subscriberName} · {history.serviceAccountNumber}
                </h2>
              </div>
              <div className="row-actions">
                <button
                  onClick={() => {
                    setSelected(null);
                    setHistory(null);
                  }}
                  type="button"
                >
                  Close
                </button>
                <span className="record-status">{history.status}</span>
              </div>
            </div>
            <dl className="receivable-detail-grid">
              <div>
                <dt>Subscriber account</dt>
                <dd>{selected.subscriberAccountNumber}</dd>
              </div>
              <div>
                <dt>Service status</dt>
                <dd>{history.status}</dd>
              </div>
              <div>
                <dt>Plan</dt>
                <dd>{selected.planName}</dd>
              </div>
              <div>
                <dt>Collection area / collector</dt>
                <dd>
                  {selected.collectionAreaName ?? 'Unassigned'} ·{' '}
                  {selected.collectorName ?? 'No collector'}
                </dd>
              </div>
              <div>
                <dt>Oldest unpaid invoice</dt>
                <dd>{selected.oldestUnpaidInvoice}</dd>
              </div>
              <div>
                <dt>Oldest due date</dt>
                <dd>
                  {selected.oldestDueDate} · {selected.monthsUnpaid} months
                </dd>
              </div>
              <div>
                <dt>Overdue balance</dt>
                <dd>{money(selected.totalArrearsCentavos)}</dd>
              </div>
              <div>
                <dt>Total outstanding</dt>
                <dd>{money(selected.totalOutstandingCentavos)}</dd>
              </div>
              <div>
                <dt>Last payment</dt>
                <dd>
                  {selected.lastPaymentAt
                    ? selected.lastPaymentAt.slice(0, 10)
                    : 'No payment recorded'}
                </dd>
              </div>
            </dl>
            <div className="service-control-grid">
              <div>
                <h3>Suspension history</h3>
                {history.suspensions.length ? (
                  history.suspensions.map((record) => (
                    <article key={record.id}>
                      <strong>{record.effectiveDate}</strong>
                      <p>{record.reason}</p>
                      <small>
                        Approved by {record.approvedBy ?? 'system record'}
                      </small>
                    </article>
                  ))
                ) : (
                  <p>No suspension records.</p>
                )}
              </div>
              <div>
                <h3>Reconnection history</h3>
                {history.reconnections.length ? (
                  history.reconnections.map((record) => (
                    <article key={record.id}>
                      <strong>
                        {record.requestDate} · {record.status}
                      </strong>
                      <p>
                        {record.technician} · {money(record.feeCentavos)}
                      </p>
                      {canManage && record.status === 'REQUESTED' ? (
                        <button
                          className="primary-action"
                          onClick={() => void complete(record.id)}
                          type="button"
                        >
                          Complete reconnection
                        </button>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p>No reconnection records.</p>
                )}
              </div>
            </div>
            <section className="service-event-history">
              <h3>Service status timeline</h3>
              {history.events.length ? (
                <ol>
                  {history.events.map((event) => (
                    <li key={event.id}>
                      <time dateTime={event.createdAt}>
                        {event.createdAt.slice(0, 10)}
                      </time>
                      <strong>
                        {event.previousStatus ?? 'Created'} → {event.newStatus}
                      </strong>
                      <span>{event.reason}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No service status changes recorded.</p>
              )}
            </section>
            {canManage &&
            selected.serviceStatus === 'ACTIVE' &&
            selected.suspensionCandidate ? (
              <form className="wide-form form-grid" onSubmit={suspend}>
                <h3 className="span-two">Approve suspension</h3>
                <label>
                  Effective date
                  <input
                    defaultValue={appliedAsOf}
                    name="effectiveDate"
                    required
                    type="date"
                  />
                </label>
                <label>
                  Reason
                  <input
                    defaultValue="Account exceeded the suspension threshold."
                    name="reason"
                    required
                  />
                </label>
                <label className="span-two">
                  Notes
                  <input name="notes" />
                </label>
                <button className="primary-action span-two" type="submit">
                  Approve suspension
                </button>
              </form>
            ) : null}
            {canManage &&
            selected.serviceStatus === 'SUSPENDED' &&
            selected.totalArrearsCentavos === 0 ? (
              <form className="wide-form form-grid" onSubmit={reconnect}>
                <h3 className="span-two">Approve reconnection request</h3>
                <label>
                  Request date
                  <input
                    defaultValue={appliedAsOf}
                    name="requestDate"
                    required
                    type="date"
                  />
                </label>
                <label>
                  Technician
                  <input name="technician" required />
                </label>
                <label>
                  Reason
                  <input
                    defaultValue="Qualifying payment confirmed."
                    name="reason"
                    required
                  />
                </label>
                <label>
                  Notes
                  <input name="notes" />
                </label>
                <button className="primary-action span-two" type="submit">
                  Approve reconnection
                </button>
              </form>
            ) : null}
          </section>
        </ModalDialog>
      ) : null}
    </div>
  );
}
