import { afterEach, describe, expect, it, vi } from 'vitest';

import { DesktopAuthClient } from './auth-client';

const user = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'owner',
  fullName: 'Development Owner',
  roles: ['OWNER'],
  permissions: ['user.manage'],
  mustChangePassword: true,
};

afterEach(() => vi.unstubAllGlobals());

describe('desktop authentication boundary', () => {
  it('keeps the opaque token in the main-process client', async () => {
    const requests: RequestInit[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        requests.push(init);
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Signed in.',
            data: {
              accessToken: 'opaque-secret-token',
              tokenType: 'Bearer',
              expiresAt: '2026-10-02T00:00:00.000Z',
              user,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }),
    );
    const client = new DesktopAuthClient('http://127.0.0.1:3100/api/v1');

    const session = await client.login({
      username: 'owner',
      password: 'not-logged',
    });
    expect(session).not.toHaveProperty('accessToken');
    expect(JSON.stringify(client.current())).not.toContain(
      'opaque-secret-token',
    );

    await client.lock();
    const lockHeaders = new Headers(requests[1]?.headers);
    const authorization = lockHeaders.get('authorization');
    expect(authorization).toBe('Bearer opaque-secret-token');
    expect(lockHeaders.get('content-type')).toBeNull();
  });
});
