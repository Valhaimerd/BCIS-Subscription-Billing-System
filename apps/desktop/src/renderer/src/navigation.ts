import type { PermissionCode } from '@bcis/contracts';

export type AppViewId =
  | 'Home'
  | 'Subscribers'
  | 'Plans'
  | 'Billing'
  | 'Payments'
  | 'Collections'
  | 'Receivables'
  | 'Services'
  | 'Reports'
  | 'Backup & recovery';

export type NavigationGroup = {
  label: string;
  items: Array<{ id: AppViewId; permission: PermissionCode | null }>;
};

const navigation: NavigationGroup[] = [
  { label: 'Home', items: [{ id: 'Home', permission: null }] },
  {
    label: 'Customers',
    items: [
      { id: 'Subscribers', permission: 'subscriber.view' },
      { id: 'Plans', permission: 'subscriber.view' },
    ],
  },
  {
    label: 'Revenue',
    items: [
      { id: 'Billing', permission: 'billing.view' },
      { id: 'Payments', permission: 'payment.view' },
    ],
  },
  {
    label: 'Field work',
    items: [
      { id: 'Collections', permission: 'collection.view' },
      { id: 'Receivables', permission: 'receivable.view' },
    ],
  },
  {
    label: 'Service',
    items: [{ id: 'Services', permission: 'service.view' }],
  },
  {
    label: 'Insights',
    items: [{ id: 'Reports', permission: 'report.view' }],
  },
  {
    label: 'System',
    items: [{ id: 'Backup & recovery', permission: 'backup.create' }],
  },
];

export function visibleNavigation(
  permissions: readonly PermissionCode[],
): NavigationGroup[] {
  return navigation
    .map((group) => ({
      ...group,
      items: group.items.filter(
        ({ permission }) => !permission || permissions.includes(permission),
      ),
    }))
    .filter(({ items }) => items.length > 0);
}
