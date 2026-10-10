import { describe, expect, it } from 'vitest';

import { allocateOldest } from './payment-rules.js';

const invoices = [
  { id: 'august', balanceCentavos: 99_900 },
  { id: 'september', balanceCentavos: 99_900 },
];

describe('oldest-first payment allocation', () => {
  it('handles exact and partial payment in integer centavos', () => {
    expect(allocateOldest(invoices.slice(0, 1), 99_900)).toMatchObject({
      allocations: [{ amountCentavos: 99_900 }],
      creditCentavos: 0,
    });
    expect(allocateOldest(invoices.slice(0, 1), 50_000)).toMatchObject({
      allocations: [{ amountCentavos: 50_000 }],
      creditCentavos: 0,
    });
  });

  it('pays oldest arrears first and preserves advance credit', () => {
    expect(allocateOldest(invoices, 120_000)).toEqual({
      allocations: [
        { invoice: invoices[0], amountCentavos: 99_900 },
        { invoice: invoices[1], amountCentavos: 20_100 },
      ],
      creditCentavos: 0,
    });
    expect(allocateOldest(invoices.slice(0, 1), 300_000)).toMatchObject({
      allocations: [{ amountCentavos: 99_900 }],
      creditCentavos: 200_100,
    });
  });
});
