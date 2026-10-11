import type { DashboardDto, PermissionCode } from '@bcis/contracts';
import {
  ArrowRight,
  CreditCard,
  Map,
  Search,
  Users,
  Wallet,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { AppViewId } from './navigation';
import { DetailSheet } from './ui/DetailSheet';
import { WorkCard } from './ui/WorkCard';

type DashboardViewProps = {
  permissions: readonly PermissionCode[];
  onNavigate: (view: AppViewId) => void;
};

function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function initialPeriod() {
  const today = new Date();
  return {
    from: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`,
    to: localDate(today),
    asOf: localDate(today),
  };
}

const money = (value: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
    value / 100,
  );
const axisMoney = (centavos: number) => {
  const pesos = centavos / 100;
  if (pesos >= 1_000_000) return `₱${(pesos / 1_000_000).toFixed(1)}m`;
  if (pesos >= 1_000) return `₱${(pesos / 1_000).toFixed(1)}k`;
  return `₱${Math.round(pesos)}`;
};
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The request could not be completed.';

export function DashboardView({
  permissions,
  onNavigate,
}: DashboardViewProps): React.JSX.Element {
  const canViewReports = permissions.includes('report.view');
  const canViewSubscribers = permissions.includes('subscriber.view');
  const canViewPayments = permissions.includes('payment.view');
  const canViewReceivables = permissions.includes('receivable.view');
  const canViewCollections = permissions.includes('collection.view');
  const canCreatePayments = permissions.includes('payment.create');
  const [period, setPeriod] = useState(initialPeriod);
  const [dashboard, setDashboard] = useState<DashboardDto | null>(null);
  const [paymentCount, setPaymentCount] = useState(0);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeDetail, setActiveDetail] = useState<
    'receivables' | 'payments' | 'collections' | null
  >(null);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    setDashboard(null);
    if (!period.from || !period.to || period.from > period.to) {
      setError('From date must be on or before the to date.');
      setLoading(false);
      return () => {
        current = false;
      };
    }
    if (canViewReports) {
      void window.bcis?.reports
        .dashboard(period)
        .then((result) => {
          if (current) setDashboard(result);
        })
        .catch((caught: unknown) => {
          if (current) setError(errorMessage(caught));
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    } else {
      setDashboard(null);
      const requests: Promise<unknown>[] = [];
      if (canViewSubscribers)
        requests.push(
          window
            .bcis!.masterData.listSubscribers({ q: '', page: 1, pageSize: 1 })
            .then((result) => {
              if (current) setSubscriberCount(result.total);
            }),
        );
      if (canViewPayments)
        requests.push(
          window
            .bcis!.payments.list({
              q: '',
              page: 1,
              pageSize: 1,
              status: 'POSTED',
            })
            .then((result) => {
              if (current) setPaymentCount(result.total);
            }),
        );
      void Promise.all(requests)
        .catch((caught: unknown) => {
          if (current) setError(errorMessage(caught));
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }
    return () => {
      current = false;
    };
  }, [canViewPayments, canViewReports, canViewSubscribers, period, refreshKey]);

  const setDate = (key: 'from' | 'to', value: string) => {
    setActiveDetail(null);
    setPeriod((current) => ({
      ...current,
      [key]: value,
      ...(key === 'to' ? { asOf: value } : {}),
    }));
  };

  return (
    <div className="data-layout dashboard-view">
      {error ? (
        <div className="dashboard-error form-error" role="alert">
          {error}
          <button
            onClick={() => {
              setActiveDetail(null);
              setRefreshKey((current) => current + 1);
            }}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : null}
      {canViewReports ? (
        <>
          <section
            className="dashboard-period-bar"
            aria-label="Dashboard period"
          >
            <p>Showing activity for the selected period</p>
            <div className="dashboard-period-controls">
              <label>
                From date
                <input
                  type="date"
                  value={period.from}
                  onChange={(event) => setDate('from', event.target.value)}
                />
              </label>
              <label>
                To date
                <input
                  type="date"
                  value={period.to}
                  onChange={(event) => setDate('to', event.target.value)}
                />
              </label>
            </div>
          </section>
          {loading ? (
            <div className="empty-state" role="status">
              Loading management indicators…
            </div>
          ) : dashboard ? (
            <>
              <section
                className="today-feature"
                aria-label="Recommended next action"
              >
                <div>
                  <span className="today-feature-label">Your next move</span>
                  <h2>
                    {canViewReceivables && dashboard.followUpAccounts > 0
                      ? `${dashboard.followUpAccounts} accounts need follow-up`
                      : 'Review the month at a glance'}
                  </h2>
                  <p>
                    {canViewReceivables && dashboard.followUpAccounts > 0
                      ? `There is ${money(dashboard.overdueReceivableCentavos)} overdue as of ${dashboard.asOf}. Start with the accounts that need attention.`
                      : 'See billed, collected, and overdue work from the same selected period.'}
                  </p>
                  <button
                    onClick={() =>
                      onNavigate(
                        canViewReceivables && dashboard.followUpAccounts > 0
                          ? 'Receivables'
                          : 'Reports',
                      )
                    }
                    type="button"
                  >
                    {canViewReceivables && dashboard.followUpAccounts > 0
                      ? 'Open follow-up work'
                      : 'Explore reports'}
                    <ArrowRight aria-hidden="true" size={17} />
                  </button>
                </div>
                <dl className="today-feature-figure">
                  <div>
                    <dt>Collected</dt>
                    <dd>{money(dashboard.collectedCentavos)}</dd>
                  </div>
                  <div>
                    <dt>Billed</dt>
                    <dd>{money(dashboard.billedCentavos)}</dd>
                  </div>
                  <div className="today-feature-period">
                    <dt>Period</dt>
                    <dd>
                      {dashboard.from} to {dashboard.to}
                    </dd>
                  </div>
                </dl>
              </section>
              {canViewReceivables || canViewPayments || canViewCollections ? (
                <section
                  className="today-work-grid"
                  aria-label="Explore current work"
                >
                  {canViewReceivables ? (
                    <WorkCard
                      action="See aging and next steps"
                      context={`${money(dashboard.overdueReceivableCentavos)} overdue · ${dashboard.overdueSubscribers} subscribers`}
                      icon={CreditCard}
                      onClick={() => setActiveDetail('receivables')}
                      status={
                        dashboard.followUpAccounts > 0
                          ? `${dashboard.followUpAccounts} for follow-up`
                          : undefined
                      }
                      title="Receivables"
                      tone={
                        dashboard.followUpAccounts > 0 ? 'attention' : 'default'
                      }
                    />
                  ) : null}
                  {canViewPayments ? (
                    <WorkCard
                      action="See payment detail"
                      context={`${money(dashboard.collectedCentavos)} collected in this period`}
                      icon={Wallet}
                      onClick={() => setActiveDetail('payments')}
                      title="Payments"
                    />
                  ) : null}
                  {canViewCollections ? (
                    <WorkCard
                      action="See collector detail"
                      context={`${dashboard.collectors.length} collector ${dashboard.collectors.length === 1 ? 'summary' : 'summaries'} shown for this period`}
                      icon={Map}
                      onClick={() => setActiveDetail('collections')}
                      title="Field collections"
                    />
                  ) : null}
                </section>
              ) : null}
              <section
                className="dashboard-breakdown"
                aria-label="Dashboard breakdowns"
              >
                <RingChart
                  title="How customers paid"
                  basis={`${dashboard.from} to ${dashboard.to} · payment date`}
                  chartLabel="Payment methods by amount"
                  centerLabel="collected"
                  empty="No posted payments in this period."
                  segments={dashboard.paymentMethods.map((item) => ({
                    label: paymentMethodLabels[item.method] ?? item.method,
                    detail: `${item.count} ${item.count === 1 ? 'payment' : 'payments'}`,
                    value: item.amountCentavos,
                    color: paymentMethodColors[item.method] ?? '#64748b',
                  }))}
                />
                <RingChart
                  title="Where balances sit"
                  basis={`As of ${dashboard.asOf}`}
                  chartLabel="Receivables by invoice age"
                  centerLabel="outstanding"
                  empty="No outstanding balance on this date."
                  segments={Object.entries(dashboard.aging).map(
                    ([bucket, value]) => ({
                      label: agingLabels[bucket] ?? bucket,
                      value,
                      color: agingColors[bucket] ?? '#64748b',
                    }),
                  )}
                />
              </section>
              <TrendChart dashboard={dashboard} />
            </>
          ) : null}
        </>
      ) : (
        <section className="role-home">
          <span>Welcome back</span>
          <h2>Your work</h2>
          <p>Open the records and actions available to your role.</p>
          {canCreatePayments && canViewPayments ? (
            <div className="role-home-primary">
              <WorkCard
                action="Receive payment"
                context="Find a subscriber and review the allocation before posting."
                icon={Wallet}
                onClick={() => onNavigate('Payments')}
                title="Start a payment"
              />
            </div>
          ) : null}
          {loading ? (
            <div className="empty-state" role="status">
              Loading your workspace…
            </div>
          ) : null}
          {!loading &&
          !error &&
          !canViewSubscribers &&
          !canViewPayments &&
          !permissions.includes('service.view') ? (
            <p className="role-home-empty">
              No workspaces are assigned to this account. Ask your system
              administrator for access.
            </p>
          ) : null}
          {!loading && !error ? (
            <div className="today-work-grid role-work-grid">
              {canViewSubscribers ? (
                <WorkCard
                  action="Find subscribers"
                  context={`${subscriberCount} accounts available`}
                  icon={Users}
                  onClick={() => onNavigate('Subscribers')}
                  title="Customers"
                />
              ) : null}
              {canViewPayments ? (
                <WorkCard
                  action="Open payments"
                  context={`${paymentCount} posted payments`}
                  icon={Wallet}
                  onClick={() => onNavigate('Payments')}
                  title="Payment history"
                />
              ) : null}
              {permissions.includes('service.view') ? (
                <WorkCard
                  action="Open services"
                  context="Review subscriber service status."
                  icon={Search}
                  onClick={() => onNavigate('Services')}
                  title="Service work"
                />
              ) : null}
            </div>
          ) : null}
        </section>
      )}
      {dashboard && activeDetail === 'receivables' ? (
        <DetailSheet
          description={`Balances as of ${dashboard.asOf}`}
          onClose={() => setActiveDetail(null)}
          title="Receivables detail"
        >
          <div className="detail-sheet-stat">
            <span>Overdue balance</span>
            <strong>{money(dashboard.overdueReceivableCentavos)}</strong>
            <small>{dashboard.overdueSubscribers} overdue subscribers</small>
          </div>
          <p className="detail-sheet-note">
            Current balance: {money(dashboard.currentReceivableCentavos)}.{' '}
            {dashboard.alerts.find(
              (alert) => alert.label === 'Suspension candidates',
            )?.count ?? 0}{' '}
            accounts meet the current suspension threshold.
          </p>
          <h3>Balance by invoice age</h3>
          <ul className="summary-list">
            {Object.entries(dashboard.aging).map(([bucket, amount]) => (
              <li key={bucket}>
                <span>
                  {bucket.replace('_', '–').replace('90–PLUS', '90+')}
                </span>
                <strong>{money(amount)}</strong>
              </li>
            ))}
          </ul>
          <button
            className="primary-action detail-sheet-action"
            onClick={() => {
              setActiveDetail(null);
              onNavigate('Receivables');
            }}
            type="button"
          >
            Open receivables
            <ArrowRight aria-hidden="true" size={17} />
          </button>
        </DetailSheet>
      ) : null}
      {dashboard && activeDetail === 'payments' ? (
        <DetailSheet
          description={`Posted collections from ${dashboard.from} to ${dashboard.to}`}
          onClose={() => setActiveDetail(null)}
          title="Payment detail"
        >
          <div className="detail-sheet-stat">
            <span>Collected</span>
            <strong>{money(dashboard.collectedCentavos)}</strong>
            <small>Based on payment date</small>
          </div>
          <h3>By payment method</h3>
          {dashboard.paymentMethods.length ? (
            <ul className="summary-list">
              {dashboard.paymentMethods.map((item) => (
                <li key={item.method}>
                  <span>
                    {item.method.replace('_', ' ')} · {item.count}
                  </span>
                  <strong>{money(item.amountCentavos)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p>No posted collections in this period.</p>
          )}
          {dashboard.recentPayments.length ? (
            <>
              <h3>Recent payments</h3>
              <ul className="summary-list">
                {dashboard.recentPayments.slice(0, 3).map((item, index) => (
                  <li key={`${item.receiptNumber ?? 'payment'}-${index}`}>
                    <span>
                      {item.subscriberName}
                      <small>
                        {item.paymentDate.slice(0, 10)} · {item.method}
                      </small>
                    </span>
                    <strong>{money(item.amountCentavos)}</strong>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <button
            className="primary-action detail-sheet-action"
            onClick={() => {
              setActiveDetail(null);
              onNavigate('Payments');
            }}
            type="button"
          >
            Open payments
            <ArrowRight aria-hidden="true" size={17} />
          </button>
        </DetailSheet>
      ) : null}
      {dashboard && activeDetail === 'collections' ? (
        <DetailSheet
          description={`Collector activity from ${dashboard.from} to ${dashboard.to}`}
          onClose={() => setActiveDetail(null)}
          title="Field collection detail"
        >
          <h3>Collected and remitted</h3>
          {dashboard.collectors.length ? (
            <ul className="summary-list">
              {dashboard.collectors.map((item) => (
                <li key={item.collector}>
                  <span>
                    {item.collector}
                    <small>
                      Remitted {money(item.remittedCentavos)} · Difference{' '}
                      {money(item.differenceCentavos)}
                    </small>
                  </span>
                  <strong>{money(item.collectedCentavos)}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p>No collection batches in this period.</p>
          )}
          <button
            className="primary-action detail-sheet-action"
            onClick={() => {
              setActiveDetail(null);
              onNavigate('Collections');
            }}
            type="button"
          >
            Open collections
            <ArrowRight aria-hidden="true" size={17} />
          </button>
        </DetailSheet>
      ) : null}
    </div>
  );
}

const paymentMethodLabels: Record<string, string> = {
  CASH: 'Cash',
  GCASH: 'GCash',
  BANK_TRANSFER: 'Bank transfer',
  CHEQUE: 'Cheque',
  OTHER: 'Other',
};
const paymentMethodColors: Record<string, string> = {
  CASH: '#4b8b63',
  GCASH: '#258c84',
  BANK_TRANSFER: '#8071ad',
  CHEQUE: '#d58a28',
  OTHER: '#64748b',
};
const agingLabels: Record<string, string> = {
  CURRENT: 'Current',
  '1_30': '1–30 days',
  '31_60': '31–60 days',
  '61_90': '61–90 days',
  '90_PLUS': '90+ days',
};
const agingColors: Record<string, string> = {
  CURRENT: '#568d6a',
  '1_30': '#33938b',
  '31_60': '#e5a341',
  '61_90': '#df754e',
  '90_PLUS': '#bb5575',
};

type RingSegment = {
  label: string;
  detail?: string;
  value: number;
  color: string;
};

function RingChart({
  title,
  basis,
  chartLabel,
  centerLabel,
  empty,
  segments,
}: {
  title: string;
  basis: string;
  chartLabel: string;
  centerLabel: string;
  empty: string;
  segments: RingSegment[];
}) {
  const visible = segments.filter((segment) => segment.value > 0);
  const total = visible.reduce((sum, segment) => sum + segment.value, 0);
  const circumference = 2 * Math.PI * 70;
  let offset = 0;

  return (
    <section className="data-card dashboard-ring-card">
      <div className="ring-card-heading">
        <h2>{title}</h2>
        <span>{basis}</span>
      </div>
      <div className="ring-card-body">
        <svg
          aria-label={chartLabel}
          className="ring-chart"
          role="img"
          viewBox="0 0 200 200"
        >
          <circle className="ring-track" cx="100" cy="100" r="70" />
          {visible.map((segment) => {
            const start = offset;
            offset += segment.value / total;
            return (
              <circle
                key={segment.label}
                className="ring-segment"
                cx="100"
                cy="100"
                r="70"
                stroke={segment.color}
                strokeDasharray={`${(segment.value / total) * circumference} ${circumference}`}
                strokeDashoffset={-start * circumference}
                transform="rotate(-90 100 100)"
              />
            );
          })}
          <text className="ring-amount" textAnchor="middle" x="100" y="99">
            {money(total)}
          </text>
          <text className="ring-caption" textAnchor="middle" x="100" y="119">
            {centerLabel}
          </text>
        </svg>
        {visible.length ? (
          <ul className="ring-legend">
            {visible.map((segment) => (
              <li key={segment.label}>
                <span
                  className="ring-key"
                  style={{ backgroundColor: segment.color }}
                />
                <span className="ring-legend-name">
                  {segment.label}
                  {segment.detail ? ` · ${segment.detail}` : ''}
                </span>
                <strong>{money(segment.value)}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ring-empty">{empty}</p>
        )}
      </div>
    </section>
  );
}

function TrendChart({ dashboard }: { dashboard: DashboardDto }) {
  const points = dashboard.monthlyTrend;
  const chart = useMemo(() => {
    const max = Math.max(
      1,
      ...points.flatMap((point) => [
        point.billedCentavos,
        point.collectedCentavos,
      ]),
    );
    const width = 720;
    const height = 270;
    const padX = 54;
    const padY = 40;
    const x = (index: number) =>
      padX +
      (points.length < 2
        ? (width - padX * 2) / 2
        : (index * (width - padX * 2)) / (points.length - 1));
    const y = (value: number) =>
      height - padY - (Math.max(0, value) / max) * (height - padY - 22);
    const pathFor = (key: 'billedCentavos' | 'collectedCentavos') =>
      points
        .map(
          (point, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(point[key])}`,
        )
        .join(' ');
    const markers = points.map((point, index) => ({
      period: point.period,
      x: x(index),
      billedY: y(point.billedCentavos),
      collectedY: y(point.collectedCentavos),
    }));
    return {
      width,
      height,
      billed: pathFor('billedCentavos'),
      collected: pathFor('collectedCentavos'),
      markers,
      max,
    };
  }, [points]);

  return (
    <section className="data-card dashboard-trend-card">
      <div className="card-heading">
        <div>
          <span>Monthly comparison</span>
          <h2>Billing versus collection</h2>
        </div>
        <span className="trend-date-range">
          {dashboard.from} – {dashboard.to}
        </span>
      </div>
      {points.length ? (
        <>
          <div className="trend-legend">
            <span>
              <i className="billed-key" />
              Billed · invoice date
            </span>
            <span>
              <i className="collected-key" />
              Collected · payment date
            </span>
          </div>
          {points.length === 1 ? (
            <div
              aria-label="Billing versus collection bars"
              className="single-period-chart"
              role="img"
            >
              <h3>{points[0]!.period}</h3>
              {(
                [
                  ['Billed', points[0]!.billedCentavos, 'billed'],
                  ['Collected', points[0]!.collectedCentavos, 'collected'],
                ] as const
              ).map(([label, value, tone]) => (
                <div className="single-period-row" key={label}>
                  <span>{label}</span>
                  <div className="single-period-track">
                    <i
                      className={`single-period-fill ${tone}`}
                      style={{ width: `${(value / chart.max) * 100}%` }}
                    />
                  </div>
                  <strong>{money(value)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <svg
              aria-label="Monthly billing versus collection trend"
              className="trend-chart"
              viewBox={`0 0 ${chart.width} ${chart.height}`}
              role="img"
            >
              {[0, 1, 2, 3].map((line) => {
                const y = 22 + line * (208 / 3);
                const value = (chart.max * (3 - line)) / 3;
                return (
                  <g key={line}>
                    <text className="trend-axis-label" x="2" y={y + 4}>
                      {axisMoney(value)}
                    </text>
                    <line
                      className="trend-gridline"
                      x1="54"
                      x2="710"
                      y1={y}
                      y2={y}
                    />
                  </g>
                );
              })}
              <path className="trend-line trend-line-billed" d={chart.billed} />
              <path
                className="trend-line trend-line-collected"
                d={chart.collected}
              />
              {chart.markers.map((marker, index) => (
                <g key={marker.period}>
                  <circle
                    className="trend-point trend-point-billed"
                    cx={marker.x}
                    cy={marker.billedY}
                    r="4"
                  />
                  <circle
                    className="trend-point trend-point-collected"
                    cx={marker.x}
                    cy={marker.collectedY}
                    r="4"
                  />
                  {(index % Math.ceil(points.length / 6) === 0 ||
                    index === points.length - 1) && (
                    <text
                      className="trend-axis-label trend-period-label"
                      textAnchor="middle"
                      x={marker.x}
                      y="258"
                    >
                      {marker.period}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          )}
          <details className="trend-data">
            <summary>View monthly figures</summary>
            <div className="table-scroll">
              <table
                className="trend-table"
                aria-label="Monthly billing and collection values"
              >
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Billed</th>
                    <th>Collected</th>
                    <th>Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((point) => (
                    <tr key={point.period}>
                      <th scope="row">{point.period}</th>
                      <td>{money(point.billedCentavos)}</td>
                      <td>{money(point.collectedCentavos)}</td>
                      <td>{money(point.differenceCentavos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <div className="empty-state">
          No billing or payment activity in this period.
        </div>
      )}
    </section>
  );
}
