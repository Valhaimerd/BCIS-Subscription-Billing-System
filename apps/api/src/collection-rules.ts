import type { CollectionBatchTotalsDto } from '@bcis/contracts';

export const collectionTransitions = {
  OPEN: 'IN_PROGRESS',
  IN_PROGRESS: 'SUBMITTED',
  SUBMITTED: 'REMITTED',
  REMITTED: 'RECONCILED',
  RECONCILED: 'CLOSED',
} as const;

export function canTransition(from: string, to: string) {
  return (
    collectionTransitions[from as keyof typeof collectionTransitions] === to
  );
}

export function canMutateCollectionPayment(status: string) {
  return status === 'IN_PROGRESS';
}

export function collectionTotals(
  expectedReceivableCentavos: number,
  cashCollectedCentavos: number,
  nonCashCollectedCentavos: number,
  remittedCashCentavos: number,
  coveredReceivableCentavos: number,
): CollectionBatchTotalsDto {
  return {
    expectedReceivableCentavos,
    cashCollectedCentavos,
    nonCashCollectedCentavos,
    uncollectedCentavos: Math.max(
      0,
      expectedReceivableCentavos - coveredReceivableCentavos,
    ),
    remittedCashCentavos,
    differenceCentavos: remittedCashCentavos - cashCollectedCentavos,
  };
}
