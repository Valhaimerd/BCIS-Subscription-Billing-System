import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import type {
  ApplicationSettingsDto,
  BackupHistoryDto,
  OperationsReadinessDto,
  Paginated,
} from '@bcis/contracts';
import { OperationsView } from './OperationsView';

const readiness: OperationsReadinessDto = {
  databaseReady: true,
  attachmentStorageReady: true,
  backupStorageReady: true,
  postgresToolsReady: true,
  restoring: false,
};
const settings: ApplicationSettingsDto = {
  backupRetentionCount: 7,
  updatedAt: '2026-10-10T00:00:00.000Z',
};
const historyItem: BackupHistoryDto = {
  id: 'backup-1',
  operation: 'BACKUP',
  status: 'SUCCEEDED',
  backupName: 'bcis-2026-10-10',
  sourceBackupName: null,
  message: 'Verified',
  completedAt: '2026-10-10T00:00:00.000Z',
  available: true,
  manifest: null,
};
const history: Paginated<BackupHistoryDto> = {
  items: [historyItem],
  page: 1,
  pageSize: 10,
  total: 1,
};

function attachOperations(overrides: Record<string, unknown> = {}) {
  const operations = {
    readiness: vi.fn(async () => readiness),
    settings: vi.fn(async () => settings),
    listBackups: vi.fn(async () => history),
    createBackup: vi.fn(async () => ({ backupName: historyItem.backupName })),
    updateSettings: vi.fn(async () => settings),
    restoreBackup: vi.fn(async () => undefined),
    ...overrides,
  };
  window.bcis = { operations } as unknown as NonNullable<typeof window.bcis>;
  return operations;
}

afterEach(() => {
  cleanup();
  delete window.bcis;
  vi.restoreAllMocks();
});

it('offers retry when readiness and backup history fail to load', async () => {
  const user = userEvent.setup();
  const operations = attachOperations({
    readiness: vi
      .fn()
      .mockRejectedValueOnce(new Error('API unavailable'))
      .mockResolvedValueOnce(readiness),
  });
  render(<OperationsView canRestore={false} canManageSettings={false} />);

  expect(await screen.findByRole('alert')).toHaveTextContent('API unavailable');
  await user.click(
    screen.getByRole('button', { name: 'Retry loading recovery status' }),
  );
  expect(await screen.findByRole('table')).toBeVisible();
  expect(operations.readiness).toHaveBeenCalledTimes(2);
});

it('announces backup progress and completion', async () => {
  const user = userEvent.setup();
  let completeBackup!: (value: { backupName: string }) => void;
  const operations = attachOperations({
    createBackup: vi.fn(
      () =>
        new Promise<{ backupName: string }>(
          (resolve) => (completeBackup = resolve),
        ),
    ),
  });
  render(<OperationsView canRestore canManageSettings />);

  await user.click(
    await screen.findByRole('button', { name: 'Create verified backup' }),
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    'Creating and verifying backup',
  );
  expect(
    screen.getByRole('button', { name: 'Creating backup...' }),
  ).toBeDisabled();

  completeBackup({ backupName: historyItem.backupName });
  expect(await screen.findByText(/was created and verified/)).toBeVisible();
  expect(operations.createBackup).toHaveBeenCalledOnce();
});

it('shows a retryable operation error without leaving backup disabled', async () => {
  const user = userEvent.setup();
  attachOperations({
    createBackup: vi
      .fn()
      .mockRejectedValueOnce(new Error('Backup storage is full.')),
  });
  render(<OperationsView canRestore canManageSettings />);

  const createButton = await screen.findByRole('button', {
    name: 'Create verified backup',
  });
  await user.click(createButton);

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Backup storage is full.',
  );
  expect(createButton).toBeEnabled();
});

it('requires exact restore confirmation and keeps restore hidden for read-only users', async () => {
  const user = userEvent.setup();
  const operations = attachOperations();
  const { rerender } = render(
    <OperationsView canRestore={false} canManageSettings={false} />,
  );
  expect(await screen.findByRole('table')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Restore' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'Backup retention' }),
  ).not.toBeInTheDocument();

  rerender(<OperationsView canRestore canManageSettings />);
  await user.click(await screen.findByRole('button', { name: 'Restore' }));
  const restoreButton = screen.getByRole('button', {
    name: 'Restore selected backup',
  });
  expect(restoreButton).toBeDisabled();
  await user.type(screen.getByLabelText(/Type/), 'RESTORE bcis-2026-10-10');
  expect(restoreButton).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(operations.restoreBackup).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('heading', { name: 'Confirm guarded restore' }),
  ).not.toBeInTheDocument();
});
