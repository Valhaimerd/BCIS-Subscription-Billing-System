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
  items: Array<{
    id: AppViewId;
    label: string;
    permission: PermissionCode | null;
  }>;
};

const navigation: NavigationGroup[] = [
  { label: 'Today', items: [{ id: 'Home', label: 'Today', permission: null }] },
  {
    label: 'Customers',
    items: [
      {
        id: 'Subscribers',
        label: 'Subscribers',
        permission: 'subscriber.view',
      },
      { id: 'Services', label: 'Services', permission: 'service.view' },
      { id: 'Plans', label: 'Plans', permission: 'subscriber.view' },
    ],
  },
  {
    label: 'Money',
    items: [
      { id: 'Billing', label: 'Billing', permission: 'billing.view' },
      { id: 'Payments', label: 'Payments', permission: 'payment.view' },
    ],
  },
  {
    label: 'Field work',
    items: [
      {
        id: 'Collections',
        label: 'Collections',
        permission: 'collection.view',
      },
      {
        id: 'Receivables',
        label: 'Receivables',
        permission: 'receivable.view',
      },
    ],
  },
  {
    label: 'Insights',
    items: [{ id: 'Reports', label: 'Reports', permission: 'report.view' }],
  },
  {
    label: 'System',
    items: [
      {
        id: 'Backup & recovery',
        label: 'Backup & recovery',
        permission: 'backup.create',
      },
    ],
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
