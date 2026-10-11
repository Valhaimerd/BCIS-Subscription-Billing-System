import type {
  ApplicationSettingsDto,
  BackupHistoryDto,
  OperationsReadinessDto,
  Paginated,
  RestorePreviewDto,
} from '@bcis/contracts';
import { useEffect, useRef, useState } from 'react';

const messageFor = (error: unknown) =>
  error instanceof Error
    ? error.message.replace(
        /^Error invoking remote method '[^']+': Error: /,
        '',
      )
    : 'The operation could not be completed.';

const formatDate = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

const countLabel = (key: string) =>
  ({
    users: 'Staff accounts',
    subscribers: 'Subscribers',
    invoices: 'Invoices',
    payments: 'Payments',
    ledger_entries: 'Ledger entries',
  })[key] ?? key.replaceAll('_', ' ');

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} bytes`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

type RestoreStep = 'verify' | 'impact' | 'confirm' | 'result';

export function OperationsView({
  canRestore,
  canManageSettings,
}: {
  canRestore: boolean;
  canManageSettings: boolean;
}) {
  const [readiness, setReadiness] = useState<OperationsReadinessDto | null>(
    null,
  );
  const [settings, setSettings] = useState<ApplicationSettingsDto | null>(null);
  const [history, setHistory] = useState<Paginated<BackupHistoryDto> | null>(
    null,
  );
  const [latestBackup, setLatestBackup] = useState<BackupHistoryDto | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<BackupHistoryDto | null>(
    null,
  );
  const [restorePreview, setRestorePreview] =
    useState<RestorePreviewDto | null>(null);
  const [restoreError, setRestoreError] = useState('');
  const [restoreStep, setRestoreStep] = useState<RestoreStep>('verify');
  const [confirmation, setConfirmation] = useState('');
  const [restoreResultId, setRestoreResultId] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const resultCardRef = useRef<HTMLLIElement>(null);

  async function load(targetPage = page) {
    setLoading(true);
    setLoadFailed(false);
    setError('');
    try {
      const historyRequest = window.bcis!.operations.listBackups(
        targetPage,
        10,
      );
      const latestHistoryRequest =
        targetPage === 1
          ? historyRequest
          : window.bcis!.operations.listBackups(1, 10);
      const [nextReadiness, nextSettings, nextHistory, latestHistory] =
        await Promise.all([
          window.bcis!.operations.readiness(),
          window.bcis!.operations.settings(),
          historyRequest,
          latestHistoryRequest,
        ]);
      setReadiness(nextReadiness);
      setSettings(nextSettings);
      setHistory(nextHistory);
      setLatestBackup(
        latestHistory.items.find(
          (item) =>
            item.operation === 'BACKUP' &&
            item.status === 'SUCCEEDED' &&
            item.available,
        ) ?? null,
      );
    } catch (caught) {
      setError(messageFor(caught));
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => void load(page), [page]);

  useEffect(() => {
    if (restoreTarget && dialogRef.current && !dialogRef.current.open)
      dialogRef.current.showModal();
  }, [restoreTarget]);

  useEffect(() => {
    if (showRegister && restoreResultId)
      resultCardRef.current?.scrollIntoView?.({ block: 'center' });
  }, [showRegister, restoreResultId, history]);

  async function createBackup() {
    setBusy('backup');
    setError('');
    setNotice('');
    try {
      const result = await window.bcis!.operations.createBackup();
      setNotice(`Backup ${result.backupName} was created and verified.`);
      setPage(1);
      await load(1);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy('');
    }
  }

  async function updateRetention(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('settings');
    setError('');
    try {
      const value = Number(
        new FormData(event.currentTarget).get('backupRetentionCount'),
      );
      setSettings(await window.bcis!.operations.updateSettings(value));
      setNotice('Backup retention updated. History records remain immutable.');
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy('');
    }
  }

  async function verifyRestore(item = restoreTarget) {
    if (!item) return;
    setBusy('preflight');
    setRestoreError('');
    setRestorePreview(null);
    setRestoreStep('verify');
    try {
      setRestorePreview(await window.bcis!.operations.previewRestore(item.id));
    } catch (caught) {
      setRestoreError(messageFor(caught));
    } finally {
      setBusy('');
    }
  }

  async function beginRestore(item: BackupHistoryDto) {
    setRestoreTarget(item);
    setRestorePreview(null);
    setRestoreError('');
    setConfirmation('');
    setRestoreStep('verify');
    setRestoreResultId('');
    await verifyRestore(item);
  }

  async function restore() {
    if (!restoreTarget || !restorePreview) return;
    setBusy('restore');
    setError('');
    setRestoreError('');
    setNotice('');
    try {
      const result = await window.bcis!.operations.restoreBackup(
        restoreTarget.id,
        confirmation,
      );
      setRestoreResultId(result.id);
      setRestoreStep('result');
      setNotice('Restore completed and verified.');
      await load(1);
    } catch (caught) {
      setRestoreError(
        `${messageFor(caught)} Refresh the history before attempting another restore.`,
      );
      setRestoreStep('result');
    } finally {
      setBusy('');
    }
  }

  function closeRestore() {
    if (busy === 'restore') return;
    if (dialogRef.current?.open) dialogRef.current.close();
    setRestoreTarget(null);
    setRestorePreview(null);
    setRestoreError('');
    setConfirmation('');
  }

  function handleRestoreCancel(event: React.SyntheticEvent<HTMLDialogElement>) {
    if (busy === 'restore') {
      event.preventDefault();
      return;
    }
    setRestoreTarget(null);
    setRestorePreview(null);
    setRestoreError('');
    setConfirmation('');
  }

  const expectedConfirmation = restoreTarget
    ? `RESTORE ${restoreTarget.backupName}`
    : '';
  const readinessItems = [
    {
      label: 'Database connection',
      ready: readiness?.databaseReady,
      detail: 'The API can reach the live database.',
    },
    {
      label: 'Attachment storage',
      ready: readiness?.attachmentStorageReady,
      detail: 'Subscriber documents can be read and written.',
    },
    {
      label: 'Backup storage',
      ready: readiness?.backupStorageReady,
      detail: 'Verified snapshots can be retained on the server.',
    },
    {
      label: 'PostgreSQL tools',
      ready: readiness?.postgresToolsReady,
      detail: 'Database backup and restore tools are available.',
    },
  ];

  return (
    <section
      className="operations-workspace"
      aria-label="Backup and recovery workspace"
    >
      <div className="operations-toolbar">
        <button
          className="primary-action"
          disabled={
            busy !== '' ||
            loading ||
            readiness?.restoring ||
            !readiness?.databaseReady ||
            !readiness.attachmentStorageReady ||
            !readiness.backupStorageReady ||
            !readiness.postgresToolsReady
          }
          onClick={() => void createBackup()}
          type="button"
        >
          {busy === 'backup' ? 'Creating backup…' : 'Create verified backup'}
        </button>
      </div>

      {error ? (
        <div className="form-error" role="alert">
          {error}
          {loadFailed ? (
            <button
              disabled={loading}
              onClick={() => void load()}
              type="button"
            >
              Retry loading recovery status
            </button>
          ) : null}
        </div>
      ) : null}
      {notice ? (
        <div className="success-notice" role="status">
          {notice}
        </div>
      ) : null}
      {loading ||
      busy === 'backup' ||
      busy === 'restore' ||
      busy === 'settings' ? (
        <p className="operations-progress" role="status">
          {busy === 'backup'
            ? 'Creating and verifying backup…'
            : busy === 'restore'
              ? 'Restoring database and attachments. Keep the application open until checks finish…'
              : busy === 'settings'
                ? 'Saving backup retention…'
                : 'Refreshing recovery status and backup history…'}
        </p>
      ) : null}

      <section className="backup-overview" aria-label="Recovery overview">
        <article className="data-card latest-backup-card">
          <div className="latest-backup-copy">
            <span className="eyebrow">Latest verified backup</span>
            <h3>{latestBackup?.backupName ?? 'No verified backup yet'}</h3>
            <p>
              {latestBackup
                ? `Completed ${formatDate(latestBackup.completedAt)}`
                : 'Create a verified snapshot to establish a recovery point.'}
            </p>
          </div>
          <div className="latest-backup-status">
            <span
              className={`status-pill ${latestBackup ? 'status-pill--success' : loading ? 'status-pill--neutral' : 'status-pill--warning'}`}
            >
              {latestBackup
                ? 'Files available'
                : loading
                  ? 'Checking'
                  : 'Not protected'}
            </span>
            {settings ? (
              <span>
                Keep the newest {settings.backupRetentionCount} backups
              </span>
            ) : null}
            {latestBackup ? (
              <span>Version compatibility is checked before restore.</span>
            ) : null}
          </div>
        </article>

        <div className="operations-status-grid" aria-label="Recovery health">
          {readinessItems.map(({ label, ready, detail }) => (
            <article
              className={`data-card readiness-card ${ready === false ? 'readiness-card--attention' : ''}`}
              key={label}
            >
              <span className="readiness-label">
                <span
                  aria-hidden="true"
                  className={`readiness-dot ${ready ? 'readiness-dot--ready' : ''}`}
                />
                {label}
              </span>
              <strong
                className={
                  ready === undefined
                    ? 'pending-state'
                    : ready
                      ? 'ready-state'
                      : 'not-ready-state'
                }
              >
                {ready === undefined
                  ? 'Checking…'
                  : ready
                    ? 'Ready'
                    : 'Needs attention'}
              </strong>
              <small>{detail}</small>
            </article>
          ))}
        </div>
      </section>

      {canManageSettings && settings ? (
        <form className="data-card retention-form" onSubmit={updateRetention}>
          <div>
            <span className="eyebrow">Storage policy</span>
            <h3>Backup retention</h3>
            <p>
              Keep recent verified backup files. Operation history stays
              available for audit.
            </p>
          </div>
          <label>
            Backups to keep
            <input
              defaultValue={settings.backupRetentionCount}
              key={settings.updatedAt}
              max={50}
              min={1}
              name="backupRetentionCount"
              required
              type="number"
            />
          </label>
          <button
            className="secondary-action"
            disabled={busy !== ''}
            type="submit"
          >
            {busy === 'settings' ? 'Saving…' : 'Save retention'}
          </button>
        </form>
      ) : null}

      <section
        className="data-card backup-register-card"
        aria-labelledby="backup-register-title"
      >
        <div className="backup-register-heading">
          <div>
            <span className="eyebrow">Immutable operation record</span>
            <h3 id="backup-register-title">Backup register</h3>
            <p>
              Recent backup and recovery activity, with file availability and
              verification status.
            </p>
          </div>
          <div className="backup-register-actions">
            <span>
              {history
                ? `${history.total} recorded operation${history.total === 1 ? '' : 's'}`
                : 'Loading history'}
            </span>
            <button
              className="secondary-action"
              disabled={busy !== '' || loading}
              onClick={() => void load()}
              type="button"
            >
              {loading ? 'Refreshing…' : 'Refresh history'}
            </button>
          </div>
        </div>
        {!history ? (
          <p>Loading backup history…</p>
        ) : history.items.length === 0 ? (
          <div className="empty-state">
            No backup or restore activity has been recorded.
          </div>
        ) : (
          <>
            <ol className="backup-timeline" aria-label="Backup activity">
              {(showRegister ? history.items : history.items.slice(0, 5)).map(
                (item) => (
                  <li
                    className={`backup-event ${item.id === restoreResultId ? 'backup-event--highlight' : ''}`}
                    key={item.id}
                    ref={
                      item.id === restoreResultId ? resultCardRef : undefined
                    }
                  >
                    <span
                      aria-hidden="true"
                      className={`backup-event-marker ${item.status === 'SUCCEEDED' ? 'backup-event-marker--success' : 'backup-event-marker--failure'}`}
                    />
                    <article className="backup-event-card">
                      <div className="backup-event-topline">
                        <div>
                          <span className="backup-event-kind">
                            {item.operation === 'RESTORE'
                              ? 'Restore completed'
                              : item.operation === 'SAFETY_BACKUP'
                                ? 'Restore safety point'
                                : 'Backup created'}
                          </span>
                          <h4>
                            {item.operation === 'RESTORE'
                              ? item.backupName
                              : (item.sourceBackupName ?? item.backupName)}
                          </h4>
                        </div>
                        <span
                          className={`status-pill ${item.status === 'SUCCEEDED' ? 'status-pill--success' : 'status-pill--failure'}`}
                        >
                          {item.status === 'SUCCEEDED' ? 'Verified' : 'Failed'}
                        </span>
                      </div>
                      <div className="backup-event-meta">
                        <span>{formatDate(item.completedAt)}</span>
                        <span
                          className={
                            item.available
                              ? 'file-state--available'
                              : 'file-state--missing'
                          }
                        >
                          {item.available
                            ? 'Files available'
                            : 'History only · files unavailable'}
                        </span>
                      </div>
                      {item.message ? (
                        <p className="backup-event-message">{item.message}</p>
                      ) : null}
                      {item.operation === 'RESTORE' && item.sourceBackupName ? (
                        <p className="backup-event-source">
                          Restored from {item.sourceBackupName}
                        </p>
                      ) : null}
                      {canRestore &&
                      item.operation !== 'RESTORE' &&
                      item.status === 'SUCCEEDED' &&
                      item.available ? (
                        <button
                          className="backup-event-action"
                          disabled={busy !== '' || loading}
                          onClick={() => void beginRestore(item)}
                          type="button"
                        >
                          Review restore <span aria-hidden="true">→</span>
                        </button>
                      ) : null}
                    </article>
                  </li>
                ),
              )}
            </ol>
            {history.items.length > 5 && !showRegister ? (
              <button
                className="secondary-action register-toggle"
                onClick={() => setShowRegister(true)}
                type="button"
              >
                Show backup register ({history.items.length} recent)
              </button>
            ) : null}
            {history && history.total > history.pageSize ? (
              <div className="pagination-controls">
                <button
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                  type="button"
                >
                  Previous
                </button>
                <span>
                  Page {page} of {Math.ceil(history.total / history.pageSize)}
                </span>
                <button
                  disabled={page * history.pageSize >= history.total}
                  onClick={() => setPage(page + 1)}
                  type="button"
                >
                  Next
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      {restoreTarget ? (
        <dialog
          aria-labelledby="restore-title"
          className="restore-dialog"
          onCancel={handleRestoreCancel}
          onClose={handleRestoreCancel}
          ref={dialogRef}
        >
          <div className="restore-dialog-header">
            <div>
              <span className="eyebrow">Guarded recovery</span>
              <h3 id="restore-title">
                Restore from {restoreTarget.backupName}
              </h3>
            </div>
            <button
              aria-label="Close restore review"
              className="icon-button"
              disabled={busy === 'restore'}
              onClick={closeRestore}
              type="button"
            >
              ×
            </button>
          </div>

          <ol className="restore-stepper" aria-label="Restore steps">
            {(['verify', 'impact', 'confirm', 'result'] as const).map(
              (step, index) => (
                <li
                  aria-current={restoreStep === step ? 'step' : undefined}
                  className={
                    restoreStep === step
                      ? 'restore-step restore-step--current'
                      : index <
                          ['verify', 'impact', 'confirm', 'result'].indexOf(
                            restoreStep,
                          )
                        ? 'restore-step restore-step--complete'
                        : 'restore-step'
                  }
                  key={step}
                >
                  <span>{index + 1}</span>
                  {step === 'verify'
                    ? 'Verify files'
                    : step === 'impact'
                      ? 'Review impact'
                      : step === 'confirm'
                        ? 'Confirm'
                        : 'Result'}
                </li>
              ),
            )}
          </ol>

          {restoreStep === 'verify' ? (
            <div className="restore-dialog-body">
              {busy === 'preflight' ? (
                <div className="restore-verifying" role="status">
                  <span aria-hidden="true" className="restore-spinner" />
                  <div>
                    <strong>Verifying this backup</strong>
                    <p>
                      Checking database and attachment checksums, then matching
                      the backup version to this server.
                    </p>
                  </div>
                </div>
              ) : restoreError ? (
                <div className="form-error" role="alert">
                  <strong>Restore review could not continue.</strong>
                  <span>{restoreError}</span>
                </div>
              ) : restorePreview ? (
                <div className="restore-verified-card">
                  <span aria-hidden="true" className="restore-verified-icon">
                    ✓
                  </span>
                  <div>
                    <strong>Backup verified</strong>
                    <p>
                      Checksums match, and this snapshot is compatible with the
                      current server.
                    </p>
                  </div>
                </div>
              ) : null}
              {restoreError ? (
                <div className="restore-dialog-actions">
                  <button
                    className="primary-action"
                    disabled={busy !== ''}
                    onClick={() => void verifyRestore()}
                    type="button"
                  >
                    Retry verification
                  </button>
                  <button
                    className="secondary-action"
                    disabled={busy !== ''}
                    onClick={closeRestore}
                    type="button"
                  >
                    Close
                  </button>
                </div>
              ) : restorePreview ? (
                <div className="restore-dialog-actions">
                  <button
                    className="primary-action"
                    onClick={() => setRestoreStep('impact')}
                    type="button"
                  >
                    Review impact
                  </button>
                  <button
                    className="secondary-action"
                    onClick={closeRestore}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {restoreStep === 'impact' && restorePreview ? (
            <div className="restore-dialog-body">
              <div className="restore-impact-warning">
                <strong>This replaces current data</strong>
                <p>
                  Restoring replaces the current database and attachments with
                  this snapshot. Changes made after{' '}
                  {formatDate(restorePreview.createdAt)} will be lost.
                </p>
              </div>
              <div className="restore-impact-summary">
                <article className="restore-impact-card">
                  <span>Selected snapshot</span>
                  <strong>{restorePreview.backupName}</strong>
                  <small>
                    {restorePreview.applicationVersion} · schema{' '}
                    {restorePreview.schemaVersion}
                  </small>
                  <small>
                    {formatBytes(restorePreview.databaseSizeBytes)} database ·{' '}
                    {restorePreview.attachmentCount} attachments
                  </small>
                </article>
                <article className="restore-impact-card restore-impact-card--safety">
                  <span>Safety checkpoint</span>
                  <strong>Created automatically first</strong>
                  <small>
                    The current database and attachments are saved before
                    replacement.
                  </small>
                </article>
              </div>
              <div className="restore-counts">
                <div className="restore-counts-heading">
                  <h4>Record count impact</h4>
                  <span>Snapshot compared with current system</span>
                </div>
                <div className="restore-count-grid">
                  {Object.keys(restorePreview.rowCounts).map((key) => (
                    <article className="restore-count-card" key={key}>
                      <span>{countLabel(key)}</span>
                      <div>
                        <strong>{restorePreview.rowCounts[key]}</strong>
                        <span aria-hidden="true">←</span>
                        <small>
                          Current {restorePreview.currentRowCounts[key] ?? '—'}
                        </small>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
              <div className="restore-dialog-actions">
                <button
                  className="primary-action"
                  onClick={() => setRestoreStep('confirm')}
                  type="button"
                >
                  Continue to confirmation
                </button>
                <button
                  className="secondary-action"
                  onClick={() => setRestoreStep('verify')}
                  type="button"
                >
                  Back
                </button>
              </div>
            </div>
          ) : null}

          {restoreStep === 'confirm' && restorePreview ? (
            <div className="restore-dialog-body">
              <div className="restore-final-warning">
                <strong>Final checkpoint before replacement</strong>
                <p>
                  BCIS will re-verify the files, create the safety checkpoint,
                  restore the database and attachments, and verify the result.
                  Keep this application open until completion.
                </p>
              </div>
              {restoreError ? (
                <div className="form-error" role="alert">
                  <strong>Restore needs review</strong>
                  <span>{restoreError}</span>
                  <button
                    className="secondary-action"
                    disabled={busy !== ''}
                    onClick={() => void load()}
                    type="button"
                  >
                    Refresh history
                  </button>
                </div>
              ) : null}
              <label className="restore-confirm-input">
                Type <code>{expectedConfirmation}</code> to authorize this
                replacement.
                <input
                  autoComplete="off"
                  disabled={busy !== '' || Boolean(restoreError)}
                  onChange={(event) => setConfirmation(event.target.value)}
                  value={confirmation}
                />
              </label>
              <div className="restore-dialog-actions">
                <button
                  className="danger-action"
                  disabled={
                    confirmation !== expectedConfirmation ||
                    busy !== '' ||
                    Boolean(restoreError)
                  }
                  onClick={() => void restore()}
                  type="button"
                >
                  {busy === 'restore'
                    ? 'Restoring and verifying…'
                    : 'Restore and replace current data'}
                </button>
                <button
                  className="secondary-action"
                  disabled={busy === 'restore'}
                  onClick={() => setRestoreStep('impact')}
                  type="button"
                >
                  Review impact again
                </button>
                <button
                  className="secondary-action"
                  disabled={busy === 'restore'}
                  onClick={closeRestore}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {restoreStep === 'result' ? (
            <div className="restore-dialog-body">
              {restoreResultId ? (
                <div className="restore-result-card" role="status">
                  <span aria-hidden="true" className="restore-result-icon">
                    ✓
                  </span>
                  <div>
                    <strong>Restore completed and verified.</strong>
                    <p>
                      The server recorded the recovery operation and retained
                      its pre-restore safety checkpoint.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="form-error" role="alert">
                  <strong>Restore outcome needs checking.</strong>
                  <span>{restoreError}</span>
                  <p>
                    Refresh the register and inspect the latest result before
                    taking another recovery action.
                  </p>
                </div>
              )}
              <div className="restore-dialog-actions">
                {restoreResultId ? (
                  <button
                    className="primary-action"
                    onClick={() => {
                      setShowRegister(true);
                      closeRestore();
                    }}
                    type="button"
                  >
                    View restore result in history
                  </button>
                ) : (
                  <button
                    className="primary-action"
                    disabled={busy !== ''}
                    onClick={() => void load(1)}
                    type="button"
                  >
                    Refresh backup register
                  </button>
                )}
                <button
                  className="secondary-action"
                  disabled={busy === 'restore'}
                  onClick={closeRestore}
                  type="button"
                >
                  Close
                </button>
              </div>
            </div>
          ) : null}
        </dialog>
      ) : null}
    </section>
  );
}
