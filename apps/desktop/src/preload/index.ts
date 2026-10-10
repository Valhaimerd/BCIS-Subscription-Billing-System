import { contextBridge, ipcRenderer } from 'electron';

import type { DesktopApi } from '../shared/desktop-api.js';

const desktopApi: DesktopApi = Object.freeze({
  platform: process.platform,
  version: process.versions.electron,
  auth: Object.freeze({
    current: () => ipcRenderer.invoke('auth:current'),
    login: (credentials: { username: string; password: string }) =>
      ipcRenderer.invoke('auth:login', credentials),
    logout: () => ipcRenderer.invoke('auth:logout'),
    lock: () => ipcRenderer.invoke('auth:lock'),
    unlock: (password: string) => ipcRenderer.invoke('auth:unlock', password),
  }),
  masterData: Object.freeze({
    references: () => ipcRenderer.invoke('master:references'),
    listPlans: () => ipcRenderer.invoke('master:plans:list'),
    createPlan: (input: Record<string, unknown>) =>
      ipcRenderer.invoke('master:plans:create', input),
    updatePlan: (id: string, input: Record<string, unknown>) =>
      ipcRenderer.invoke('master:plans:update', id, input),
    listSubscribers: (query: { q: string; page: number; pageSize: number }) =>
      ipcRenderer.invoke('master:subscribers:list', query),
    getSubscriber: (id: string) =>
      ipcRenderer.invoke('master:subscribers:get', id),
    activity: (id: string, query: { page: number; pageSize: number }) =>
      ipcRenderer.invoke('master:subscribers:activity', id, query),
    createSubscriber: (input: Record<string, unknown>) =>
      ipcRenderer.invoke('master:subscribers:create', input),
    changeSubscriberStatus: (id: string, status: string, reason: string) =>
      ipcRenderer.invoke('master:subscribers:status', id, status, reason),
    createServiceAccount: (
      subscriberId: string,
      input: Record<string, unknown>,
    ) => ipcRenderer.invoke('master:services:create', subscriberId, input),
  }),
  billing: Object.freeze({
    listCycles: () => ipcRenderer.invoke('billing:cycles:list'),
    generate: (periodYear: number, periodMonth: number) =>
      ipcRenderer.invoke('billing:cycles:generate', periodYear, periodMonth),
    finalize: (cycleId: string) =>
      ipcRenderer.invoke('billing:cycles:finalize', cycleId),
    listInvoices: (query: {
      q: string;
      page: number;
      pageSize: number;
      subscriberId?: string;
    }) => ipcRenderer.invoke('billing:invoices:list', query),
    getInvoice: (id: string) => ipcRenderer.invoke('billing:invoices:get', id),
    addAdjustment: (id: string, amountCentavos: number, reason: string) =>
      ipcRenderer.invoke('billing:invoices:adjust', id, amountCentavos, reason),
    voidInvoice: (id: string, reason: string) =>
      ipcRenderer.invoke('billing:invoices:void', id, reason),
    ledger: (subscriberId: string, from?: string, to?: string) =>
      ipcRenderer.invoke('billing:ledger', subscriberId, from, to),
  }),
  payments: Object.freeze({
    preview: (subscriberId: string, amountCentavos: number) =>
      ipcRenderer.invoke('payments:preview', subscriberId, amountCentavos),
    list: (query: Record<string, unknown>) =>
      ipcRenderer.invoke('payments:list', query),
    create: (input: Record<string, unknown>) =>
      ipcRenderer.invoke('payments:create', input),
    submitGcash: (input: Record<string, unknown>) =>
      ipcRenderer.invoke('payments:gcash:submit', input),
    decideGcash: (id: string, input: Record<string, unknown>) =>
      ipcRenderer.invoke('payments:gcash:decide', id, input),
    reverse: (id: string, reason: string) =>
      ipcRenderer.invoke('payments:reverse', id, reason),
    proof: (id: string) => ipcRenderer.invoke('payments:proof', id),
  }),
  collections: Object.freeze({
    list: (query: Record<string, unknown>) =>
      ipcRenderer.invoke('collections:list', query),
    get: (id: string) => ipcRenderer.invoke('collections:get', id),
    create: (input: Record<string, unknown>) =>
      ipcRenderer.invoke('collections:create', input),
    start: (id: string) => ipcRenderer.invoke('collections:start', id),
    submit: (id: string) => ipcRenderer.invoke('collections:submit', id),
    remit: (id: string, amountCentavos: number, notes?: string) =>
      ipcRenderer.invoke('collections:remit', id, amountCentavos, notes),
    reconcile: (id: string, differenceCentavos: number) =>
      ipcRenderer.invoke('collections:reconcile', id, {
        actorConfirmed: true,
        expectedDifferenceCentavos: differenceCentavos,
      }),
    close: (id: string, differenceCentavos: number) =>
      ipcRenderer.invoke('collections:close', id, {
        actorConfirmed: true,
        expectedDifferenceCentavos: differenceCentavos,
      }),
  }),
  receivables: Object.freeze({
    summary: (asOf: string) => ipcRenderer.invoke('receivables:summary', asOf),
    list: (query: Record<string, unknown>) =>
      ipcRenderer.invoke('receivables:list', query),
    settings: () => ipcRenderer.invoke('receivables:settings'),
    updateSettings: (input: Record<string, unknown>) =>
      ipcRenderer.invoke('receivables:settings:update', input),
    history: (serviceAccountId: string) =>
      ipcRenderer.invoke('receivables:history', serviceAccountId),
    suspend: (serviceAccountId: string, input: Record<string, unknown>) =>
      ipcRenderer.invoke('receivables:suspend', serviceAccountId, input),
    requestReconnection: (
      serviceAccountId: string,
      input: Record<string, unknown>,
    ) => ipcRenderer.invoke('receivables:reconnect', serviceAccountId, input),
    completeReconnection: (id: string, input: Record<string, unknown>) =>
      ipcRenderer.invoke('receivables:reconnect:complete', id, input),
  }),
  reports: Object.freeze({
    dashboard: (query: Record<string, unknown>) =>
      ipcRenderer.invoke('reports:dashboard', query),
    preview: (kind: string, query: Record<string, unknown>) =>
      ipcRenderer.invoke('reports:preview', kind, query),
    export: (
      kind: string,
      query: Record<string, unknown>,
      format: 'pdf' | 'xlsx',
    ) => ipcRenderer.invoke('reports:export', kind, query, format),
  }),
  operations: Object.freeze({
    readiness: () => ipcRenderer.invoke('operations:readiness'),
    settings: () => ipcRenderer.invoke('operations:settings'),
    updateSettings: (backupRetentionCount: number) =>
      ipcRenderer.invoke('operations:settings:update', backupRetentionCount),
    listBackups: (page: number, pageSize: number) =>
      ipcRenderer.invoke('operations:backups:list', page, pageSize),
    createBackup: () => ipcRenderer.invoke('operations:backups:create'),
    restoreBackup: (id: string, confirmation: string) =>
      ipcRenderer.invoke('operations:backups:restore', id, confirmation),
  }),
});

contextBridge.exposeInMainWorld('bcis', desktopApi);

export type { DesktopApi } from '../shared/desktop-api.js';
