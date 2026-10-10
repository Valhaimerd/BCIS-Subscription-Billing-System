import type { SubscriberProfileDto } from '@bcis/contracts';
import { useEffect, useRef, useState } from 'react';

import type { ReferenceData } from '../../shared/desktop-api';
import './subscriber-journey.css';

const money = (centavos: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
    centavos / 100,
  );
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The request could not be completed.';
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function JourneySteps({ labels, step }: { labels: string[]; step: number }) {
  return (
    <ol aria-label="Setup steps" className="journey-steps">
      {labels.map((label, index) => (
        <li
          aria-current={step === index ? 'step' : undefined}
          className={index <= step ? 'is-active' : ''}
          key={label}
        >
          <span>{index + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

function JourneyActions({
  step,
  busy,
  finalLabel,
  onBack,
}: {
  step: number;
  busy: boolean;
  finalLabel: string;
  onBack: () => void;
}) {
  return (
    <div className="journey-actions">
      {step > 0 ? (
        <button disabled={busy} onClick={onBack} type="button">
          ← Back
        </button>
      ) : null}
      <button className="primary-action" disabled={busy} type="submit">
        {busy ? 'Saving…' : step === 3 ? finalLabel : 'Continue →'}
      </button>
    </div>
  );
}

function JourneyClose({
  edited,
  busy,
  onCancel,
}: {
  edited: boolean;
  busy: boolean;
  onCancel: () => void;
}) {
  const [confirmExit, setConfirmExit] = useState(false);
  const keepEditing = useRef<HTMLButtonElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (confirmExit) keepEditing.current?.focus();
  }, [confirmExit]);
  return (
    <div className="journey-close">
      <button
        disabled={busy}
        onClick={() => (edited ? setConfirmExit(true) : onCancel())}
        ref={closeButton}
        type="button"
      >
        Close
      </button>
      {confirmExit ? (
        <div
          aria-label="Discard changes"
          className="journey-exit"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setConfirmExit(false);
              closeButton.current?.focus();
            }
          }}
          role="group"
        >
          <p>Discard the information entered so far?</p>
          <button
            onClick={() => {
              setConfirmExit(false);
              closeButton.current?.focus();
            }}
            ref={keepEditing}
            type="button"
          >
            Keep editing
          </button>
          <button onClick={onCancel} type="button">
            Discard changes
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function SubscriberCreateWizard({
  references,
  onCancel,
  onCreate,
}: {
  references: ReferenceData;
  onCancel: () => void;
  onCreate: (input: Record<string, unknown>) => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [edited, setEdited] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({
    accountNumber: '',
    fullName: '',
    contactType: 'MOBILE',
    contact: '',
    address: '',
    collectionAreaId: '',
    assignedCollectorId: '',
    defaultBillingDay: '1',
    defaultDueDay: '15',
    notes: '',
  });
  function update(field: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setEdited(true);
    setError('');
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (
      step === 0 &&
      (draft.accountNumber.trim().length < 3 || !draft.fullName.trim())
    ) {
      setError(
        'Enter an account number of at least 3 characters and a full name.',
      );
      return;
    }
    if (step === 1 && (!draft.contact.trim() || !draft.address.trim())) {
      setError('Enter a primary contact and address.');
      return;
    }
    const billingDay = Number(draft.defaultBillingDay);
    const dueDay = Number(draft.defaultDueDay);
    if (
      step === 2 &&
      ![billingDay, dueDay].every(
        (day) => Number.isInteger(day) && day >= 1 && day <= 28,
      )
    ) {
      setError('Billing and due days must be between 1 and 28.');
      return;
    }
    if (step < 3) {
      setStep(step + 1);
      setError('');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onCreate({
        accountNumber: draft.accountNumber.trim(),
        fullName: draft.fullName.trim(),
        collectionAreaId: draft.collectionAreaId || null,
        assignedCollectorId: draft.assignedCollectorId || null,
        notes: draft.notes.trim(),
        defaultBillingDay: billingDay,
        defaultDueDay: dueDay,
        addresses: [
          {
            label: 'Primary',
            addressLine: draft.address.trim(),
            isPrimary: true,
          },
        ],
        contacts: [
          {
            type: draft.contactType,
            value: draft.contact.trim(),
            isPrimary: true,
          },
        ],
      });
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="journey-shell" aria-label="Register subscriber">
      <div className="journey-heading">
        <div>
          <span className="journey-eyebrow">New subscriber</span>
          <h2>Register an account</h2>
          <p>
            Just the information needed to begin. You can add services from the
            new profile.
          </p>
        </div>
        <JourneyClose busy={busy} edited={edited} onCancel={onCancel} />
      </div>
      <JourneySteps
        labels={[
          'Identity',
          'Contact & location',
          'Billing defaults',
          'Review',
        ]}
        step={step}
      />
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      <form className="journey-stage" onSubmit={(event) => void submit(event)}>
        {step === 0 ? (
          <>
            <div className="journey-stage-title">
              <span>01 / Identity</span>
              <h3>Who is the subscriber?</h3>
            </div>
            <div className="journey-fields">
              <label>
                Subscriber number
                <input
                  autoFocus
                  onChange={(event) =>
                    update('accountNumber', event.target.value)
                  }
                  required
                  value={draft.accountNumber}
                />
              </label>
              <label>
                Full name
                <input
                  onChange={(event) => update('fullName', event.target.value)}
                  required
                  value={draft.fullName}
                />
              </label>
            </div>
          </>
        ) : null}
        {step === 1 ? (
          <>
            <div className="journey-stage-title">
              <span>02 / Contact & location</span>
              <h3>How do we reach them?</h3>
            </div>
            <div className="journey-fields">
              <label>
                Primary contact type
                <select
                  onChange={(event) =>
                    update('contactType', event.target.value)
                  }
                  value={draft.contactType}
                >
                  <option value="MOBILE">Mobile</option>
                  <option value="EMAIL">Email</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label>
                Primary contact
                <input
                  onChange={(event) => update('contact', event.target.value)}
                  required
                  value={draft.contact}
                />
              </label>
              <label className="journey-full">
                Primary address
                <input
                  onChange={(event) => update('address', event.target.value)}
                  required
                  value={draft.address}
                />
              </label>
            </div>
          </>
        ) : null}
        {step === 2 ? (
          <>
            <div className="journey-stage-title">
              <span>03 / Billing defaults</span>
              <h3>Set the account defaults</h3>
              <p>
                These dates are defaults for new services. They can be changed
                when a service is added.
              </p>
            </div>
            <div className="journey-fields">
              <label>
                Collection area
                <select
                  onChange={(event) =>
                    update('collectionAreaId', event.target.value)
                  }
                  value={draft.collectionAreaId}
                >
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
                <select
                  onChange={(event) =>
                    update('assignedCollectorId', event.target.value)
                  }
                  value={draft.assignedCollectorId}
                >
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
                  max="28"
                  min="1"
                  onChange={(event) =>
                    update('defaultBillingDay', event.target.value)
                  }
                  required
                  type="number"
                  value={draft.defaultBillingDay}
                />
              </label>
              <label>
                Default due day
                <input
                  max="28"
                  min="1"
                  onChange={(event) =>
                    update('defaultDueDay', event.target.value)
                  }
                  required
                  type="number"
                  value={draft.defaultDueDay}
                />
              </label>
              <label className="journey-full">
                Notes <small>optional</small>
                <textarea
                  onChange={(event) => update('notes', event.target.value)}
                  rows={2}
                  value={draft.notes}
                />
              </label>
            </div>
          </>
        ) : null}
        {step === 3 ? (
          <>
            <div className="journey-stage-title">
              <span>04 / Review</span>
              <h3>Confirm this subscriber</h3>
              <p>
                One save creates the account, primary contact, and primary
                address.
              </p>
            </div>
            <dl className="journey-review">
              <div>
                <dt>Subscriber</dt>
                <dd>
                  {draft.fullName} · {draft.accountNumber}
                </dd>
              </div>
              <div>
                <dt>Contact</dt>
                <dd>
                  {draft.contactType.toLowerCase()} · {draft.contact}
                </dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>{draft.address}</dd>
              </div>
              <div>
                <dt>Collection</dt>
                <dd>
                  {references.collectionAreas.find(
                    (item) => item.id === draft.collectionAreaId,
                  )?.name ?? 'Unassigned'}{' '}
                  ·{' '}
                  {references.collectors.find(
                    (item) => item.id === draft.assignedCollectorId,
                  )?.name ?? 'No collector'}
                </dd>
              </div>
              <div>
                <dt>Billing days</dt>
                <dd>
                  Bill on {draft.defaultBillingDay} · Due on{' '}
                  {draft.defaultDueDay}
                </dd>
              </div>
            </dl>
          </>
        ) : null}
        <JourneyActions
          busy={busy}
          finalLabel="Create subscriber"
          onBack={() => {
            setStep(step - 1);
            setError('');
          }}
          step={step}
        />
      </form>
    </section>
  );
}

export function ServiceCreateWizard({
  profile,
  references,
  onCancel,
  onCreate,
}: {
  profile: SubscriberProfileDto;
  references: ReferenceData;
  onCancel: () => void;
  onCreate: (input: Record<string, unknown>) => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const shell = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() =>
      shell.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const [busy, setBusy] = useState(false);
  const [edited, setEdited] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState({
    planId: '',
    accountNumber: '',
    installationAddressId:
      profile.addresses.find((address) => address.isPrimary)?.id ??
      profile.addresses[0]?.id ??
      '',
    assignedCollectorId: profile.assignedCollector?.id ?? '',
    billingDay: '1',
    dueDay: '15',
    billingStartDate: today(),
    activateNow: true,
  });
  const plans = references.plans.filter((plan) => plan.isActive);
  const selectedPlan = plans.find((plan) => plan.id === draft.planId);
  function update(field: keyof typeof draft, value: string | boolean) {
    setDraft((current) => ({ ...current, [field]: value }));
    setEdited(true);
    setError('');
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (
      step === 0 &&
      (!selectedPlan || draft.accountNumber.trim().length < 3)
    ) {
      setError(
        'Choose a plan and enter a service number of at least 3 characters.',
      );
      return;
    }
    const billingDay = Number(draft.billingDay);
    const dueDay = Number(draft.dueDay);
    if (
      step === 2 &&
      (![billingDay, dueDay].every(
        (day) => Number.isInteger(day) && day >= 1 && day <= 28,
      ) ||
        !draft.billingStartDate)
    ) {
      setError('Enter valid billing and due days and a billing start date.');
      return;
    }
    if (step < 3) {
      setStep(step + 1);
      setError('');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onCreate({
        accountNumber: draft.accountNumber.trim(),
        planId: draft.planId,
        installationAddressId: draft.installationAddressId || null,
        assignedCollectorId: draft.assignedCollectorId || null,
        billingDay,
        dueDay,
        billingStartDate: draft.billingStartDate,
        status: draft.activateNow ? 'ACTIVE' : 'PENDING',
        activationDate: draft.activateNow ? new Date().toISOString() : null,
      });
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="journey-shell"
      aria-label="Add service account"
      ref={shell}
    >
      <div className="journey-heading">
        <div>
          <span className="journey-eyebrow">
            {profile.accountNumber} · {profile.fullName}
          </span>
          <h2>Add a service</h2>
          <p>
            Choose the offer, confirm the installation, then review the billing
            schedule.
          </p>
        </div>
        <JourneyClose busy={busy} edited={edited} onCancel={onCancel} />
      </div>
      <JourneySteps
        labels={['Choose plan', 'Installation', 'Billing schedule', 'Review']}
        step={step}
      />
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      <form className="journey-stage" onSubmit={(event) => void submit(event)}>
        {step === 0 ? (
          <>
            <div className="journey-stage-title">
              <span>01 / Choose plan</span>
              <h3>What service is being added?</h3>
            </div>
            <label className="journey-service-number">
              Service number
              <input
                autoFocus
                onChange={(event) =>
                  update('accountNumber', event.target.value)
                }
                required
                value={draft.accountNumber}
              />
            </label>
            <div
              className="journey-plan-grid"
              role="group"
              aria-label="Available plans"
            >
              {plans.map((plan) => (
                <button
                  aria-pressed={draft.planId === plan.id}
                  className={`journey-plan-card ${draft.planId === plan.id ? 'is-selected' : ''}`}
                  key={plan.id}
                  onClick={() => update('planId', plan.id)}
                  type="button"
                >
                  <small>{plan.serviceTypeCode}</small>
                  <strong>{plan.name}</strong>
                  <span>{money(plan.priceCentavos)} / month</span>
                </button>
              ))}
            </div>
            {!plans.length ? (
              <p className="journey-empty">
                No active plans are available. Add an active plan first.
              </p>
            ) : null}
          </>
        ) : null}
        {step === 1 ? (
          <>
            <div className="journey-stage-title">
              <span>02 / Installation</span>
              <h3>Where will it be connected?</h3>
            </div>
            <div className="journey-fields">
              <label>
                Installation address
                <select
                  onChange={(event) =>
                    update('installationAddressId', event.target.value)
                  }
                  value={draft.installationAddressId}
                >
                  <option value="">No saved address selected</option>
                  {profile.addresses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}: {item.addressLine}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assigned collector
                <select
                  onChange={(event) =>
                    update('assignedCollectorId', event.target.value)
                  }
                  value={draft.assignedCollectorId}
                >
                  <option value="">Unassigned</option>
                  {references.collectors.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        ) : null}
        {step === 2 ? (
          <>
            <div className="journey-stage-title">
              <span>03 / Billing schedule</span>
              <h3>When does billing begin?</h3>
              <p>
                The monthly plan rate is{' '}
                {selectedPlan ? money(selectedPlan.priceCentavos) : '—'}. The
                first invoice is generated by the billing cycle, not by this
                step.
              </p>
            </div>
            <div className="journey-fields">
              <label>
                Billing start date
                <input
                  onChange={(event) =>
                    update('billingStartDate', event.target.value)
                  }
                  required
                  type="date"
                  value={draft.billingStartDate}
                />
              </label>
              <label>
                Billing day
                <input
                  max="28"
                  min="1"
                  onChange={(event) => update('billingDay', event.target.value)}
                  required
                  type="number"
                  value={draft.billingDay}
                />
              </label>
              <label>
                Due day
                <input
                  max="28"
                  min="1"
                  onChange={(event) => update('dueDay', event.target.value)}
                  required
                  type="number"
                  value={draft.dueDay}
                />
              </label>
              <label className="journey-check">
                <input
                  checked={draft.activateNow}
                  onChange={(event) =>
                    update('activateNow', event.target.checked)
                  }
                  type="checkbox"
                />
                Activate service now
              </label>
            </div>
          </>
        ) : null}
        {step === 3 ? (
          <>
            <div className="journey-stage-title">
              <span>04 / Review</span>
              <h3>Confirm this service</h3>
              <p>
                Saving creates the service account. It does not post an invoice.
              </p>
            </div>
            <dl className="journey-review">
              <div>
                <dt>Subscriber</dt>
                <dd>
                  {profile.fullName} · {profile.accountNumber}
                </dd>
              </div>
              <div>
                <dt>Service</dt>
                <dd>
                  {draft.accountNumber} · {selectedPlan?.name}
                </dd>
              </div>
              <div>
                <dt>Monthly rate</dt>
                <dd>
                  {selectedPlan ? money(selectedPlan.priceCentavos) : '—'}
                </dd>
              </div>
              <div>
                <dt>Installation</dt>
                <dd>
                  {profile.addresses.find(
                    (item) => item.id === draft.installationAddressId,
                  )?.addressLine ?? 'No saved address'}{' '}
                </dd>
              </div>
              <div>
                <dt>Schedule</dt>
                <dd>
                  Starts {draft.billingStartDate} · Bill on {draft.billingDay} ·
                  Due on {draft.dueDay}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  {draft.activateNow ? 'Active now' : 'Pending activation'}
                </dd>
              </div>
            </dl>
          </>
        ) : null}
        <JourneyActions
          busy={busy}
          finalLabel="Create service"
          onBack={() => {
            setStep(step - 1);
            setError('');
          }}
          step={step}
        />
      </form>
    </section>
  );
}
