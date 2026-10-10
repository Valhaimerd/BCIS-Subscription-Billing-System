import { useState, type FormEvent, type InputHTMLAttributes } from 'react';

import { ModalDialog } from './ModalDialog';

export type ActionDialogField = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  | 'autoComplete'
  | 'inputMode'
  | 'max'
  | 'min'
  | 'placeholder'
  | 'required'
  | 'step'
  | 'type'
> & {
  name: string;
  label: string;
  defaultValue?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'The request could not be completed.';
}

export function ActionDialog({
  ariaLabel,
  title,
  description,
  submitLabel,
  tone = 'primary',
  fields,
  onClose,
  onSubmit,
  validate,
}: {
  ariaLabel: string;
  title: string;
  description: string;
  submitLabel: string;
  tone?: 'primary' | 'danger';
  fields: ActionDialogField[];
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => Promise<void>;
  validate?: (values: Record<string, string>) => string | null;
}) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    ) as Record<string, string>;
    const validationError = validate?.(values);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setPending(true);
    try {
      await onSubmit(values);
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <ModalDialog
      ariaLabel={ariaLabel}
      className="detail-dialog--compact"
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <section className="data-card action-dialog-card">
        <header>
          <span className="section-kicker">Review action</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </header>
        <form className="action-dialog-form" onSubmit={submit}>
          {fields.map((field, index) => {
            const { label, ...input } = field;
            return (
              <label key={field.name}>
                {label}
                <input
                  {...input}
                  autoFocus={index === 0}
                  defaultValue={field.defaultValue}
                />
              </label>
            );
          })}
          {error ? (
            <div className="form-error" role="alert">
              {error}
            </div>
          ) : null}
          <div className="action-dialog-footer">
            <button disabled={pending} onClick={onClose} type="button">
              Cancel
            </button>
            <button
              className={tone === 'danger' ? 'danger-action' : 'primary-action'}
              disabled={pending}
              type="submit"
            >
              {pending ? 'Working…' : submitLabel}
            </button>
          </div>
        </form>
      </section>
    </ModalDialog>
  );
}
