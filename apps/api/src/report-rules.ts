import type { ReportQuery } from '@bcis/contracts';

export function dateBucket(
  value: string | Date,
  granularity: ReportQuery['granularity'],
) {
  const date = new Date(value);
  if (granularity === 'ANNUAL') return String(date.getUTCFullYear());
  const iso = date.toISOString().slice(0, 10);
  if (granularity === 'MONTHLY') return iso.slice(0, 7);
  if (granularity === 'DAILY') return iso;
  const monday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = monday.getUTCDay();
  monday.setUTCDate(monday.getUTCDate() - (day === 0 ? 6 : day - 1));
  return monday.toISOString().slice(0, 10);
}

export function sliceReportRows<T>(rows: T[], page: number, pageSize: number) {
  return {
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    total: rows.length,
  };
}

export function reportFilename(
  title: string,
  asOf: string,
  extension: 'pdf' | 'xlsx',
) {
  const stem = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${stem}-${asOf}.${extension}`;
}
