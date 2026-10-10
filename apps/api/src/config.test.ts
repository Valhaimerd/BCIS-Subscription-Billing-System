import { describe, expect, it } from 'vitest';

import { parseApiEnvironment } from './config.js';

describe('parseApiEnvironment', () => {
  it('applies safe local defaults', () => {
    expect(
      parseApiEnvironment({ DATABASE_URL: 'postgresql://localhost/bcis' }),
    ).toMatchObject({
      NODE_ENV: 'development',
      API_HOST: '127.0.0.1',
      API_PORT: 3100,
      LOG_LEVEL: 'info',
    });
  });

  it('rejects a missing database URL', () => {
    expect(() => parseApiEnvironment({})).toThrow('DATABASE_URL');
  });
});
