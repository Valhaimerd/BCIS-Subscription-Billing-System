import { describe, expect, it } from 'vitest';

import { dateBucket, reportFilename, sliceReportRows } from './report-rules.js';

describe('report rules', () => {
  it.each([
    ['DAILY', '2026-10-05T00:00:00.000Z', '2026-10-05'],
    ['WEEKLY', '2026-10-04T23:59:59.999Z', '2026-09-28'],
    ['WEEKLY', '2026-10-05T00:00:00.000Z', '2026-10-05'],
    ['MONTHLY', '2026-10-05T00:00:00.000Z', '2026-10'],
    ['ANNUAL', '2026-10-05T00:00:00.000Z', '2026'],
  ] as const)(
    'groups %s timestamps at UTC boundaries',
    (unit, value, expected) => {
      expect(dateBucket(value, unit)).toBe(expected);
    },
  );

  it('paginates screen rows without changing the full export dataset', () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({ index }));
    expect(sliceReportRows(rows, 2, 10)).toEqual({
      rows: rows.slice(10, 20),
      total: 25,
    });
  });

  it('creates a stable safe report filename', () => {
    expect(reportFilename('AR Aging / Summary', '2026-10-31', 'pdf')).toBe(
      'ar-aging-summary-2026-10-31.pdf',
    );
  });
});
