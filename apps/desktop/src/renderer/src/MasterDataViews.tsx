import type { PermissionCode, SubscriberProfileDto } from '@bcis/contracts';
import { useEffect, useRef, useState } from 'react';

import type { ReferenceData } from '../../shared/desktop-api';
import { SubscriberBillingPanel } from './BillingViews';
import { SubscriberActivity } from './SubscriberActivity';
import {
  SubscriberCreateWizard,
  ServiceCreateWizard,
} from './SubscriberWizards';
import type { AppViewId } from './navigation';

const money = (centavos: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
    centavos / 100,
  );
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The request could not be completed.';
function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export { PlansView } from './PlansView';

export function SubscribersView({
  permissions,
  initialSubscriberId,
  onNavigate,
  onProfileSelected,
}: {
  permissions: PermissionCode[];
  initialSubscriberId?: string;
  onNavigate: (view: AppViewId) => void;
  onProfileSelected?: (subscriberId: string | undefined) => void;
}) {
  const canManage = permissions.includes('subscriber.manage');
  const canManageService = permissions.includes('service.manage');
  const canViewBilling = permissions.includes('billing.view');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
  } as Awaited<
    ReturnType<NonNullable<typeof window.bcis>['masterData']['listSubscribers']>
  >);
  const [selected, setSelected] = useState<SubscriberProfileDto | null>(null);
  const [references, setReferences] = useState<ReferenceData | null>(null);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const listRequest = useRef(0);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() =>
      !navigator.userAgent.includes('jsdom')
        ? window.scrollTo({ top: 0 })
        : undefined,
    );
    return () => window.cancelAnimationFrame(frame);
  }, [selected?.id, selected?.serviceCount, selected?.status]);
  async function load(nextPage = page, nextQuery = query) {
    const request = ++listRequest.current;
    if (!window.bcis) return;
    setLoading(true);
    setError('');
    try {
      const next = await window.bcis.masterData.listSubscribers({
        q: nextQuery,
        page: nextPage,
        pageSize: 20,
      });
      if (request === listRequest.current) setResult(next);
    } catch (caught) {
      if (request === listRequest.current) setError(message(caught));
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [page]);
  useEffect(() => {
    void window.bcis?.masterData
      .references()
      .then(setReferences)
      .catch((caught) => setError(message(caught)));
  }, []);
  useEffect(() => {
    if (!initialSubscriberId || selected?.id === initialSubscriberId) return;
    let current = true;
    void window.bcis?.masterData
      .getSubscriber(initialSubscriberId)
      .then((profile) => {
        if (current) setSelected(profile);
      })
      .catch((caught) => {
        if (current) setError(message(caught));
      });
    return () => {
      current = false;
    };
  }, [initialSubscriberId, selected?.id]);
  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (page === 1) void load(1, query);
    else setPage(1);
  }
  async function open(id: string) {
    try {
      const profile = await window.bcis!.masterData.getSubscriber(id);
      setSelected(profile);
      onProfileSelected?.(profile.id);
    } catch (caught) {
      setError(message(caught));
    }
  }
  async function create(input: Record<string, unknown>) {
    const created = await window.bcis!.masterData.createSubscriber(input);
    setShowCreate(false);
    setSelected(created);
    onProfileSelected?.(created.id);
    void load();
  }
  if (selected)
    return (
      <SubscriberProfile
        key={selected.id}
        profile={selected}
        references={references}
        canManage={canManage}
        canManageService={canManageService}
        canViewBilling={canViewBilling}
        permissions={permissions}
        onNavigate={onNavigate}
        onBack={() => {
          setSelected(null);
          onProfileSelected?.(undefined);
          void load();
        }}
        onRefresh={() => open(selected.id)}
      />
    );
  return (
    <div className="data-layout">
      {showCreate ? (
        references ? (
          <SubscriberCreateWizard
            references={references}
            onCancel={() => setShowCreate(false)}
            onCreate={create}
          />
        ) : (
          <section className="data-card">
            {error ? (
              <div className="form-error" role="alert">
                {error}
              </div>
            ) : (
              <div className="empty-state" role="status">
                Loading setup options…
              </div>
            )}
            <button onClick={() => setShowCreate(false)} type="button">
              Back to subscribers
            </button>
          </section>
        )
      ) : (
        <section className="subscriber-directory">
          <div className="subscriber-directory-header">
            <div>
              <span className="journey-eyebrow">Subscriber workspace</span>
              <h2>Find a subscriber</h2>
              <p>Open one account to see its services, money, and history.</p>
            </div>
            {canManage ? (
              <button
                className="primary-action"
                onClick={() => setShowCreate(true)}
                type="button"
              >
                Register subscriber
              </button>
            ) : null}
          </div>
          <form className="subscriber-search-form" onSubmit={search}>
            <input
              aria-label="Search accounts"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Account, name, contact, address, or service number"
              type="search"
              value={query}
            />
            <button type="submit">Find account</button>
          </form>
          {error ? (
            <div className="form-error" role="alert">
              {error}
            </div>
          ) : null}
          <div
            aria-label="Subscriber accounts"
            className="subscriber-card-grid"
          >
            {result.items.map((item) => (
              <button
                aria-label={`Open profile for ${item.fullName}`}
                className="subscriber-directory-card"
                key={item.id}
                onClick={() => void open(item.id)}
                type="button"
              >
                <span aria-hidden="true" className="subscriber-card-avatar">
                  {item.fullName.slice(0, 1)}
                </span>
                <span className="subscriber-card-body">
                  <strong>{item.fullName}</strong>
                  <small>
                    {item.accountNumber} · {item.serviceCount}{' '}
                    {item.serviceCount === 1 ? 'service' : 'services'}
                  </small>
                  <span>{item.primaryContact ?? 'No primary contact'}</span>
                  <span>{item.primaryAddress ?? 'No address on file'}</span>
                  <span className="subscriber-card-bottom">
                    <em>{item.status.toLowerCase()}</em>
                    <b>Open profile →</b>
                  </span>
                </span>
              </button>
            ))}
          </div>
          {loading ? (
            <div className="empty-state" role="status">
              Loading subscribers…
            </div>
          ) : null}
          {!loading && !result.items.length ? (
            <div className="empty-state">No subscribers match this search.</div>
          ) : null}
          <div className="pagination">
            <span>
              {result.total} records · Page {result.page}
            </span>
            <div>
              <button
                disabled={page === 1}
                onClick={() => setPage((value) => value - 1)}
                type="button"
              >
                Previous
              </button>
              <button
                disabled={page * result.pageSize >= result.total}
                onClick={() => setPage((value) => value + 1)}
                type="button"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function SubscriberProfile({
  profile,
  references,
  canManage,
  canManageService,
  canViewBilling,
  permissions,
  onNavigate,
  onBack,
  onRefresh,
}: {
  profile: SubscriberProfileDto;
  references: ReferenceData | null;
  canManage: boolean;
  canManageService: boolean;
  canViewBilling: boolean;
  permissions: PermissionCode[];
  onNavigate: (view: AppViewId) => void;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const [tab, setTab] = useState('overview');
  const [moneyMode, setMoneyMode] = useState<'billing' | 'ledger'>('billing');
  const [showAddService, setShowAddService] = useState(false);
  const [error, setError] = useState('');
  const [balance, setBalance] = useState<{
    asOf: string;
    currentCentavos: number;
    overdueCentavos: number;
    totalCentavos: number;
    followUpAccounts: number;
  } | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState('');
  const canViewReceivables = permissions.includes('receivable.view');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeServiceCount = profile.serviceAccounts.filter(
    (service) => service.status === 'ACTIVE',
  ).length;
  const otherServiceCount = profile.serviceAccounts.length - activeServiceCount;
  const profileTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'services', label: `Services · ${profile.serviceAccounts.length}` },
    ...(canViewBilling ? [{ id: 'money', label: 'Money' }] : []),
    { id: 'history', label: 'History' },
  ];
  useEffect(() => {
    setTab('overview');
  }, [profile.id]);
  useEffect(() => {
    if (!canViewReceivables || !window.bcis) {
      setBalance(null);
      setBalanceLoading(false);
      setBalanceError('');
      return;
    }
    let current = true;
    const asOf = localDate();
    setBalance(null);
    setBalanceLoading(true);
    setBalanceError('');
    void (async () => {
      let page = 1;
      let total = Number.POSITIVE_INFINITY;
      let currentCentavos = 0;
      let overdueCentavos = 0;
      let totalCentavos = 0;
      let followUpAccounts = 0;
      while ((page - 1) * 100 < total) {
        const result = await window.bcis!.receivables.list({
          q: profile.accountNumber,
          asOf,
          page,
          pageSize: 100,
        });
        total = result.total;
        for (const account of result.items) {
          if (account.subscriberId !== profile.id) continue;
          currentCentavos += account.currentCentavos;
          overdueCentavos += account.totalArrearsCentavos;
          totalCentavos += account.totalOutstandingCentavos;
          if (account.followUp) followUpAccounts += 1;
        }
        page += 1;
      }
      if (current)
        setBalance({
          asOf,
          currentCentavos,
          overdueCentavos,
          totalCentavos,
          followUpAccounts,
        });
    })()
      .catch((caught: unknown) => {
        if (current) setBalanceError(message(caught));
      })
      .finally(() => {
        if (current) setBalanceLoading(false);
      });
    return () => {
      current = false;
    };
  }, [canViewReceivables, profile.accountNumber, profile.id]);
  function moveTab(event: React.KeyboardEvent<HTMLButtonElement>) {
    const activeIndex = profileTabs.findIndex((item) => item.id === tab);
    let nextIndex: number;
    if (event.key === 'ArrowRight')
      nextIndex = (activeIndex + 1) % profileTabs.length;
    else if (event.key === 'ArrowLeft')
      nextIndex = (activeIndex - 1 + profileTabs.length) % profileTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = profileTabs.length - 1;
    else return;
    event.preventDefault();
    const next = profileTabs[nextIndex];
    if (!next) return;
    setTab(next.id);
    tabRefs.current[next.id]?.focus();
  }
  async function status(status: string) {
    try {
      await window.bcis!.masterData.changeSubscriberStatus(
        profile.id,
        status,
        `Status changed to ${status.toLowerCase()}.`,
      );
      onRefresh();
    } catch (caught) {
      setError(message(caught));
    }
  }
  async function addService(input: Record<string, unknown>) {
    await window.bcis!.masterData.createServiceAccount(profile.id, input);
    setShowAddService(false);
    onRefresh();
  }
  return (
    <div className="profile-stack">
      <button className="back-link" onClick={onBack} type="button">
        ← Back to subscribers
      </button>
      <section aria-label="Subscriber identity" className="profile-hero">
        <div className="profile-identity">
          <div className="profile-identity-topline">
            <span className="profile-account-number">
              Account · {profile.accountNumber}
            </span>
            <span
              aria-label={`Subscriber status ${profile.status.toLowerCase()}`}
              className={`record-status ${profile.status === 'ACTIVE' ? 'active' : ''}`}
            >
              {profile.status}
            </span>
          </div>
          <h2>{profile.fullName}</h2>
          <p>{profile.primaryAddress ?? 'No address on file'}</p>
          <div className="profile-meta">
            <span>{profile.primaryContact ?? 'No primary contact'}</span>
            <span>{profile.collectionArea?.name ?? 'No collection area'}</span>
            <span>
              {profile.assignedCollector?.name ?? 'Unassigned collector'}
            </span>
          </div>
          <div
            aria-label="Service overview"
            className="profile-service-summary"
            role="group"
          >
            <span>Connected services</span>
            <strong>{activeServiceCount} active</strong>
            {otherServiceCount > 0 ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{otherServiceCount} not active</span>
              </>
            ) : null}
            <span aria-hidden="true">·</span>
            <span>
              {profile.serviceAccounts.length}{' '}
              {profile.serviceAccounts.length === 1
                ? 'total service'
                : 'total services'}
              {profile.serviceAccounts.length === 0
                ? ' · no connection yet'
                : ''}
            </span>
          </div>
          {canViewReceivables ? (
            <div
              aria-label="Subscriber balance context"
              className="profile-balance-context"
              role="group"
            >
              <div className="profile-balance-heading">
                <strong>Receivable snapshot</strong>
                {balance ? <span>As of {balance.asOf}</span> : null}
              </div>
              {balanceLoading ? (
                <p role="status">Loading subscriber balances…</p>
              ) : balanceError ? (
                <p role="status">Balance summary unavailable: {balanceError}</p>
              ) : balance ? (
                <dl>
                  <div>
                    <dt>Current</dt>
                    <dd>{money(balance.currentCentavos)}</dd>
                  </div>
                  <div>
                    <dt>Overdue</dt>
                    <dd>{money(balance.overdueCentavos)}</dd>
                  </div>
                  <div>
                    <dt>Total outstanding</dt>
                    <dd>{money(balance.totalCentavos)}</dd>
                  </div>
                  <div>
                    <dt>Needs follow-up</dt>
                    <dd>{balance.followUpAccounts}</dd>
                  </div>
                </dl>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="profile-actions">
          {canManage && profile.status !== 'ARCHIVED' ? (
            <>
              <button
                type="button"
                onClick={() =>
                  status(profile.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')
                }
              >
                {profile.status === 'ACTIVE'
                  ? 'Deactivate subscriber'
                  : 'Reactivate subscriber'}
              </button>
              <button
                className="danger-action"
                onClick={() => status('ARCHIVED')}
                type="button"
              >
                Archive
              </button>
            </>
          ) : null}
        </div>
      </section>
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      <div
        aria-label="Subscriber account sections"
        className="profile-tabs"
        role="tablist"
      >
        {profileTabs.map((item) => (
          <button
            aria-controls="subscriber-profile-panel"
            aria-selected={tab === item.id}
            id={`subscriber-profile-tab-${item.id}`}
            key={item.id}
            onClick={() => setTab(item.id)}
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
      <div
        aria-labelledby={`subscriber-profile-tab-${tab}`}
        className="profile-panel"
        id="subscriber-profile-panel"
        role="tabpanel"
        tabIndex={0}
      >
        {tab === 'overview' ? (
          <div className="profile-overview-stack">
            <div className="profile-overview-cards">
              <section className="data-card detail-list">
                <div className="card-heading">
                  <div>
                    <span>Ways to reach them</span>
                    <h2>Contacts</h2>
                  </div>
                </div>
                {profile.contacts.map((item) => (
                  <div key={item.id}>
                    <strong>
                      {item.type}
                      {item.isPrimary ? ' · Primary' : ''}
                    </strong>
                    <span>{item.value}</span>
                  </div>
                ))}
                {!profile.contacts.length ? (
                  <p>No contact details on file.</p>
                ) : null}
              </section>
              <section className="data-card detail-list">
                <div className="card-heading">
                  <div>
                    <span>Service location</span>
                    <h2>Addresses</h2>
                  </div>
                </div>
                {profile.addresses.map((item) => (
                  <div key={item.id}>
                    <strong>
                      {item.label}
                      {item.isPrimary ? ' · Primary' : ''}
                    </strong>
                    <span>{item.addressLine}</span>
                  </div>
                ))}
                {!profile.addresses.length ? <p>No address on file.</p> : null}
              </section>
            </div>
            <SubscriberActivity
              subscriberId={profile.id}
              permissions={permissions}
              onNavigate={onNavigate}
            />
          </div>
        ) : null}
        {tab === 'services' ? (
          <section className="data-card">
            <div className="card-heading">
              <div>
                <span>Connected services</span>
                <h2>{profile.serviceAccounts.length} service accounts</h2>
              </div>
              {canManageService &&
              references &&
              profile.status !== 'ARCHIVED' &&
              !showAddService ? (
                <button
                  className="primary-action"
                  onClick={() => setShowAddService(true)}
                  type="button"
                >
                  Add service
                </button>
              ) : null}
            </div>
            <div className="profile-service-cards">
              {profile.serviceAccounts.map((service) => (
                <article className="service-row" key={service.id}>
                  <div>
                    <strong>{service.accountNumber}</strong>
                    <span>
                      {service.planName} · {service.serviceTypeCode}
                    </span>
                  </div>
                  <div>
                    <strong>{money(service.currentRateCentavos)}</strong>
                    <span>
                      Billing {service.billingDay} · Due {service.dueDay}
                    </span>
                    <span
                      className={`record-status ${service.status === 'ACTIVE' ? 'active' : ''}`}
                    >
                      {service.status}
                    </span>
                  </div>
                </article>
              ))}
            </div>
            {!profile.serviceAccounts.length ? (
              <div className="empty-state profile-empty-state">
                <strong>No connected services</strong>
                <span>Add a service account when the subscriber is ready.</span>
              </div>
            ) : null}
            {canManageService &&
            references &&
            profile.status !== 'ARCHIVED' &&
            showAddService ? (
              <ServiceCreateWizard
                profile={profile}
                references={references}
                onCancel={() => setShowAddService(false)}
                onCreate={addService}
              />
            ) : null}
          </section>
        ) : null}
        {tab === 'money' ? (
          <div className="profile-money-stack">
            <div
              aria-label="Money sections"
              className="profile-money-switch"
              role="group"
            >
              <button
                aria-pressed={moneyMode === 'billing'}
                onClick={() => setMoneyMode('billing')}
                type="button"
              >
                Invoices
              </button>
              <button
                aria-pressed={moneyMode === 'ledger'}
                onClick={() => setMoneyMode('ledger')}
                type="button"
              >
                Ledger
              </button>
            </div>
            <SubscriberBillingPanel
              mode={moneyMode}
              subscriberId={profile.id}
            />
          </div>
        ) : null}
        {tab === 'history' ? (
          <section className="data-card detail-list">
            {profile.events.map((item) => (
              <div key={item.id}>
                <strong>
                  {item.previousStatus ? `${item.previousStatus} → ` : ''}
                  {item.newStatus}
                </strong>
                <span>
                  {item.reason} · {new Date(item.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
            {!profile.events.length ? (
              <div className="empty-state profile-empty-state">
                <strong>No service history</strong>
                <span>Service status changes will appear here.</span>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
