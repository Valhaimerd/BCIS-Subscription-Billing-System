import { describe, expect, it } from 'vitest';

import {
  canMutateCollectionPayment,
  canTransition,
  collectionTotals,
} from './collection-rules.js';

describe('collection batch rules', () => {
  it('allows only the documented forward state sequence', () => {
    expect(canTransition('OPEN', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'REMITTED')).toBe(false);
    expect(canTransition('CLOSED', 'OPEN')).toBe(false);
  });

  it('keeps shortage and overage visible in integer centavos', () => {
    expect(
      collectionTotals(2_500_000, 2_000_000, 100_000, 1_950_000, 2_100_000),
    ).toEqual({
      expectedReceivableCentavos: 2_500_000,
      cashCollectedCentavos: 2_000_000,
      nonCashCollectedCentavos: 100_000,
      uncollectedCentavos: 400_000,
      remittedCashCentavos: 1_950_000,
      differenceCentavos: -50_000,
    });
  });

  it('caps collected coverage per route account when one account overpays', () => {
    expect(collectionTotals(20_000, 20_000, 0, 20_000, 10_000)).toMatchObject({
      cashCollectedCentavos: 20_000,
      uncollectedCentavos: 10_000,
    });
  });

  it('allows linked-payment changes only while collection is in progress', () => {
    expect(canMutateCollectionPayment('IN_PROGRESS')).toBe(true);
    expect(canMutateCollectionPayment('SUBMITTED')).toBe(false);
    expect(canMutateCollectionPayment('CLOSED')).toBe(false);
  });
});
