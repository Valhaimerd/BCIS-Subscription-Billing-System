import type {
  CollectionBatchDetailDto,
  CollectionRoutePreviewDto,
  ReferenceItemDto,
} from '@bcis/contracts';
import { useState } from 'react';

const money = (value: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
    value / 100,
  );
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The request could not be completed.';
const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
};

export function CollectionRouteWizard({
  collectors,
  areas,
  onCancel,
  onCreated,
}: {
  collectors: ReferenceItemDto[];
  areas: ReferenceItemDto[];
  onCancel: () => void;
  onCreated: (batch: CollectionBatchDetailDto) => void;
}) {
  const [step, setStep] = useState(1);
  const [collectorId, setCollectorId] = useState('');
  const [collectionAreaId, setCollectionAreaId] = useState('');
  const [batchDate, setBatchDate] = useState(today);
  const [preview, setPreview] = useState<CollectionRoutePreviewDto | null>(
    null,
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [accountSearch, setAccountSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selectedAccounts =
    preview?.accounts.filter((account) =>
      selected.includes(account.serviceAccountId),
    ) ?? [];
  const selectedTotal = selectedAccounts.reduce(
    (sum, account) => sum + account.totalDueCentavos,
    0,
  );
  const visibleAccounts =
    preview?.accounts.filter((account) =>
      `${account.subscriberName} ${account.subscriberAccountNumber} ${account.serviceAccountNumber} ${account.routeAddress}`
        .toLowerCase()
        .includes(accountSearch.trim().toLowerCase()),
    ) ?? [];
  const collector = collectors.find((item) => item.id === collectorId);
  const area = areas.find((item) => item.id === collectionAreaId);

  async function review(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await window.bcis!.collections.preview({
        collectorId,
        collectionAreaId,
        batchDate,
      });
      setPreview(result);
      setSelected(result.accounts.map((account) => account.serviceAccountId));
      setAccountSearch('');
      setStep(2);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  async function issue() {
    if (busy || !selected.length) return;
    setBusy(true);
    setError('');
    try {
      const batch = await window.bcis!.collections.create({
        collectorId,
        collectionAreaId,
        batchDate,
        selectedServiceAccountIds: selected,
      });
      onCreated(batch);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="data-card route-wizard"
      aria-label="Prepare collection route"
    >
      <div className="card-heading">
        <div>
          <span>Route preparation</span>
          <h2>Prepare collection route</h2>
        </div>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <ol className="route-wizard-steps" aria-label="Route steps">
        <li aria-current={step === 1 ? 'step' : undefined}>1. Assignment</li>
        <li aria-current={step === 2 ? 'step' : undefined}>2. Accounts</li>
        <li aria-current={step === 3 ? 'step' : undefined}>3. Issue route</li>
      </ol>
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      {step === 1 ? (
        <form className="route-wizard-form" onSubmit={review}>
          <p>
            Choose who will collect and where. Review the eligible accounts
            before the route is issued.
          </p>
          <label>
            Collector
            <select
              required
              value={collectorId}
              onChange={(event) => setCollectorId(event.target.value)}
            >
              <option value="">Select collector</option>
              {collectors.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} — {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Collection area
            <select
              required
              value={collectionAreaId}
              onChange={(event) => setCollectionAreaId(event.target.value)}
            >
              <option value="">Select area</option>
              {areas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} — {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Route date
            <input
              required
              type="date"
              value={batchDate}
              onChange={(event) => setBatchDate(event.target.value)}
            />
          </label>
          <button className="primary-action" disabled={busy} type="submit">
            {busy ? 'Finding accounts…' : 'Review accounts'}
          </button>
        </form>
      ) : null}
      {step === 2 ? (
        <div className="route-wizard-panel">
          <div className="route-wizard-summary">
            <div>
              <strong>
                {selected.length} of {preview?.accountCount ?? 0} accounts
              </strong>
              <span>Selected for this route</span>
            </div>
            <div>
              <strong>{money(selectedTotal)}</strong>
              <span>Expected receivable</span>
            </div>
          </div>
          <p>
            Remove accounts that should not be assigned today. The final route
            is checked again when issued.
          </p>
          <label className="route-account-search">
            Find an account
            <input
              value={accountSearch}
              onChange={(event) => setAccountSearch(event.target.value)}
              placeholder="Name, account, service, or address"
            />
          </label>
          <div className="route-account-grid route-account-picker">
            {visibleAccounts.map((account) => (
              <label
                className={`route-account-card ${selected.includes(account.serviceAccountId) ? 'is-selected' : ''}`}
                key={account.serviceAccountId}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(account.serviceAccountId)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, account.serviceAccountId]
                        : current.filter(
                            (id) => id !== account.serviceAccountId,
                          ),
                    )
                  }
                />
                <span>
                  <strong>{account.subscriberName}</strong>
                  <small>
                    {account.subscriberAccountNumber} ·{' '}
                    {account.serviceAccountNumber}
                  </small>
                  <small>{account.routeAddress}</small>
                </span>
                <b>{money(account.totalDueCentavos)}</b>
              </label>
            ))}
          </div>
          {preview?.accounts.length && !visibleAccounts.length ? (
            <div className="empty-state">No accounts match that search.</div>
          ) : null}
          {!preview?.accounts.length ? (
            <div className="empty-state">
              No eligible assigned accounts. Choose another area or collector.
            </div>
          ) : null}
          <div className="route-wizard-actions">
            <button type="button" onClick={() => setStep(1)}>
              Back
            </button>
            <button
              className="primary-action"
              disabled={!selected.length}
              type="button"
              onClick={() => setStep(3)}
            >
              Review route
            </button>
          </div>
        </div>
      ) : null}
      {step === 3 ? (
        <div className="route-wizard-panel">
          <h3>Ready to issue</h3>
          <p>
            {collector?.name} · {area?.name} · {batchDate}
          </p>
          <div className="route-wizard-summary">
            <div>
              <strong>{selected.length}</strong>
              <span>Accounts</span>
            </div>
            <div>
              <strong>{money(selectedTotal)}</strong>
              <span>Expected receivable</span>
            </div>
          </div>
          <p>
            Issuing freezes the selected accounts and balances for this route.
            The collector can then begin work.
          </p>
          <div className="route-wizard-actions">
            <button type="button" onClick={() => setStep(2)}>
              Back to accounts
            </button>
            <button
              className="primary-action"
              disabled={busy}
              type="button"
              onClick={() => void issue()}
            >
              {busy ? 'Issuing…' : 'Issue collection route'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
