import { describe, expect, it } from 'vitest';

import {
  billingPeriod,
  finalizedInvoiceStatus,
  invoiceTotal,
  isBillingEligible,
  withRunningBalances,
} from './billing-rules.js';

describe('billing rules', () => {
  it('clamps due day to the last date and labels the period', () => {
    expect(billingPeriod(2027, 2, 28)).toEqual({
      firstDate: '2027-02-01',
      lastDate: '2027-02-28',
      dueDate: '2027-02-28',
      label: 'February 2027',
    });
  });

  it('uses only active services started by period end', () => {
    expect(isBillingEligible('ACTIVE', '2026-09-30', '2026-09-30')).toBe(true);
    expect(isBillingEligible('ACTIVE', '2026-10-01', '2026-09-30')).toBe(false);
    expect(isBillingEligible('SUSPENDED', '2026-01-01', '2026-09-30')).toBe(
      false,
    );
  });

  it('keeps totals in exact integer centavos', () => {
    expect(invoiceTotal([99_900, 5_000, -2_500])).toBe(102_400);
    expect(() => invoiceTotal([100, -101])).toThrow();
  });

  it('uses only the two Task 4 finalization transitions', () => {
    expect(finalizedInvoiceStatus('2026-10-05', '2026-10-06')).toBe('OVERDUE');
    expect(finalizedInvoiceStatus('2026-10-06', '2026-10-06')).toBe('UNPAID');
    expect(finalizedInvoiceStatus('2026-10-15', '2026-10-06')).toBe('UNPAID');
  });

  it('calculates deterministic chronological debit and credit balances', () => {
    expect(
      withRunningBalances([
        { reference: 'INV-1', debitCentavos: 100_00, creditCentavos: 0 },
        { reference: 'ADJ-1', debitCentavos: 0, creditCentavos: 25_00 },
        { reference: 'ADJ-2', debitCentavos: 10_00, creditCentavos: 0 },
      ]),
    ).toEqual([
      {
        reference: 'INV-1',
        debitCentavos: 100_00,
        creditCentavos: 0,
        balanceCentavos: 100_00,
      },
      {
        reference: 'ADJ-1',
        debitCentavos: 0,
        creditCentavos: 25_00,
        balanceCentavos: 75_00,
      },
      {
        reference: 'ADJ-2',
        debitCentavos: 10_00,
        creditCentavos: 0,
        balanceCentavos: 85_00,
      },
    ]);
  });
});
