import type { PlanDto } from '@bcis/contracts';
import { useEffect, useRef, useState } from 'react';

import { PlanCreateWizard, PriceChangeDialog } from './PlanJourneys';
import { ModalDialog } from './ModalDialog';
import './plan-journey.css';

const money = (centavos: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
    centavos / 100,
  );
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The request could not be completed.';
const typeNames: Record<PlanDto['serviceTypeCode'], string> = {
  INTERNET: 'Internet',
  CABLE: 'Cable',
  COMBO: 'Combo',
};
const types: PlanDto['serviceTypeCode'][] = ['INTERNET', 'CABLE', 'COMBO'];

export function PlansView({ canManage }: { canManage: boolean }) {
  const [plans, setPlans] = useState<PlanDto[]>([]);
  const [pricePlan, setPricePlan] = useState<PlanDto | null>(null);
  const [detailPlan, setDetailPlan] = useState<PlanDto | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'register'>('cards');
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
  async function create(input: Record<string, unknown>) {
    await window.bcis!.masterData.createPlan(input);
    setShowCreate(false);
    setNotice('Service plan created.');
    await load();
  }
  async function changePrice(
    plan: PlanDto,
    priceCentavos: number,
    reason: string,
  ) {
    await window.bcis!.masterData.updatePlan(plan.id, {
      priceCentavos,
      reason,
    });
    setNotice(
      `Catalogue price updated for ${plan.name}. The reason is in audit history.`,
    );
    await load();
  }
  async function toggle(plan: PlanDto) {
    setError('');
    setNotice('');
    setBusy(`toggle:${plan.id}`);
    try {
      await window.bcis!.masterData.updatePlan(plan.id, {
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

  function actions(plan: PlanDto) {
    return (
      <div className="row-actions">
        <button onClick={() => setDetailPlan(plan)} type="button">
          View plan
        </button>
      </div>
    );
  }

  return (
    <div className="data-layout plan-catalogue">
      {showCreate ? (
        <PlanCreateWizard
          onCancel={() => setShowCreate(false)}
          onCreate={create}
        />
      ) : (
        <>
          <header className="plan-catalogue-header">
            <div>
              <span className="journey-eyebrow">Plan catalogue</span>
              <h2>Service plans</h2>
              <p>
                Compare offers by service type before adding one to an account.
              </p>
            </div>
            <div className="plan-catalogue-actions">
              <small>
                {visiblePlans.length} of {plans.length}{' '}
                {plans.length === 1 ? 'plan' : 'plans'}
              </small>
              {canManage ? (
                <button
                  className="primary-action"
                  onClick={() => setShowCreate(true)}
                  type="button"
                >
                  Add service plan
                </button>
              ) : null}
            </div>
          </header>
          <div className="plan-catalogue-controls">
            <input
              aria-label="Search service plans"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, code, or service type"
              type="search"
              value={query}
            />
            <select
              aria-label="Plan status"
              onChange={(event) => setStatusFilter(event.target.value)}
              value={statusFilter}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select
              aria-label="Sort plans by price"
              onChange={(event) => setPriceOrder(event.target.value)}
              value={priceOrder}
            >
              <option value="name">Sort: plan name</option>
              <option value="low">Price: low to high</option>
              <option value="high">Price: high to low</option>
            </select>
            <button
              aria-pressed={viewMode === 'register'}
              onClick={() =>
                setViewMode(viewMode === 'cards' ? 'register' : 'cards')
              }
              type="button"
            >
              {viewMode === 'cards' ? 'View register' : 'View cards'}
            </button>
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
          {loading ? (
            <p className="inline-loading" role="status">
              Loading service plans…
            </p>
          ) : null}
          {!loading && !visiblePlans.length && !loadError ? (
            <div className="empty-state">
              {plans.length
                ? 'No service plans match these filters.'
                : 'No service plans have been created yet.'}
            </div>
          ) : null}
          {viewMode === 'cards' ? (
            types.map((type) => {
              const matching = visiblePlans.filter(
                (plan) => plan.serviceTypeCode === type,
              );
              if (!matching.length) return null;
              return (
                <section
                  aria-label={`${typeNames[type]} plans`}
                  className="plan-type-section"
                  key={type}
                >
                  <div className="plan-type-heading">
                    <h3>{typeNames[type]}</h3>
                    <small>
                      {matching.length}{' '}
                      {matching.length === 1 ? 'plan' : 'plans'}
                    </small>
                  </div>
                  <div className="plan-card-grid">
                    {matching.map((plan) => (
                      <article
                        className={`plan-catalogue-card ${plan.isActive ? '' : 'is-inactive'}`}
                        key={plan.id}
                      >
                        <div className="plan-card-top">
                          <div>
                            <span className="plan-card-code">{plan.code}</span>
                            <h4>{plan.name}</h4>
                          </div>
                          <div className="plan-card-price">
                            {money(plan.priceCentavos)}
                            <small>per month</small>
                          </div>
                        </div>
                        <div className="plan-card-specs">
                          {plan.speedMbps ? (
                            <span>{plan.speedMbps} Mbps</span>
                          ) : null}
                          {plan.channelCount ? (
                            <span>{plan.channelCount} channels</span>
                          ) : null}
                        </div>
                        {plan.description ? <p>{plan.description}</p> : null}
                        <div className="plan-card-bottom">
                          <span
                            className={`record-status ${plan.isActive ? 'active' : ''}`}
                          >
                            {plan.isActive ? 'Active' : 'Inactive'}
                          </span>
                          {actions(plan)}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })
          ) : (
            <section
              aria-label="Plan register"
              className="data-card plan-register"
            >
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Plan</th>
                      <th>Type</th>
                      <th>Included</th>
                      <th>Monthly price</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePlans.map((plan) => (
                      <tr key={plan.id}>
                        <td>{plan.code}</td>
                        <td>{plan.name}</td>
                        <td>{typeNames[plan.serviceTypeCode]}</td>
                        <td>
                          {[
                            plan.speedMbps && `${plan.speedMbps} Mbps`,
                            plan.channelCount &&
                              `${plan.channelCount} channels`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </td>
                        <td>{money(plan.priceCentavos)}</td>
                        <td>{plan.isActive ? 'Active' : 'Inactive'}</td>
                        <td>{actions(plan)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
      {detailPlan ? (
        <ModalDialog
          ariaLabel="Plan details"
          className="detail-dialog--compact"
          onClose={() => setDetailPlan(null)}
        >
          <section className="data-card plan-detail-sheet">
            <header>
              <span className="journey-eyebrow">
                {typeNames[detailPlan.serviceTypeCode]} plan
              </span>
              <h2>{detailPlan.name}</h2>
              <p>{detailPlan.code}</p>
            </header>
            <dl className="journey-review">
              <div>
                <dt>Monthly catalogue price</dt>
                <dd>{money(detailPlan.priceCentavos)}</dd>
              </div>
              <div>
                <dt>Included</dt>
                <dd>
                  {[
                    detailPlan.speedMbps && `${detailPlan.speedMbps} Mbps`,
                    detailPlan.channelCount &&
                      `${detailPlan.channelCount} channels`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{detailPlan.isActive ? 'Active' : 'Inactive'}</dd>
              </div>
              {detailPlan.description ? (
                <div>
                  <dt>Description</dt>
                  <dd>{detailPlan.description}</dd>
                </div>
              ) : null}
            </dl>
            <p className="plan-detail-note">
              This catalogue price applies when a new service is added. Existing
              service rates are stored separately.
            </p>
            <div className="plan-detail-actions">
              <button onClick={() => setDetailPlan(null)} type="button">
                Close
              </button>
              {canManage ? (
                <>
                  <button
                    disabled={busy !== ''}
                    onClick={() => {
                      setDetailPlan(null);
                      setPricePlan(detailPlan);
                    }}
                    type="button"
                  >
                    Change price
                  </button>
                  <button
                    disabled={busy !== ''}
                    onClick={() => {
                      setDetailPlan(null);
                      void toggle(detailPlan);
                    }}
                    type="button"
                  >
                    {detailPlan.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </>
              ) : null}
            </div>
          </section>
        </ModalDialog>
      ) : null}
      {pricePlan ? (
        <PriceChangeDialog
          onClose={() => setPricePlan(null)}
          onSave={(priceCentavos, reason) =>
            changePrice(pricePlan, priceCentavos, reason)
          }
          plan={pricePlan}
        />
      ) : null}
    </div>
  );
}
