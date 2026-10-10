import type {
  PermissionCode,
  PlanDto,
  SubscriberProfileDto,
} from '@bcis/contracts';
import { useEffect, useRef, useState } from 'react';

import type { ReferenceData } from '../../shared/desktop-api';
import { ActionDialog } from './ActionDialog';
import { SubscriberBillingPanel } from './BillingViews';
import { SubscriberActivity } from './SubscriberActivity';
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
function toCentavos(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error('Enter a valid price with up to two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error('Monthly price must be greater than zero.');
  return amount;
}

export function PlansView({ canManage }: { canManage: boolean }) {
  const [plans, setPlans] = useState<PlanDto[]>([]);
  const [pricePlan, setPricePlan] = useState<PlanDto | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [serviceType, setServiceType] =
    useState<PlanDto['serviceTypeCode']>('INTERNET');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priceOrder, setPriceOrder] = useState('name');
  const request = useRef(0);

  async function load() {
    const current = ++request.current;
    setLoading(true);
    setLoadError('');
    try {
      const result = await window.bcis!.masterData.listPlans();
      if (current === request.current) setPlans(result);
    } catch (caught) {
      if (current === request.current) setLoadError(message(caught));
    } finally {
      if (current === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError('');
    setNotice('');
    setBusy('create');
    const form = new FormData(event.currentTarget);
    const type = String(form.get('serviceTypeCode'));
    try {
      await window.bcis?.masterData.createPlan({
        serviceTypeCode: type,
        code: String(form.get('code')),
        name: String(form.get('name')),
        priceCentavos: toCentavos(String(form.get('price'))),
        speedMbps: type === 'CABLE' ? null : Number(form.get('speedMbps')),
        channelCount:
          type === 'INTERNET' ? null : Number(form.get('channelCount')),
      });
      formElement.reset();
      setServiceType('INTERNET');
      setShowCreate(false);
      setNotice('Service plan created.');
      await load();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy('');
    }
  }
  async function changePrice(plan: PlanDto, values: Record<string, string>) {
    await window.bcis?.masterData.updatePlan(plan.id, {
      priceCentavos: toCentavos(values.price ?? ''),
      reason: values.reason?.trim(),
    });
    setNotice(
      `Price updated for ${plan.name}; the reason is recorded in audit history.`,
    );
    await load();
  }
  async function toggle(plan: PlanDto) {
    setError('');
    setNotice('');
    setBusy(`toggle:${plan.id}`);
    try {
      await window.bcis?.masterData.updatePlan(plan.id, {
        isActive: !plan.isActive,
      });
      setNotice(
        `${plan.name} is now ${plan.isActive ? 'inactive' : 'active'}.`,
      );
      await load();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy('');
    }
  }
  const visiblePlans = plans
    .filter((plan) => {
      const term = query.trim().toLocaleLowerCase();
      const matchesQuery =
        !term ||
        `${plan.code} ${plan.name} ${plan.serviceTypeCode}`
          .toLocaleLowerCase()
          .includes(term);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? plan.isActive : !plan.isActive);
      return matchesQuery && matchesStatus;
    })
    .sort((left, right) =>
      priceOrder === 'low'
        ? left.priceCentavos - right.priceCentavos
        : priceOrder === 'high'
          ? right.priceCentavos - left.priceCentavos
          : left.name.localeCompare(right.name),
    );
  return (
    <div className="data-layout">
      <section className="data-card table-card">
        <div className="card-heading">
          <div>
            <span>Master data</span>
            <h2>Service plans</h2>
          </div>
          <div className="plan-table-summary">
            <small>
              {visiblePlans.length} of {plans.length}{' '}
              {plans.length === 1 ? 'plan' : 'plans'}
            </small>
            {canManage ? (
              <button
                className="primary-action compact"
                onClick={() => setShowCreate((value) => !value)}
                type="button"
              >
                {showCreate ? 'Close form' : 'Add service plan'}
              </button>
            ) : null}
          </div>
        </div>
        {showCreate ? (
          <form className="form-grid plan-create-form" onSubmit={create}>
            <label>
              Service type
              <select
                name="serviceTypeCode"
                onChange={(event) =>
                  setServiceType(
                    event.target.value as PlanDto['serviceTypeCode'],
                  )
                }
                value={serviceType}
              >
                <option value="INTERNET">Internet</option>
                <option value="CABLE">Cable</option>
                <option value="COMBO">Combo</option>
              </select>
            </label>
            <label>
              Code
              <input autoComplete="off" name="code" required />
            </label>
            <label>
              Name
              <input name="name" required />
            </label>
            <label>
              Monthly price (PHP)
              <input
                inputMode="decimal"
                min="0.01"
                name="price"
                required
                step="0.01"
                type="number"
              />
            </label>
            {serviceType !== 'CABLE' ? (
              <label>
                Speed (Mbps)
                <input
                  defaultValue="25"
                  min="1"
                  name="speedMbps"
                  required
                  type="number"
                />
              </label>
            ) : null}
            {serviceType !== 'INTERNET' ? (
              <label>
                Channels
                <input
                  defaultValue="60"
                  min="1"
                  name="channelCount"
                  required
                  type="number"
                />
              </label>
            ) : null}
            <div className="form-actions span-two">
              <button
                className="primary-action"
                disabled={busy !== ''}
                type="submit"
              >
                {busy === 'create' ? 'Creating plan…' : 'Create plan'}
              </button>
              <button
                disabled={busy !== ''}
                onClick={() => setShowCreate(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}
        <div className="plan-table-controls">
          <label>
            <span className="sr-only">Search service plans</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by plan name, code, or service type"
              type="search"
              value={query}
            />
          </label>
          <label>
            <span className="sr-only">Plan status</span>
            <select
              aria-label="Plan status"
              onChange={(event) => setStatusFilter(event.target.value)}
              value={statusFilter}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Sort plans by price</span>
            <select
              aria-label="Sort plans by price"
              onChange={(event) => setPriceOrder(event.target.value)}
              value={priceOrder}
            >
              <option value="name">Sort: plan name</option>
              <option value="low">Price: low to high</option>
              <option value="high">Price: high to low</option>
            </select>
          </label>
        </div>
        {error ? (
          <div className="form-error" role="alert">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="success-notice" role="status">
            {notice}
          </div>
        ) : null}
        {loadError ? (
          <div className="form-error" role="alert">
            {loadError}{' '}
            <button onClick={() => void load()} type="button">
              Retry loading plans
            </button>
          </div>
        ) : null}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Plan</th>
                <th>Type</th>
                <th>Attributes</th>
                <th>Price</th>
                <th>Status</th>
                {canManage ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {visiblePlans.map((plan) => (
                <tr key={plan.id}>
                  <td>{plan.code}</td>
                  <td>{plan.name}</td>
                  <td>{plan.serviceTypeCode}</td>
                  <td>
                    {[
                      plan.speedMbps && `${plan.speedMbps} Mbps`,
                      plan.channelCount && `${plan.channelCount} channels`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </td>
                  <td>{money(plan.priceCentavos)}</td>
                  <td>
                    <span
                      className={`record-status ${plan.isActive ? 'active' : ''}`}
                    >
                      {plan.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {canManage ? (
                    <td>
                      <div className="row-actions">
                        <button
                          disabled={busy !== ''}
                          onClick={() => setPricePlan(plan)}
                          type="button"
                        >
                          Change price
                        </button>
                        <button
                          disabled={busy !== ''}
                          onClick={() => void toggle(plan)}
                          type="button"
                        >
                          {busy === `toggle:${plan.id}`
                            ? 'Saving…'
                            : plan.isActive
                              ? 'Deactivate'
                              : 'Activate'}
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading ? (
          <p className="inline-loading" role="status">
            Loading service plans…
          </p>
        ) : !visiblePlans.length && !loadError ? (
          <div className="empty-state">
            {plans.length
              ? 'No service plans match these filters.'
              : 'No service plans have been created yet.'}
          </div>
        ) : null}
      </section>
      {pricePlan ? (
        <ActionDialog
          ariaLabel="Change plan price"
          title={`Change ${pricePlan.name} price`}
          description="Enter the new monthly rate and the approval reason. Existing service rates and posted invoices remain unchanged."
          submitLabel="Save price"
          fields={[
            {
              name: 'price',
              label: 'New monthly price (PHP)',
              type: 'number',
              inputMode: 'decimal',
              min: '0.01',
              step: '0.01',
              required: true,
              defaultValue: (pricePlan.priceCentavos / 100).toFixed(2),
            },
            {
              name: 'reason',
              label: 'Reason for price change',
              type: 'text',
              autoComplete: 'off',
              placeholder: 'For example: approved annual rate review',
              required: true,
            },
          ]}
          onClose={() => setPricePlan(null)}
          onSubmit={(values) => changePrice(pricePlan, values)}
          validate={({ price }) => {
            try {
              toCentavos(price ?? '');
              return null;
            } catch (caught) {
              return message(caught);
            }
          }}
        />
      ) : null}
    </div>
  );
}

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
  useEffect(() => {
    const frame = window.requestAnimationFrame(() =>
      !navigator.userAgent.includes('jsdom')
        ? window.scrollTo({ top: 0 })
        : undefined,
    );
    return () => window.cancelAnimationFrame(frame);
  }, [selected?.id, selected?.serviceCount, selected?.status]);
  const load = () =>
    window.bcis?.masterData
      .listSubscribers({ q: query, page, pageSize: 20 })
      .then(setResult)
      .catch((caught) => setError(message(caught)));
  useEffect(() => {
    void load();
  }, [page]);
  useEffect(() => {
    void window.bcis?.masterData.references().then(setReferences);
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
    setPage(1);
    load();
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
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError('');
    try {
      const created = await window.bcis!.masterData.createSubscriber({
        accountNumber: String(form.get('accountNumber')),
        fullName: String(form.get('fullName')),
        collectionAreaId: String(form.get('collectionAreaId')) || null,
        assignedCollectorId: String(form.get('assignedCollectorId')) || null,
        notes: String(form.get('notes')),
        defaultBillingDay: Number(form.get('defaultBillingDay')),
        defaultDueDay: Number(form.get('defaultDueDay')),
        addresses: [
          {
            label: 'Primary',
            addressLine: String(form.get('address')),
            isPrimary: true,
          },
        ],
        contacts: [
          {
            type: String(form.get('contactType')),
            value: String(form.get('contact')),
            isPrimary: true,
          },
        ],
      });
      setShowCreate(false);
      setSelected(created);
      onProfileSelected?.(created.id);
      load();
    } catch (caught) {
      setError(message(caught));
    }
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
          load();
        }}
        onRefresh={() => open(selected.id)}
      />
    );
  return (
    <div className="data-layout">
      <section className="data-card table-card">
        <div className="card-heading">
          <div>
            <span>Subscriber master</span>
            <h2>Accounts</h2>
          </div>
          {canManage ? (
            <button
              className="primary-action compact"
              onClick={() => setShowCreate((value) => !value)}
              type="button"
            >
              {showCreate ? 'Cancel' : 'Register subscriber'}
            </button>
          ) : null}
        </div>
        {showCreate && references ? (
          <form className="form-grid wide-form" onSubmit={create}>
            <label>
              Subscriber number
              <input name="accountNumber" required />
            </label>
            <label>
              Full name
              <input name="fullName" required />
            </label>
            <label>
              Primary contact type
              <select name="contactType">
                <option value="MOBILE">Mobile</option>
                <option value="EMAIL">Email</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label>
              Primary contact
              <input name="contact" required />
            </label>
            <label className="span-two">
              Primary address
              <input name="address" required />
            </label>
            <label>
              Collection area
              <select name="collectionAreaId">
                <option value="">Unassigned</option>
                {references.collectionAreas.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Collector
              <select name="assignedCollectorId">
                <option value="">Unassigned</option>
                {references.collectors.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Default billing day
              <input
                defaultValue="1"
                max="28"
                min="1"
                name="defaultBillingDay"
                type="number"
              />
            </label>
            <label>
              Default due day
              <input
                defaultValue="15"
                max="28"
                min="1"
                name="defaultDueDay"
                type="number"
              />
            </label>
            <label className="span-two">
              Notes
              <textarea name="notes" />
            </label>
            <button className="primary-action" type="submit">
              Save subscriber
            </button>
          </form>
        ) : null}
        <form className="list-search" onSubmit={search}>
          <label>
            <span className="sr-only">Search accounts</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Account, name, contact, address, or service number"
              type="search"
              value={query}
            />
          </label>
          <button type="submit">Search</button>
        </form>
        {error ? (
          <div className="form-error" role="alert">
            {error}
          </div>
        ) : null}
        <div className="table-scroll subscriber-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Subscriber</th>
                <th>Contact</th>
                <th>Address</th>
                <th>Services</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.accountNumber}</td>
                  <td>
                    <button
                      aria-label={`Open profile for ${item.fullName}`}
                      className="record-link"
                      onClick={() => void open(item.id)}
                      type="button"
                    >
                      {item.fullName}
                    </button>
                  </td>
                  <td>{item.primaryContact ?? '—'}</td>
                  <td>{item.primaryAddress ?? '—'}</td>
                  <td>{item.serviceCount}</td>
                  <td>
                    <span
                      className={`record-status ${item.status === 'ACTIVE' ? 'active' : ''}`}
                    >
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!result.items.length ? (
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
            >
              Previous
            </button>
            <button
              disabled={page * result.pageSize >= result.total}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
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
  const [tab, setTab] = useState('activity');
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
    { id: 'activity', label: 'Activity' },
    { id: 'services', label: `Services · ${profile.serviceAccounts.length}` },
    ...(canViewBilling
      ? [
          { id: 'billing', label: 'Billing' },
          { id: 'ledger', label: 'Ledger' },
        ]
      : []),
    { id: 'contacts', label: 'Contacts' },
    { id: 'addresses', label: 'Addresses' },
    { id: 'history', label: 'Service history' },
  ];
  useEffect(() => {
    setTab('activity');
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
  async function addService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await window.bcis!.masterData.createServiceAccount(profile.id, {
        accountNumber: String(form.get('accountNumber')),
        planId: String(form.get('planId')),
        installationAddressId:
          String(form.get('installationAddressId')) || null,
        assignedCollectorId: String(form.get('assignedCollectorId')) || null,
        billingDay: Number(form.get('billingDay')),
        dueDay: Number(form.get('dueDay')),
        billingStartDate: String(form.get('billingStartDate')),
        status: 'ACTIVE',
        activationDate: new Date().toISOString(),
      });
      onRefresh();
    } catch (caught) {
      setError(message(caught));
    }
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
        {tab === 'activity' ? (
          <SubscriberActivity
            subscriberId={profile.id}
            permissions={permissions}
            onNavigate={onNavigate}
          />
        ) : null}
        {tab === 'services' ? (
          <section className="data-card">
            <div className="card-heading">
              <div>
                <span>Connected services</span>
                <h2>{profile.serviceAccounts.length} service accounts</h2>
              </div>
            </div>
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
            {!profile.serviceAccounts.length ? (
              <div className="empty-state profile-empty-state">
                <strong>No connected services</strong>
                <span>Add a service account when the subscriber is ready.</span>
              </div>
            ) : null}
            {canManageService && references && profile.status !== 'ARCHIVED' ? (
              <form
                className="form-grid wide-form embedded-form"
                onSubmit={addService}
              >
                <h3 className="span-two">Add service account</h3>
                <label>
                  Service number
                  <input name="accountNumber" required />
                </label>
                <label>
                  Plan
                  <select name="planId">
                    {references.plans
                      .filter((item) => item.isActive)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} — {money(item.priceCentavos)}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Installation address
                  <select name="installationAddressId">
                    {profile.addresses.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}: {item.addressLine}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Collector
                  <select name="assignedCollectorId">
                    <option value="">Unassigned</option>
                    {references.collectors.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Billing day
                  <input
                    defaultValue="1"
                    max="28"
                    min="1"
                    name="billingDay"
                    type="number"
                  />
                </label>
                <label>
                  Due day
                  <input
                    defaultValue="15"
                    max="28"
                    min="1"
                    name="dueDay"
                    type="number"
                  />
                </label>
                <label>
                  Billing start
                  <input
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    name="billingStartDate"
                    required
                    type="date"
                  />
                </label>
                <button className="primary-action" type="submit">
                  Add service
                </button>
              </form>
            ) : null}
          </section>
        ) : null}
        {tab === 'billing' ? (
          <SubscriberBillingPanel mode="billing" subscriberId={profile.id} />
        ) : null}
        {tab === 'ledger' ? (
          <SubscriberBillingPanel mode="ledger" subscriberId={profile.id} />
        ) : null}
        {tab === 'contacts' ? (
          <section className="data-card detail-list">
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
              <div className="empty-state profile-empty-state">
                <strong>No contact details</strong>
                <span>Contact information has not been recorded.</span>
              </div>
            ) : null}
          </section>
        ) : null}
        {tab === 'addresses' ? (
          <section className="data-card detail-list">
            {profile.addresses.map((item) => (
              <div key={item.id}>
                <strong>
                  {item.label}
                  {item.isPrimary ? ' · Primary' : ''}
                </strong>
                <span>{item.addressLine}</span>
              </div>
            ))}
            {!profile.addresses.length ? (
              <div className="empty-state profile-empty-state">
                <strong>No addresses</strong>
                <span>Address information has not been recorded.</span>
              </div>
            ) : null}
          </section>
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
