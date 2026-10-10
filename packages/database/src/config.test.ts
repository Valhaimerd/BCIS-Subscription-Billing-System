import { describe, expect, it } from 'vitest';

import { parseDatabaseEnvironment } from './config.js';

describe('parseDatabaseEnvironment', () => {
  it('requires a database URL', () => {
    expect(() => parseDatabaseEnvironment({})).toThrow('DATABASE_URL');
  });

  it('returns the configured database URL', () => {
    expect(
      parseDatabaseEnvironment({
        DATABASE_URL: 'postgresql://bcis:test@localhost:5432/bcis',
      }),
    ).toEqual({
      databaseUrl: 'postgresql://bcis:test@localhost:5432/bcis',
    });
  });
});
