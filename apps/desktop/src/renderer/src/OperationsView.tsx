import type {
  ApplicationSettingsDto,
  DelinquencySettingsDto,
  BackupHistoryDto,
  OperationsReadinessDto,
  Paginated,
} from '@bcis/contracts';
import { useEffect, useState } from 'react';

const messageFor = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The operation could not be completed.';

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
  const [delinquency, setDelinquency] = useState<DelinquencySettingsDto | null>(
    null,
  );
  const [history, setHistory] = useState<Paginated<BackupHistoryDto> | null>(
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
  const [confirmation, setConfirmation] = useState('');

  async function load(targetPage = page) {
    setLoading(true);
    setLoadFailed(false);
    setError('');
    try {
      const [nextReadiness, nextSettings, nextHistory] = await Promise.all([
        window.bcis!.operations.readiness(),
        window.bcis!.operations.settings(),
        window.bcis!.operations.listBackups(targetPage, 10),
      ]);
      setReadiness(nextReadiness);
      setSettings(nextSettings);
      setHistory(nextHistory);
      if (canManageSettings)
        setDelinquency(await window.bcis!.receivables.settings());
    } catch (caught) {
      setError(messageFor(caught));
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => void load(page), [page]);

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

  async function updateDelinquency(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy('delinquency');
    setError('');
    try {
      setDelinquency(
        await window.bcis!.receivables.updateSettings({
          gracePeriodDays: Number(data.get('gracePeriodDays')),
          suspensionThresholdDays: Number(data.get('suspensionThresholdDays')),
          reconnectionFeeCentavos: Math.round(
            Number(data.get('reconnectionFee')) * 100,
          ),
        }),
      );
      setNotice('Delinquency policy saved and audited.');
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy('');
    }
  }

  async function restore() {
    if (!restoreTarget) return;
    setBusy('restore');
    setError('');
    setNotice('');
    try {
      await window.bcis!.operations.restoreBackup(
        restoreTarget.id,
        confirmation,
      );
      setNotice(
        'Restore completed and passed database and attachment integrity checks.',
      );
      setRestoreTarget(null);
      setConfirmation('');
      await load(1);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy('');
    }
  }

  const expectedConfirmation = restoreTarget
    ? `RESTORE ${restoreTarget.backupName}`
    : '';

  return (
    <section
      className="operations-workspace"
      aria-labelledby="operations-title"
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">Owner operations</span>
          <h2 id="operations-title">Backup and recovery</h2>
          <p>
            Server-owned PostgreSQL and attachment backups with verified
            restore.
          </p>
        </div>
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
          {busy === 'backup' ? 'Creating backup...' : 'Create verified backup'}
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

      <div
        className="operations-status-grid"
        aria-label="Operational readiness"
      >
        {[
          ['Database', readiness?.databaseReady],
          ['Attachments', readiness?.attachmentStorageReady],
          ['Backup storage', readiness?.backupStorageReady],
          ['PostgreSQL tools', readiness?.postgresToolsReady],
        ].map(([label, ready]) => (
          <article className="data-card readiness-card" key={String(label)}>
            <span>{label}</span>
            <strong className={ready ? 'ready-state' : 'not-ready-state'}>
              {ready === undefined
                ? 'Checking...'
                : ready
                  ? 'Ready'
                  : 'Needs attention'}
            </strong>
          </article>
        ))}
      </div>

      {canManageSettings && settings ? (
        <form className="data-card retention-form" onSubmit={updateRetention}>
          <div>
            <h3>Backup retention</h3>
            <p>
              Keep the newest completed backup directories. History entries are
              retained.
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
          <button disabled={busy !== ''} type="submit">
            {busy === 'settings' ? 'Saving...' : 'Save retention'}
          </button>
        </form>
      ) : null}

      {canManageSettings && delinquency ? (
        <form
          className="data-card retention-form delinquency-policy"
          onSubmit={updateDelinquency}
        >
          <div>
            <h3>Delinquency policy</h3>
            <p>
              Controls follow-up and suspension eligibility in the receivables
              desk. Changes are audited.
            </p>
          </div>
          <label>
            Grace period (days)
            <input
              key={`grace-${delinquency.gracePeriodDays}`}
              type="number"
              name="gracePeriodDays"
              min="0"
              max="365"
              required
              defaultValue={delinquency.gracePeriodDays}
            />
          </label>
          <label>
            Suspension threshold (days)
            <input
              key={`threshold-${delinquency.suspensionThresholdDays}`}
              type="number"
              name="suspensionThresholdDays"
              min="1"
              max="730"
              required
              defaultValue={delinquency.suspensionThresholdDays}
            />
          </label>
          <label>
            Reconnection fee (PHP)
            <input
              key={`fee-${delinquency.reconnectionFeeCentavos}`}
              type="number"
              name="reconnectionFee"
              min="0"
              step="0.01"
              required
              defaultValue={(delinquency.reconnectionFeeCentavos / 100).toFixed(
                2,
              )}
            />
          </label>
          <button
            className="primary-action"
            disabled={busy !== ''}
            type="submit"
          >
            {busy === 'delinquency' ? 'Saving…' : 'Save policy'}
          </button>
        </form>
      ) : null}

      {restoreTarget ? (
        <section
          className="data-card restore-confirmation"
          aria-labelledby="restore-title"
        >
          <h3 id="restore-title">Confirm guarded restore</h3>
          <p>
            BCIS will verify checksums and versions, create a safety backup,
            pause other clients, restore PostgreSQL and attachments, then run
            integrity checks.
          </p>
          <label>
            Type <code>{expectedConfirmation}</code>
            <input
              autoComplete="off"
              onChange={(event) => setConfirmation(event.target.value)}
              value={confirmation}
            />
          </label>
          <div className="form-actions">
            <button
              className="danger-action"
              disabled={confirmation !== expectedConfirmation || busy !== ''}
              onClick={() => void restore()}
              type="button"
            >
              {busy === 'restore' ? 'Restoring...' : 'Restore selected backup'}
            </button>
            <button
              disabled={busy !== ''}
              onClick={() => {
                setRestoreTarget(null);
                setConfirmation('');
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <section className="data-card">
        <div className="section-heading compact-heading">
          <div>
            <h3>Backup history</h3>
            <p>
              Immutable server results; availability reflects retained files.
            </p>
          </div>
          <button
            disabled={busy !== '' || loading}
            onClick={() => void load()}
            type="button"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {!history ? (
          <p>Loading backup history...</p>
        ) : history.items.length === 0 ? (
          <div className="empty-state">
            No backup attempt has been recorded.
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Completed</th>
                  <th>Operation</th>
                  <th>Backup</th>
                  <th>Status</th>
                  <th>Files</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {history.items.map((item) => (
                  <tr key={item.id}>
                    <td>{new Date(item.completedAt).toLocaleString()}</td>
                    <td>{item.operation.replaceAll('_', ' ')}</td>
                    <td>{item.sourceBackupName ?? item.backupName}</td>
                    <td>
                      <span
                        className={`status-pill ${item.status === 'SUCCEEDED' ? 'status-pill--success' : 'status-pill--failure'}`}
                      >
                        {item.status}
                      </span>
                      {item.status === 'FAILED' ? (
                        <small>{item.message}</small>
                      ) : null}
                    </td>
                    <td>{item.available ? 'Available' : 'History only'}</td>
                    <td>
                      {canRestore &&
                      item.operation !== 'RESTORE' &&
                      item.status === 'SUCCEEDED' &&
                      item.available ? (
                        <button
                          disabled={busy !== ''}
                          onClick={() => {
                            setRestoreTarget(item);
                            setConfirmation('');
                          }}
                          type="button"
                        >
                          Restore
                        </button>
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
      </section>
    </section>
  );
}
