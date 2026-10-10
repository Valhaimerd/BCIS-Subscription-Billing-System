export function allocateOldest<
  T extends { id: string; balanceCentavos: number },
>(invoices: T[], amountCentavos: number) {
  let remaining = amountCentavos;
  const allocations = invoices.map((invoice) => {
    const amountCentavos = Math.min(invoice.balanceCentavos, remaining);
    remaining -= amountCentavos;
    return { invoice, amountCentavos };
  });
  return { allocations, creditCentavos: remaining };
}
