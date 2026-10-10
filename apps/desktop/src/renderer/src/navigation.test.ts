import { describe, expect, it } from 'vitest';

import { visibleNavigation } from './navigation';

const viewIds = (permissions: Parameters<typeof visibleNavigation>[0]) =>
  visibleNavigation(permissions).flatMap((group) =>
    group.items.map((item) => item.id),
  );

describe('visibleNavigation', () => {
  it('gives an Owner all available workspaces without a placeholder admin page', () => {
    const views = viewIds([
      'subscriber.view',
      'subscriber.manage',
      'billing.view',
      'payment.view',
      'collection.view',
      'receivable.view',
      'service.view',
      'report.view',
      'backup.create',
      'audit.view',
      'user.manage',
    ]);

    expect(views).toEqual([
      'Home',
      'Subscribers',
      'Plans',
      'Billing',
      'Payments',
      'Collections',
      'Receivables',
      'Services',
      'Reports',
      'Backup & recovery',
    ]);
  });

  it('shows Cashier customer, billing, and payment work only', () => {
    expect(
      viewIds([
        'subscriber.view',
        'billing.view',
        'payment.view',
        'payment.create',
        'payment.verify_gcash',
      ]),
    ).toEqual(['Home', 'Subscribers', 'Plans', 'Billing', 'Payments']);
  });

  it('gives Accounting / Auditor review pages without mutation destinations', () => {
    expect(
      viewIds([
        'billing.view',
        'payment.view',
        'collection.view',
        'receivable.view',
        'report.view',
        'report.export',
        'audit.view',
      ]),
    ).toEqual([
      'Home',
      'Billing',
      'Payments',
      'Collections',
      'Receivables',
      'Reports',
    ]);
  });

  it('shows technician customer and service work without financial pages', () => {
    expect(
      viewIds(['subscriber.view', 'service.view', 'service.manage']),
    ).toEqual(['Home', 'Subscribers', 'Plans', 'Services']);
  });

  it('keeps read-only viewer navigation based on view permissions', () => {
    expect(
      viewIds([
        'subscriber.view',
        'billing.view',
        'payment.view',
        'collection.view',
        'receivable.view',
        'service.view',
        'report.view',
      ]),
    ).toEqual([
      'Home',
      'Subscribers',
      'Plans',
      'Billing',
      'Payments',
      'Collections',
      'Receivables',
      'Services',
      'Reports',
    ]);
  });

  it('keeps Home available when no operational page is permitted', () => {
    expect(viewIds([])).toEqual(['Home']);
  });
});
