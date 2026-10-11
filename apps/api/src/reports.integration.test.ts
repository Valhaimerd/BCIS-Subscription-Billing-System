import {
  createDatabaseConnection,
  type DatabaseConnection,
} from '@bcis/database';
import { config as loadEnvironment } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolve } from 'node:path';

import { ReceivableService } from './receivables.js';
import { ReportService } from './reports.js';

loadEnvironment({
  path: resolve(import.meta.dirname, '../../../.env'),
  quiet: true,
});

describe.skipIf(process.env.BCIS_REPORT_DB_INTEGRATION !== '1')(
  'correction report database integration',
  () => {
    let database: DatabaseConnection;
    let reports: ReportService;

    beforeAll(() => {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) throw new Error('DATABASE_URL is required.');
      database = createDatabaseConnection(databaseUrl);
      reports = new ReportService(
        database.db,
        new ReceivableService(database.db),
      );
    });

    afterAll(async () => {
      await database?.close();
    });

    it('returns dated corrections with source, actor, and reason fields', async () => {
      const report = await reports.report('ADJUSTMENTS_REVERSALS_VOIDS', {
        from: '2000-01-01',
        to: '2999-12-31',
        asOf: '2999-12-31',
        granularity: 'MONTHLY',
        dimension: 'PLAN',
        q: '',
        page: 1,
        pageSize: 100,
      });

      expect(report.columns.map(({ key }) => key)).toEqual(
        expect.arrayContaining(['date', 'actor', 'reason']),
      );
      expect(report.total).toBeGreaterThan(0);
      expect(report.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            date: expect.any(String),
            sourceType: expect.any(String),
            sourceId: expect.any(String),
            actor: expect.any(String),
            reason: expect.any(String),
          }),
        ]),
      );
    });
  },
);
