export function billingPeriod(year: number, month: number, dueDay: number) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const paddedMonth = String(month).padStart(2, '0');
  return {
    firstDate: `${year}-${paddedMonth}-01`,
    lastDate: `${year}-${paddedMonth}-${String(lastDay).padStart(2, '0')}`,
    dueDate: `${year}-${paddedMonth}-${String(Math.min(dueDay, lastDay)).padStart(2, '0')}`,
    label: new Intl.DateTimeFormat('en-PH', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, 1))),
  };
}

export function invoiceTotal(amounts: number[]) {
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  if (!Number.isSafeInteger(total) || total < 0)
    throw new Error('Invoice total must be a non-negative safe integer.');
  return total;
}

export function isBillingEligible(
  status: string,
  billingStartDate: string,
  periodLastDate: string,
) {
  return status === 'ACTIVE' && billingStartDate <= periodLastDate;
}

export function finalizedInvoiceStatus(dueDate: string, asOfDate: string) {
  return dueDate < asOfDate ? ('OVERDUE' as const) : ('UNPAID' as const);
}

export function withRunningBalances<
  T extends { debitCentavos: number; creditCentavos: number },
>(entries: T[]) {
  let balanceCentavos = 0;
  return entries.map((entry) => {
    balanceCentavos += entry.debitCentavos - entry.creditCentavos;
    return { ...entry, balanceCentavos };
  });
}
