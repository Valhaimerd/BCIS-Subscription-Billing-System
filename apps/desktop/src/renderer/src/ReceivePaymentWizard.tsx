import type { PaymentPreviewDto, SubscriberSummaryDto } from '@bcis/contracts';
import { useRef, useState } from 'react';

import { fileBase64 } from './payment-files';
import './receive-payment.css';

const money = (value: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
    value / 100,
  );
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The request could not be completed.';
function centavos(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

type Step = 'find' | 'details' | 'review' | 'done';
type Method = 'CASH' | 'GCASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER';
type Outcome = { kind: 'posted'; receiptNumber: string } | { kind: 'pending' };

export function ReceivePaymentWizard({
  onOpenHistory,
}: {
  onOpenHistory: (receiptNumber?: string) => void;
}) {
  const [step, setStep] = useState<Step>('find');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SubscriberSummaryDto[]>([]);
  const [searched, setSearched] = useState(false);
  const [subscriber, setSubscriber] = useState<SubscriberSummaryDto | null>(
    null,
  );
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Method>('CASH');
  const [reference, setReference] = useState('');
  const [sender, setSender] = useState('');
  const [notes, setNotes] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [preview, setPreview] = useState<PaymentPreviewDto | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const searchRequest = useRef(0);
  const inFlight = useRef(false);
  const requestKey = useRef(crypto.randomUUID());
  const amountCentavos = centavos(amount);

  function reset() {
    setStep('find');
    setQuery('');
    setResults([]);
    setSearched(false);
    setSubscriber(null);
    setAmount('');
    setMethod('CASH');
    setReference('');
    setSender('');
    setNotes('');
    setProof(null);
    setPreview(null);
    setOutcome(null);
    setError('');
    requestKey.current = crypto.randomUUID();
  }

  function chooseAccount(item: SubscriberSummaryDto) {
    setSubscriber(item);
    setAmount('');
    setMethod('CASH');
    setReference('');
    setSender('');
    setNotes('');
    setProof(null);
    setPreview(null);
    setError('');
    requestKey.current = crypto.randomUUID();
    setStep('details');
  }

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const request = ++searchRequest.current;
    if (!query.trim()) {
      setError('Enter an account number or subscriber name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await window.bcis!.masterData.listSubscribers({
        q: query.trim(),
        page: 1,
        pageSize: 12,
      });
      if (request !== searchRequest.current) return;
      setResults(result.items);
      setSearched(true);
    } catch (caught) {
      if (request === searchRequest.current) setError(message(caught));
    } finally {
      if (request === searchRequest.current) setBusy(false);
    }
  }

  async function review(event: React.FormEvent) {
    event.preventDefault();
    if (!subscriber || !amountCentavos) {
      setError('Enter a valid amount greater than zero.');
      return;
    }
    if (method === 'GCASH') {
      if (reference.trim().length < 3 || sender.trim().length < 3) {
        setError('Enter the GCash reference and sender details.');
        return;
      }
      if (
        !proof ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(proof.type)
      ) {
        setError('Choose a JPG, PNG, or WebP proof image.');
        return;
      }
      if (proof.size > 5_000_000) {
        setError('Proof image must be no larger than 5 MB.');
        return;
      }
    }
    setBusy(true);
    setError('');
    try {
      const next = await window.bcis!.payments.preview(
        subscriber.id,
        amountCentavos,
      );
      setPreview(next);
      setStep('review');
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (inFlight.current || !subscriber || !amountCentavos || !preview) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      if (method === 'GCASH') {
        if (!proof) return;
        await window.bcis!.payments.submitGcash({
          subscriberId: subscriber.id,
          amountCentavos,
          referenceNumber: reference.trim(),
          senderDetails: sender.trim(),
          notes: notes.trim() || undefined,
          proof: {
            filename: proof.name,
            mimeType: proof.type,
            dataBase64: await fileBase64(proof),
          },
        });
        setOutcome({ kind: 'pending' });
      } else {
        const result = (await window.bcis!.payments.create({
          subscriberId: subscriber.id,
          amountCentavos,
          method,
          referenceNumber: reference.trim() || undefined,
          notes: notes.trim() || undefined,
          previewFingerprint: preview.fingerprint,
          idempotencyKey: requestKey.current,
        })) as { receiptNumber: string };
        setOutcome({ kind: 'posted', receiptNumber: result.receiptNumber });
      }
      setStep('done');
    } catch (caught) {
      setError(message(caught));
      if (message(caught).includes('invoice balance changed')) {
        setPreview(null);
        setStep('details');
        requestKey.current = crypto.randomUUID();
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const stages = ['Find account', 'Payment details', 'Review', 'Result'];
  const stageIndex = ['find', 'details', 'review', 'done'].indexOf(step);
  return (
    <section className="receive-flow" aria-label="Receive payment">
      <div className="receive-heading">
        <div>
          <span className="receive-eyebrow">Cashier workspace</span>
          <h2>Receive a payment</h2>
          <p>One account, one payment, one clear result.</p>
        </div>
        <span className="receive-step-count">Step {stageIndex + 1} of 4</span>
      </div>
      <ol className="receive-progress" aria-label="Payment steps">
        {stages.map((label, index) => (
          <li
            aria-current={index === stageIndex ? 'step' : undefined}
            className={index <= stageIndex ? 'is-active' : ''}
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

      {step === 'find' ? (
        <div className="receive-stage">
          <div className="receive-stage-title">
            <span className="receive-eyebrow">01 / Find account</span>
            <h3>Who is paying?</h3>
            <p>
              Search by name or account number, then choose the matching card.
            </p>
          </div>
          <form className="receive-search" onSubmit={search}>
            <label htmlFor="receive-account-search">
              Subscriber or account number
            </label>
            <div>
              <input
                id="receive-account-search"
                onChange={(event) => {
                  searchRequest.current += 1;
                  setQuery(event.target.value);
                  setSearched(false);
                  setResults([]);
                  setBusy(false);
                }}
                placeholder="e.g. SUB-00001 or Maria Santos"
                type="search"
                value={query}
              />
              <button className="primary-action" disabled={busy} type="submit">
                {busy ? 'Searching…' : 'Find account'}
              </button>
            </div>
          </form>
          {searched ? (
            results.length ? (
              <div
                className="receive-results"
                aria-label="Matching subscribers"
              >
                {results.map((item) => (
                  <button
                    className="receive-account-card"
                    key={item.id}
                    onClick={() => chooseAccount(item)}
                    type="button"
                  >
                    <span className="receive-account-avatar" aria-hidden="true">
                      {item.fullName.slice(0, 1)}
                    </span>
                    <span className="receive-account-copy">
                      <strong>{item.fullName}</strong>
                      <small>
                        {item.accountNumber} · {item.serviceCount}{' '}
                        {item.serviceCount === 1 ? 'service' : 'services'}
                      </small>
                    </span>
                    <span className="receive-account-status">
                      {item.status.toLowerCase().replaceAll('_', ' ')}
                    </span>
                    <span aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="receive-empty">
                No matching account. Try the full account number or another
                spelling.
              </p>
            )
          ) : (
            <p className="receive-empty">
              Matching accounts appear here as cards.
            </p>
          )}
        </div>
      ) : null}

      {step !== 'find' && subscriber ? (
        <div className="receive-selected-account">
          <span className="receive-account-avatar" aria-hidden="true">
            {subscriber.fullName.slice(0, 1)}
          </span>
          <span>
            <strong>{subscriber.fullName}</strong>
            <small>
              {subscriber.accountNumber} · {subscriber.serviceCount}{' '}
              {subscriber.serviceCount === 1 ? 'service' : 'services'}
            </small>
          </span>
          {step !== 'done' ? (
            <button
              onClick={() => {
                setStep('find');
                setPreview(null);
                setError('');
              }}
              type="button"
            >
              Change account
            </button>
          ) : null}
        </div>
      ) : null}

      {step === 'details' ? (
        <form className="receive-stage" onSubmit={review}>
          <div className="receive-stage-title">
            <span className="receive-eyebrow">02 / Payment details</span>
            <h3>How much was received?</h3>
            <p>
              Enter the amount and choose the method. Only fields needed for
              that method appear.
            </p>
          </div>
          <fieldset className="receive-field-grid" disabled={busy}>
            <label>
              Amount received (PHP)
              <input
                autoFocus
                inputMode="decimal"
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                required
                type="text"
                value={amount}
              />
            </label>
            <label>
              Payment method
              <select
                onChange={(event) => setMethod(event.target.value as Method)}
                value={method}
              >
                <option value="CASH">Cash</option>
                <option value="GCASH">GCash</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CHEQUE">Cheque</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            {method !== 'CASH' ? (
              <label>
                Reference number
                <input
                  onChange={(event) => setReference(event.target.value)}
                  required={method === 'GCASH'}
                  value={reference}
                />
              </label>
            ) : null}
            {method === 'GCASH' ? (
              <>
                <label>
                  Sender details
                  <input
                    onChange={(event) => setSender(event.target.value)}
                    required
                    value={sender}
                  />
                </label>
                <label className="receive-full">
                  Proof image
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) =>
                      setProof(event.target.files?.[0] ?? null)
                    }
                    required={!proof}
                    type="file"
                  />
                  {proof ? <small>Selected: {proof.name}</small> : null}
                </label>
              </>
            ) : null}
            <label className="receive-full">
              Notes <span className="receive-optional">optional</span>
              <textarea
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                value={notes}
              />
            </label>
          </fieldset>
          {method === 'GCASH' ? (
            <p className="receive-info">
              GCash proof goes to an authorized verifier. A receipt is created
              only after approval.
            </p>
          ) : null}
          <div className="receive-actions">
            <button
              disabled={busy}
              onClick={() => setStep('find')}
              type="button"
            >
              Back
            </button>
            <button className="primary-action" disabled={busy} type="submit">
              {busy ? 'Preparing review…' : 'Review payment →'}
            </button>
          </div>
        </form>
      ) : null}

      {step === 'review' && preview && amountCentavos ? (
        <div className="receive-stage">
          <div className="receive-stage-title">
            <span className="receive-eyebrow">03 / Review</span>
            <h3>
              {method === 'GCASH'
                ? 'Review submission'
                : 'Confirm before posting'}
            </h3>
            <p>
              {method === 'GCASH'
                ? 'This is the expected allocation if the proof is approved. Balances may change before verification.'
                : 'The oldest unpaid invoices receive this payment first.'}
            </p>
          </div>
          <div className="receive-review-hero">
            <span>Amount received</span>
            <strong>{money(amountCentavos)}</strong>
            <small>
              {method.replaceAll('_', ' ').toLowerCase()}
              {reference.trim() ? ` · Ref ${reference.trim()}` : ''}
            </small>
          </div>
          <div className="receive-allocation">
            <h4>Expected allocation</h4>
            <div className="receive-amount-row">
              <span>Outstanding before payment</span>
              <strong>{money(preview.balanceCentavos)}</strong>
            </div>
            {preview.invoices
              .filter((item) => item.proposedCentavos > 0)
              .map((item) => (
                <div className="receive-amount-row" key={item.id}>
                  <span>
                    {item.invoiceNumber}
                    <small>Due {item.dueDate}</small>
                  </span>
                  <strong>{money(item.proposedCentavos)}</strong>
                </div>
              ))}
            <div className="receive-amount-row receive-credit">
              <span>Remaining account credit</span>
              <strong>{money(preview.unallocatedCreditCentavos)}</strong>
            </div>
          </div>
          {method === 'GCASH' ? (
            <p className="receive-info">
              Submitting does not post money or create a receipt. A verifier
              will review {proof?.name}.
            </p>
          ) : (
            <p className="receive-info">
              Balances are checked again when you post. If they changed, you
              will review the updated allocation.
            </p>
          )}
          <div className="receive-actions">
            <button
              disabled={busy}
              onClick={() => {
                setStep('details');
                setPreview(null);
                setError('');
                requestKey.current = crypto.randomUUID();
              }}
              type="button"
            >
              Edit details
            </button>
            <button
              className="primary-action"
              disabled={busy}
              onClick={() => void submit()}
              type="button"
            >
              {busy
                ? 'Working…'
                : method === 'GCASH'
                  ? 'Submit for verification'
                  : `Post ${money(amountCentavos)} payment`}
            </button>
          </div>
        </div>
      ) : null}

      {step === 'done' && outcome ? (
        <div className="receive-stage receive-complete" role="status">
          <span className="receive-complete-mark" aria-hidden="true">
            ✓
          </span>
          <span className="receive-eyebrow">04 / Result</span>
          <h3>
            {outcome.kind === 'posted'
              ? 'Payment posted'
              : 'Submitted for verification'}
          </h3>
          <p>
            {outcome.kind === 'posted'
              ? `Receipt ${outcome.receiptNumber} is ready. The subscriber balance has been updated.`
              : 'No payment has been posted yet. An authorized verifier will review the GCash proof.'}
          </p>
          <div className="receive-actions">
            <button onClick={reset} type="button">
              Receive another payment
            </button>
            <button
              className="primary-action"
              onClick={() =>
                onOpenHistory(
                  outcome.kind === 'posted' ? outcome.receiptNumber : undefined,
                )
              }
              type="button"
            >
              {outcome.kind === 'posted'
                ? 'View receipt →'
                : 'View payment history →'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
