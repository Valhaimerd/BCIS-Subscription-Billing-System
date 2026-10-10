import type { PlanDto } from '@bcis/contracts';
import { useEffect, useRef, useState } from 'react';

import { ModalDialog } from './ModalDialog';
import './plan-journey.css';
import './subscriber-journey.css';

const money = (centavos: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
    centavos / 100,
  );
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The request could not be completed.';

export function toCentavos(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error('Enter a valid price with up to two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error('Monthly price must be greater than zero.');
  return amount;
}

export function PlanCreateWizard({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (input: Record<string, unknown>) => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmExit, setConfirmExit] = useState(false);
  const [edited, setEdited] = useState(false);
  const shell = useRef<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const keepEditing = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (confirmExit) keepEditing.current?.focus();
  }, [confirmExit]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() =>
      shell.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const [draft, setDraft] = useState({
    serviceTypeCode: 'INTERNET' as PlanDto['serviceTypeCode'],
    code: '',
    name: '',
    price: '',
    speedMbps: '25',
    channelCount: '60',
    description: '',
  });
  function update(field: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setError('');
    setEdited(true);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (step === 0 && (draft.code.trim().length < 2 || !draft.name.trim())) {
      setError('Enter a plan code and name.');
      return;
    }
    let priceCentavos = 0;
    if (step >= 1) {
      try {
        priceCentavos = toCentavos(draft.price);
      } catch (caught) {
        setError(message(caught));
        return;
      }
      const speed = Number(draft.speedMbps);
      const channels = Number(draft.channelCount);
      if (
        (draft.serviceTypeCode !== 'CABLE' &&
          (!Number.isInteger(speed) || speed < 1)) ||
        (draft.serviceTypeCode !== 'INTERNET' &&
          (!Number.isInteger(channels) || channels < 1))
      ) {
        setError('Enter a positive whole number for speed and channels.');
        return;
      }
    }
    if (step < 2) {
      setStep(step + 1);
      setError('');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onCreate({
        serviceTypeCode: draft.serviceTypeCode,
        code: draft.code.trim().toUpperCase(),
        name: draft.name.trim(),
        priceCentavos,
        speedMbps:
          draft.serviceTypeCode === 'CABLE' ? null : Number(draft.speedMbps),
        channelCount:
          draft.serviceTypeCode === 'INTERNET'
            ? null
            : Number(draft.channelCount),
        ...(draft.description.trim()
          ? { description: draft.description.trim() }
          : {}),
      });
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Add service plan"
      className="journey-shell plan-wizard"
      ref={shell}
    >
      <div className="journey-heading">
        <div>
          <span className="journey-eyebrow">Plan catalogue</span>
          <h2>Add a service plan</h2>
          <p>Describe the offer, set its price, then review before saving.</p>
        </div>
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
      </div>
      <ol aria-label="Plan setup steps" className="journey-steps plan-steps">
        {['Plan identity', 'Offer and price', 'Review'].map((label, index) => (
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
              <h3>What is this plan called?</h3>
            </div>
            <div className="journey-fields">
              <label>
                Service type
                <select
                  onChange={(event) =>
                    update('serviceTypeCode', event.target.value)
                  }
                  value={draft.serviceTypeCode}
                >
                  <option value="INTERNET">Internet</option>
                  <option value="CABLE">Cable</option>
                  <option value="COMBO">Combo</option>
                </select>
              </label>
              <label>
                Plan code
                <input
                  autoComplete="off"
                  autoFocus
                  onChange={(event) => update('code', event.target.value)}
                  required
                  value={draft.code}
                />
              </label>
              <label className="journey-full">
                Plan name
                <input
                  onChange={(event) => update('name', event.target.value)}
                  required
                  value={draft.name}
                />
              </label>
            </div>
          </>
        ) : null}
        {step === 1 ? (
          <>
            <div className="journey-stage-title">
              <span>02 / Offer</span>
              <h3>What does the plan include?</h3>
            </div>
            <div className="journey-fields">
              <label>
                Monthly price (PHP)
                <input
                  inputMode="decimal"
                  onChange={(event) => update('price', event.target.value)}
                  required
                  type="text"
                  value={draft.price}
                />
              </label>
              {draft.serviceTypeCode !== 'CABLE' ? (
                <label>
                  Speed (Mbps)
                  <input
                    min="1"
                    onChange={(event) =>
                      update('speedMbps', event.target.value)
                    }
                    required
                    type="number"
                    value={draft.speedMbps}
                  />
                </label>
              ) : null}
              {draft.serviceTypeCode !== 'INTERNET' ? (
                <label>
                  Channels
                  <input
                    min="1"
                    onChange={(event) =>
                      update('channelCount', event.target.value)
                    }
                    required
                    type="number"
                    value={draft.channelCount}
                  />
                </label>
              ) : null}
              <label className="journey-full">
                Description <small>optional</small>
                <textarea
                  onChange={(event) =>
                    update('description', event.target.value)
                  }
                  rows={2}
                  value={draft.description}
                />
              </label>
            </div>
          </>
        ) : null}
        {step === 2 ? (
          <>
            <div className="journey-stage-title">
              <span>03 / Review</span>
              <h3>Confirm this offer</h3>
              <p>
                New service accounts can select this plan after it is saved.
              </p>
            </div>
            <dl className="journey-review">
              <div>
                <dt>Plan</dt>
                <dd>
                  {draft.name} · {draft.code.trim().toUpperCase()}
                </dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{draft.serviceTypeCode.toLowerCase()}</dd>
              </div>
              <div>
                <dt>Included</dt>
                <dd>
                  {[
                    draft.serviceTypeCode !== 'CABLE' &&
                      `${draft.speedMbps} Mbps`,
                    draft.serviceTypeCode !== 'INTERNET' &&
                      `${draft.channelCount} channels`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </dd>
              </div>
              <div>
                <dt>Monthly price</dt>
                <dd>{money(toCentavos(draft.price))}</dd>
              </div>
            </dl>
          </>
        ) : null}
        <div className="journey-actions">
          {step > 0 ? (
            <button
              disabled={busy}
              onClick={() => {
                setStep(step - 1);
                setError('');
              }}
              type="button"
            >
              ← Back
            </button>
          ) : null}
          <button className="primary-action" disabled={busy} type="submit">
            {busy ? 'Creating…' : step === 2 ? 'Create plan' : 'Continue →'}
          </button>
        </div>
      </form>
    </section>
  );
}

export function PriceChangeDialog({
  plan,
  onClose,
  onSave,
}: {
  plan: PlanDto;
  onClose: () => void;
  onSave: (priceCentavos: number, reason: string) => Promise<void>;
}) {
  const [review, setReview] = useState(false);
  const [price, setPrice] = useState((plan.priceCentavos / 100).toFixed(2));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  let newPriceCentavos: number | null = null;
  try {
    newPriceCentavos = toCentavos(price);
  } catch {
    // The editable step shows the validation error on submission.
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!review) {
      try {
        const value = toCentavos(price);
        if (value === plan.priceCentavos)
          throw new Error('Enter a new monthly price.');
        if (reason.trim().length < 8)
          throw new Error('Enter a reason of at least 8 characters.');
        setError('');
        setReview(true);
      } catch (caught) {
        setError(message(caught));
      }
      return;
    }
    if (newPriceCentavos === null) return;
    setBusy(true);
    setError('');
    try {
      await onSave(newPriceCentavos, reason.trim());
      onClose();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ModalDialog
      ariaLabel="Change plan price"
      className="detail-dialog--compact"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <section className="data-card plan-price-sheet">
        <header>
          <span className="journey-eyebrow">Plan price</span>
          <h2>
            {review ? 'Review the price change' : `Change ${plan.name} price`}
          </h2>
          <p>
            {plan.code} · Current catalogue price {money(plan.priceCentavos)}
          </p>
        </header>
        <form onSubmit={(event) => void submit(event)}>
          {review ? (
            <>
              <div className="plan-price-comparison">
                <div>
                  <small>Current</small>
                  <strong>{money(plan.priceCentavos)}</strong>
                </div>
                <span aria-hidden="true">→</span>
                <div>
                  <small>New</small>
                  <strong>
                    {money(newPriceCentavos ?? plan.priceCentavos)}
                  </strong>
                </div>
              </div>
              <p className="plan-price-impact">
                The new catalogue price applies to services added after this
                change. Existing service rates and finalized invoices stay as
                they are.
              </p>
              <p className="plan-price-reason">
                <strong>Reason:</strong> {reason.trim()}
              </p>
            </>
          ) : (
            <div className="plan-price-fields">
              <label>
                New monthly price (PHP)
                <input
                  autoFocus
                  inputMode="decimal"
                  onChange={(event) => {
                    setPrice(event.target.value);
                    setError('');
                  }}
                  required
                  type="text"
                  value={price}
                />
              </label>
              <label>
                Reason for price change
                <textarea
                  maxLength={500}
                  minLength={8}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setError('');
                  }}
                  required
                  rows={3}
                  value={reason}
                />
              </label>
              <p>
                Existing service rates and finalized invoices will not change.
              </p>
            </div>
          )}
          {error ? (
            <div className="form-error" role="alert">
              {error}
            </div>
          ) : null}
          <div className="action-dialog-footer">
            <button
              disabled={busy}
              onClick={() => (review ? setReview(false) : onClose())}
              type="button"
            >
              {review ? '← Edit details' : 'Cancel'}
            </button>
            <button className="primary-action" disabled={busy} type="submit">
              {busy ? 'Saving…' : review ? 'Save new price' : 'Review change'}
            </button>
          </div>
        </form>
      </section>
    </ModalDialog>
  );
}
