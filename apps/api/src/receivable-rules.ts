export type AgingBucket = 'CURRENT' | '1_30' | '31_60' | '61_90' | '90_PLUS';

export function daysPastDue(dueDate: string, asOfDate: string) {
  return Math.max(
    0,
    Math.floor(
      (Date.parse(`${asOfDate}T00:00:00.000Z`) -
        Date.parse(`${dueDate}T00:00:00.000Z`)) /
        86_400_000,
    ),
  );
}

export function agingBucket(dueDate: string, asOfDate: string): AgingBucket {
  const days = daysPastDue(dueDate, asOfDate);
  if (days === 0) return 'CURRENT';
  if (days <= 30) return '1_30';
  if (days <= 60) return '31_60';
  if (days <= 90) return '61_90';
  return '90_PLUS';
}

export function agingTotals(
  invoices: Array<{ dueDate: string; balanceCentavos: number }>,
  asOfDate: string,
): Record<AgingBucket, number> {
  const totals: Record<AgingBucket, number> = {
    CURRENT: 0,
    '1_30': 0,
    '31_60': 0,
    '61_90': 0,
    '90_PLUS': 0,
  };
  for (const invoice of invoices) {
    totals[agingBucket(invoice.dueDate, asOfDate)] += invoice.balanceCentavos;
  }
  return totals;
}

export function applySubscriberCredit<
  T extends { dueDate: string; balanceCentavos: number },
>(invoices: T[], creditCentavos: number): T[] {
  let remaining = Math.max(0, creditCentavos);
  return [...invoices]
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate))
    .map((invoice) => {
      const applied = Math.min(remaining, invoice.balanceCentavos);
      remaining -= applied;
      return {
        ...invoice,
        balanceCentavos: invoice.balanceCentavos - applied,
      };
    });
}

export function isSuspensionCandidate(
  oldestDueDate: string,
  asOfDate: string,
  settings: { gracePeriodDays: number; suspensionThresholdDays: number },
) {
  const days = daysPastDue(oldestDueDate, asOfDate);
  return (
    days > settings.gracePeriodDays && days >= settings.suspensionThresholdDays
  );
}

export function canSuspend(status: string, candidate: boolean) {
  return status === 'ACTIVE' && candidate;
}

export function canRequestReconnection(
  status: string,
  overdueCentavos: number,
) {
  return status === 'SUSPENDED' && overdueCentavos === 0;
}

export function orderReceivablesForFollowUp<
  T extends {
    followUp: boolean;
    oldestDueDate: string;
    totalArrearsCentavos: number;
    subscriberAccountNumber: string;
  },
>(rows: T[]): T[] {
  return [...rows].sort(
    (left, right) =>
      Number(right.followUp) - Number(left.followUp) ||
      left.oldestDueDate.localeCompare(right.oldestDueDate) ||
      right.totalArrearsCentavos - left.totalArrearsCentavos ||
      left.subscriberAccountNumber.localeCompare(right.subscriberAccountNumber),
  );
}
