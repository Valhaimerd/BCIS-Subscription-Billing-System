import type {
  DashboardDto,
  PaymentSummaryDto,
  PermissionCode,
} from '@bcis/contracts';
import { ArrowRight, CircleCheck, Search, Users, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { AppViewId } from './navigation';

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
  const [period, setPeriod] = useState(initialPeriod);
  const [dashboard, setDashboard] = useState<DashboardDto | null>(null);
  const [paymentCount, setPaymentCount] = useState(0);
  const [recentRolePayments, setRecentRolePayments] = useState<
    PaymentSummaryDto[]
  >([]);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

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
              pageSize: 6,
              status: 'POSTED',
            })
            .then((result) => {
              if (current) {
                setPaymentCount(result.total);
                setRecentRolePayments(result.items.slice(0, 5));
              }
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

  const setDate = (key: 'from' | 'to', value: string) =>
    setPeriod((current) => ({ ...current, [key]: value }));

  return (
    <div className="data-layout dashboard-view">
      {error ? (
        <div className="dashboard-error form-error" role="alert">
          {error}
          <button
            onClick={() => setRefreshKey((current) => current + 1)}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : null}
      {canViewReports ? (
        <>
          <section className="dashboard-hero data-card">
            <div className="dashboard-hero-copy">
              <span>Financial overview</span>
              <h2>Billing, collections, and follow-up</h2>
              <p>
                Billing follows invoice dates. Collections follow payment dates,
                so each series can describe different activity.
              </p>
            </div>
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
              <section className="dashboard-attention data-card">
                <div className="card-heading">
                  <div>
                    <span>Priority queue</span>
                    <h2>Needs attention</h2>
                  </div>
                  {canViewReceivables ? (
                    <button
                      className="text-action"
                      onClick={() => onNavigate('Receivables')}
                      type="button"
                    >
                      Open receivables{' '}
                      <ArrowRight aria-hidden="true" size={16} />
                    </button>
                  ) : null}
                </div>
                {dashboard.alerts.some((alert) => alert.count > 0) ? (
                  <ul className="attention-items">
                    {dashboard.alerts
                      .filter((alert) => alert.count > 0)
                      .map((alert) => (
                        <li key={alert.label}>
                          <span>{alert.label}</span>
                          <strong>{alert.count}</strong>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="all-clear">
                    <CircleCheck aria-hidden="true" size={18} />
                    All caught up. No overdue follow-up actions.
                  </p>
                )}
              </section>
              <section
                className="indicator-grid"
                aria-label="Management indicators"
              >
                {[
                  [
                    'Current receivable',
                    money(dashboard.currentReceivableCentavos),
                  ],
                  [
                    'Overdue receivable',
                    money(dashboard.overdueReceivableCentavos),
                  ],
                  ['Overdue subscribers', String(dashboard.overdueSubscribers)],
                  [
                    'Accounts for follow-up',
                    String(dashboard.followUpAccounts),
                  ],
                  ['Billed', money(dashboard.billedCentavos)],
                  ['Collected', money(dashboard.collectedCentavos)],
                ].map(([label, value]) => (
                  <article className="indicator" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small>As of {dashboard.asOf}</small>
                  </article>
                ))}
              </section>
              <TrendChart dashboard={dashboard} />
              <div className="dashboard-grid report-dashboard-grid">
                <SummaryCard title="Payment mix" eyebrow="Posted collections">
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
                </SummaryCard>
                <SummaryCard
                  title="Aging"
                  eyebrow={`Accounts receivable · as of ${dashboard.asOf}`}
                >
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
                </SummaryCard>
                <SummaryCard
                  title="Collection accountability"
                  eyebrow="Collector remittance"
                >
                  {dashboard.collectors.length ? (
                    <ul className="summary-list">
                      {dashboard.collectors.map((item) => (
                        <li key={item.collector}>
                          <span>
                            {item.collector}
                            <small>
                              Remitted {money(item.remittedCentavos)}
                            </small>
                          </span>
                          <strong>{money(item.collectedCentavos)}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="empty-state">
                      No collection batches in this period.
                    </div>
                  )}
                </SummaryCard>
                <SummaryCard title="Recent payments" eyebrow="Cashier activity">
                  <ul className="summary-list recent-payments">
                    {dashboard.recentPayments.map((item, index) => (
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
                </SummaryCard>
              </div>
              <div className="dashboard-links">
                <button onClick={() => onNavigate('Reports')} type="button">
                  Explore reports <ArrowRight aria-hidden="true" size={16} />
                </button>
                {canViewReceivables ? (
                  <button
                    onClick={() => onNavigate('Receivables')}
                    type="button"
                  >
                    Review receivables{' '}
                    <ArrowRight aria-hidden="true" size={16} />
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </>
      ) : (
        <section className="role-home data-card">
          <span>Welcome back</span>
          <h2>Your work</h2>
          <p>Open the records and actions available to your role.</p>
          {loading ? (
            <div className="empty-state" role="status">
              Loading your workspace…
            </div>
          ) : null}
          <div className="role-home-actions">
            {canViewSubscribers ? (
              <button onClick={() => onNavigate('Subscribers')} type="button">
                <Users aria-hidden="true" />
                <span>
                  Find subscribers
                  <small>{subscriberCount} accounts available</small>
                </span>
                <ArrowRight aria-hidden="true" />
              </button>
            ) : null}
            {canViewPayments ? (
              <section className="role-home-payment-card">
                <button onClick={() => onNavigate('Payments')} type="button">
                  <Wallet aria-hidden="true" />
                  <span>
                    Payment history<small>{paymentCount} posted payments</small>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </button>
                {recentRolePayments.length ? (
                  <ul className="summary-list recent-payments">
                    {recentRolePayments.map((payment) => (
                      <li key={payment.id}>
                        <span>
                          {payment.subscriberName}
                          <small>
                            {payment.paymentDate.slice(0, 10)} ·{' '}
                            {payment.method}
                          </small>
                        </span>
                        <strong>{money(payment.amountCentavos)}</strong>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}
            {permissions.includes('service.view') ? (
              <button onClick={() => onNavigate('Services')} type="button">
                <Search aria-hidden="true" />
                <span>
                  Service work<small>Review subscriber service status</small>
                </span>
                <ArrowRight aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </section>
      )}
    </div>
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
    const height = 250;
    const padX = 54;
    const padY = 22;
    const x = (index: number) =>
      padX +
      (points.length < 2
        ? (width - padX * 2) / 2
        : (index * (width - padX * 2)) / (points.length - 1));
    const y = (value: number) =>
      height - padY - (Math.max(0, value) / max) * (height - padY * 2);
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
          <svg
            aria-hidden="true"
            className="trend-chart"
            viewBox={`0 0 ${chart.width} ${chart.height}`}
            role="presentation"
          >
            {[0, 1, 2, 3].map((line) => {
              const y = 22 + line * 68;
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
            {chart.markers.map((marker) => (
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
              </g>
            ))}
          </svg>
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
        </>
      ) : (
        <div className="empty-state">
          No billing or payment activity in this period.
        </div>
      )}
    </section>
  );
}

function SummaryCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="data-card">
      <div className="card-heading">
        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}
