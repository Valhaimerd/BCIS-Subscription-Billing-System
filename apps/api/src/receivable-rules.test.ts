import { describe, expect, it } from 'vitest';

import {
  agingBucket,
  agingTotals,
  applySubscriberCredit,
  canRequestReconnection,
  canSuspend,
  isSuspensionCandidate,
  orderReceivablesForFollowUp,
} from './receivable-rules.js';

describe('receivable aging rules', () => {
  it.each([
    ['2026-10-31', 'CURRENT'],
    ['2026-10-30', '1_30'],
    ['2026-10-01', '1_30'],
    ['2026-09-30', '31_60'],
    ['2026-09-01', '31_60'],
    ['2026-08-31', '61_90'],
    ['2026-08-02', '61_90'],
    ['2026-08-01', '90_PLUS'],
  ] as const)(
    'places due date %s in %s at the inclusive boundary',
    (dueDate, expected) => {
      expect(agingBucket(dueDate, '2026-10-31')).toBe(expected);
    },
  );

  it('applies subscriber credit to the oldest outstanding invoices first', () => {
    expect(
      applySubscriberCredit(
        [
          { id: 'old', dueDate: '2026-08-15', balanceCentavos: 10_000 },
          { id: 'new', dueDate: '2026-09-15', balanceCentavos: 10_000 },
        ],
        15_000,
      ),
    ).toEqual([
      { id: 'old', dueDate: '2026-08-15', balanceCentavos: 0 },
      { id: 'new', dueDate: '2026-09-15', balanceCentavos: 5_000 },
    ]);
  });

  it('orders eligible follow-up accounts first, then oldest due date and arrears', () => {
    const rows = [
      {
        id: 'newer-follow-up',
        followUp: true,
        oldestDueDate: '2026-09-20',
        totalArrearsCentavos: 50_000,
        subscriberAccountNumber: 'SUB-0001',
      },
      {
        id: 'current',
        followUp: false,
        oldestDueDate: '2026-10-10',
        totalArrearsCentavos: 0,
        subscriberAccountNumber: 'SUB-0000',
      },
      {
        id: 'oldest-follow-up',
        followUp: true,
        oldestDueDate: '2026-08-20',
        totalArrearsCentavos: 20_000,
        subscriberAccountNumber: 'SUB-0003',
      },
      {
        id: 'same-date-higher-arrears',
        followUp: true,
        oldestDueDate: '2026-08-20',
        totalArrearsCentavos: 30_000,
        subscriberAccountNumber: 'SUB-0002',
      },
    ];

    expect(orderReceivablesForFollowUp(rows).map((row) => row.id)).toEqual([
      'same-date-higher-arrears',
      'oldest-follow-up',
      'newer-follow-up',
      'current',
    ]);
  });

  it('totals each outstanding invoice in its own aging bucket', () => {
    expect(
      agingTotals(
        [
          { dueDate: '2026-10-31', balanceCentavos: 1_000 },
          { dueDate: '2026-10-15', balanceCentavos: 2_000 },
          { dueDate: '2026-09-15', balanceCentavos: 3_000 },
          { dueDate: '2026-08-15', balanceCentavos: 4_000 },
          { dueDate: '2026-07-15', balanceCentavos: 5_000 },
        ],
        '2026-10-31',
      ),
    ).toEqual({
      CURRENT: 1_000,
      '1_30': 2_000,
      '31_60': 3_000,
      '61_90': 4_000,
      '90_PLUS': 5_000,
    });
  });

  it('requires the configured overdue threshold after the grace period', () => {
    const settings = { gracePeriodDays: 7, suspensionThresholdDays: 60 };
    expect(isSuspensionCandidate('2026-09-01', '2026-10-31', settings)).toBe(
      true,
    );
    expect(isSuspensionCandidate('2026-09-02', '2026-10-31', settings)).toBe(
      false,
    );
  });

  it('allows only valid service-control transitions', () => {
    expect(canSuspend('ACTIVE', true)).toBe(true);
    expect(canSuspend('SUSPENDED', true)).toBe(false);
    expect(canSuspend('ACTIVE', false)).toBe(false);
    expect(canRequestReconnection('SUSPENDED', 0)).toBe(true);
    expect(canRequestReconnection('SUSPENDED', 1)).toBe(false);
    expect(canRequestReconnection('ACTIVE', 0)).toBe(false);
  });
});
