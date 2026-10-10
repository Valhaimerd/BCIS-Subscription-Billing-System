import type { ReportExportDto } from '@bcis/contracts';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { config as loadEnvironment } from 'dotenv';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { secureWebPreferences } from './security.js';
import { DesktopAuthClient } from './auth-client.js';

loadEnvironment({
  path: app.isPackaged
    ? join(dirname(process.execPath), '.env')
    : join(import.meta.dirname, '../../../.env'),
  quiet: true,
});

const authClient = new DesktopAuthClient(
  process.env.BCIS_API_BASE_URL ?? 'http://127.0.0.1:3100/api/v1',
);

ipcMain.handle('auth:current', () => authClient.current());
ipcMain.handle(
  'auth:login',
  (_event, credentials: { username: string; password: string }) =>
    authClient.login(credentials),
);
ipcMain.handle('auth:logout', () => authClient.logout());
ipcMain.handle('auth:lock', () => authClient.lock());
ipcMain.handle('auth:unlock', (_event, password: string) =>
  authClient.unlock(password),
);
ipcMain.handle('master:references', () => authClient.data('/reference-data'));
ipcMain.handle('master:plans:list', () => authClient.data('/plans'));
ipcMain.handle('master:plans:create', (_event, input) =>
  authClient.data('/plans', { method: 'POST', body: JSON.stringify(input) }),
);
ipcMain.handle('master:plans:update', (_event, id: string, input) =>
  authClient.data(`/plans/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }),
);
ipcMain.handle(
  'master:subscribers:list',
  (_event, query: { q: string; page: number; pageSize: number }) =>
    authClient.data(
      `/subscribers?${new URLSearchParams({ q: query.q, page: String(query.page), pageSize: String(query.pageSize) })}`,
    ),
);
ipcMain.handle('master:subscribers:get', (_event, id: string) =>
  authClient.data(`/subscribers/${id}`),
);
ipcMain.handle(
  'master:subscribers:activity',
  (_event, id: string, query: { page: number; pageSize: number }) =>
    authClient.data(
      `/subscribers/${id}/activity?${new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) })}`,
    ),
);
ipcMain.handle('master:subscribers:create', (_event, input) =>
  authClient.data('/subscribers', {
    method: 'POST',
    body: JSON.stringify(input),
  }),
);
ipcMain.handle(
  'master:subscribers:status',
  (_event, id: string, status: string, reason: string) =>
    authClient.data(`/subscribers/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reason }),
    }),
);
ipcMain.handle(
  'master:services:create',
  (_event, subscriberId: string, input) =>
    authClient.data(`/subscribers/${subscriberId}/service-accounts`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
);
ipcMain.handle('billing:cycles:list', () => authClient.data('/billing-cycles'));
ipcMain.handle(
  'billing:cycles:eligibility',
  (_event, periodYear: number, periodMonth: number) =>
    authClient.data(
      `/billing-cycles/eligibility?${new URLSearchParams({ periodYear: String(periodYear), periodMonth: String(periodMonth) })}`,
    ),
);
ipcMain.handle(
  'billing:cycles:generate',
  (_event, periodYear: number, periodMonth: number) =>
    authClient.data('/billing-cycles', {
      method: 'POST',
      body: JSON.stringify({ periodYear, periodMonth }),
    }),
);
ipcMain.handle('billing:cycles:finalize', (_event, id: string) =>
  authClient.data(`/billing-cycles/${id}/finalize`, { method: 'POST' }),
);
ipcMain.handle(
  'billing:invoices:list',
  (
    _event,
    query: {
      q: string;
      page: number;
      pageSize: number;
      subscriberId?: string;
      billingCycleId?: string;
    },
  ) => {
    const values: Record<string, string> = {
      q: query.q,
      page: String(query.page),
      pageSize: String(query.pageSize),
    };
    if (query.subscriberId) values.subscriberId = query.subscriberId;
    if (query.billingCycleId) values.billingCycleId = query.billingCycleId;
    return authClient.data(`/invoices?${new URLSearchParams(values)}`);
  },
);
ipcMain.handle('billing:invoices:get', (_event, id: string) =>
  authClient.data(`/invoices/${id}`),
);
ipcMain.handle(
  'billing:invoices:adjust',
  (_event, id: string, amountCentavos: number, reason: string) =>
    authClient.data(`/invoices/${id}/adjustments`, {
      method: 'POST',
      body: JSON.stringify({ amountCentavos, reason }),
    }),
);
ipcMain.handle('billing:invoices:void', (_event, id: string, reason: string) =>
  authClient.data(`/invoices/${id}/void`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  }),
);
ipcMain.handle(
  'billing:ledger',
  (_event, subscriberId: string, from?: string, to?: string) => {
    const values: Record<string, string> = {};
    if (from) values.from = from;
    if (to) values.to = to;
    return authClient.data(
      `/subscribers/${subscriberId}/ledger?${new URLSearchParams(values)}`,
    );
  },
);
ipcMain.handle(
  'payments:preview',
  (_event, subscriberId: string, amountCentavos: number) =>
    authClient.data(
      `/payments/preview?${new URLSearchParams({ subscriberId, amountCentavos: String(amountCentavos) })}`,
    ),
);
ipcMain.handle(
  'payments:list',
  (
    _event,
    query: {
      q: string;
      page: number;
      pageSize: number;
      status?: string;
      subscriberId?: string;
    },
  ) => {
    const values: Record<string, string> = {
      q: query.q,
      page: String(query.page),
      pageSize: String(query.pageSize),
    };
    if (query.status) values.status = query.status;
    if (query.subscriberId) values.subscriberId = query.subscriberId;
    return authClient.data(`/payments?${new URLSearchParams(values)}`);
  },
);
ipcMain.handle('payments:create', (_event, input) =>
  authClient.data('/payments', {
    method: 'POST',
    body: JSON.stringify(input),
  }),
);
ipcMain.handle('payments:gcash:submit', (_event, input) =>
  authClient.data('/gcash-submissions', {
    method: 'POST',
    body: JSON.stringify(input),
  }),
);
ipcMain.handle('payments:gcash:decide', (_event, id: string, input) =>
  authClient.data(`/payments/${id}/gcash-decision`, {
    method: 'POST',
    body: JSON.stringify(input),
  }),
);
ipcMain.handle('payments:reverse', (_event, id: string, reason: string) =>
  authClient.data(`/payments/${id}/reverse`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  }),
);
ipcMain.handle('payments:proof', (_event, id: string) =>
  authClient.data(`/payment-proofs/${id}`),
);
ipcMain.handle('collections:list', (_event, query: Record<string, unknown>) => {
  const values = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) values.set(key, String(value));
  return authClient.data(`/collection-batches?${values}`);
});
ipcMain.handle('collections:get', (_event, id: string) =>
  authClient.data(`/collection-batches/${id}`),
);
ipcMain.handle('collections:preview', (_event, input) =>
  authClient.data('/collection-batches/preview', {
    method: 'POST',
    body: JSON.stringify(input),
  }),
);
ipcMain.handle('collections:create', (_event, input) =>
  authClient.data('/collection-batches', {
    method: 'POST',
    body: JSON.stringify(input),
  }),
);
for (const action of ['start', 'submit', 'reconcile', 'close'] as const)
  ipcMain.handle(
    `collections:${action}`,
    (_event, id: string, input?: Record<string, unknown>) =>
      authClient.data(`/collection-batches/${id}/${action}`, {
        method: 'POST',
        ...(input ? { body: JSON.stringify(input) } : {}),
      }),
  );
ipcMain.handle(
  'collections:remit',
  (_event, id: string, amountCentavos: number, notes?: string) =>
    authClient.data(`/collection-batches/${id}/remittance`, {
      method: 'POST',
      body: JSON.stringify({ amountCentavos, notes }),
    }),
);
ipcMain.handle('receivables:summary', (_event, asOf: string) =>
  authClient.data(`/receivables/summary?${new URLSearchParams({ asOf })}`),
);
ipcMain.handle('receivables:list', (_event, query: Record<string, unknown>) => {
  const values = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== '') values.set(key, String(value));
  return authClient.data(`/receivables?${values}`);
});
ipcMain.handle('receivables:settings', () =>
  authClient.data('/receivable-settings'),
);
ipcMain.handle('receivables:settings:update', (_event, input) =>
  authClient.data('/receivable-settings', {
    method: 'PATCH',
    body: JSON.stringify(input),
  }),
);
ipcMain.handle('receivables:history', (_event, id: string) =>
  authClient.data(`/service-accounts/${id}/service-control`),
);
ipcMain.handle('receivables:suspend', (_event, id: string, input) =>
  authClient.data(`/service-accounts/${id}/suspensions`, {
    method: 'POST',
    body: JSON.stringify(input),
  }),
);
ipcMain.handle('receivables:reconnect', (_event, id: string, input) =>
  authClient.data(`/service-accounts/${id}/reconnections`, {
    method: 'POST',
    body: JSON.stringify(input),
  }),
);
ipcMain.handle('receivables:reconnect:complete', (_event, id: string, input) =>
  authClient.data(`/reconnections/${id}/complete`, {
    method: 'POST',
    body: JSON.stringify(input),
  }),
);
ipcMain.handle(
  'reports:dashboard',
  (_event, query: Record<string, unknown>) => {
    const values = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      values.set(key, String(value));
    return authClient.data(`/dashboard?${values}`);
  },
);
ipcMain.handle(
  'reports:preview',
  (_event, kind: string, query: Record<string, unknown>) => {
    const values = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (value !== undefined && value !== '') values.set(key, String(value));
    return authClient.data(`/reports/${kind}?${values}`);
  },
);
ipcMain.handle(
  'reports:export',
  async (
    event,
    kind: string,
    query: Record<string, unknown>,
    format: 'pdf' | 'xlsx',
  ) => {
    const values = new URLSearchParams({ format });
    for (const [key, value] of Object.entries(query))
      if (value !== undefined && value !== '') values.set(key, String(value));
    const exported = await authClient.data<ReportExportDto>(
      `/reports/${kind}/export?${values}`,
    );
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const options = {
      defaultPath: exported.filename,
      filters: [
        {
          name: format === 'pdf' ? 'PDF report' : 'Excel workbook',
          extensions: [format],
        },
      ],
    };
    const destination = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options);
    if (destination.canceled || !destination.filePath)
      return { saved: false, filename: null };
    await writeFile(
      destination.filePath,
      Buffer.from(exported.dataBase64, 'base64'),
    );
    return { saved: true, filename: exported.filename };
  },
);
ipcMain.handle('operations:readiness', () =>
  authClient.data('/operations/readiness'),
);
ipcMain.handle('operations:settings', () =>
  authClient.data('/application-settings'),
);
ipcMain.handle(
  'operations:settings:update',
  (_event, backupRetentionCount: number) =>
    authClient.data('/application-settings', {
      method: 'PATCH',
      body: JSON.stringify({ backupRetentionCount }),
    }),
);
ipcMain.handle(
  'operations:backups:list',
  (_event, page: number, pageSize: number) =>
    authClient.data(
      `/backups?${new URLSearchParams({ page: String(page), pageSize: String(pageSize) })}`,
    ),
);
ipcMain.handle('operations:backups:create', () =>
  authClient.data('/backups', { method: 'POST' }),
);
ipcMain.handle(
  'operations:backups:restore',
  (_event, id: string, confirmation: string) =>
    authClient.data(`/backups/${id}/restore`, {
      method: 'POST',
      body: JSON.stringify({ confirmation }),
    }),
);

function createWindow(): void {
  const window = new BrowserWindow({
    title: 'BCIS Billing and Collection',
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#F6F8FB',
    webPreferences: {
      ...secureWebPreferences,
      preload: join(__dirname, '../preload/index.cjs'),
    },
  });

  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
