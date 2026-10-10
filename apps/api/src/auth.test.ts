import type { PermissionCode, RoleCode } from '@bcis/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AuthError,
  AuthService,
  hashPassword,
  hashSessionToken,
  type AuditEvent,
  type AuthRepository,
  type AuthUserRecord,
  type SessionRecord,
} from './auth.js';

class MemoryAuthRepository implements AuthRepository {
  user: AuthUserRecord | null = null;
  sessions = new Map<string, SessionRecord>();
  audits: AuditEvent[] = [];

  async findUserByUsername(username: string) {
    return this.user?.username === username ? this.user : null;
  }

  async updateFailedLogin(
    _userId: string,
    failedLoginCount: number,
    lockedUntil: Date | null,
  ) {
    if (this.user) Object.assign(this.user, { failedLoginCount, lockedUntil });
  }

  async resetFailedLogin() {
    if (this.user)
      Object.assign(this.user, { failedLoginCount: 0, lockedUntil: null });
  }

  async createSession(input: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    if (!this.user) throw new Error('Missing fake user');
    this.sessions.set(input.tokenHash, {
      id: input.id,
      expiresAt: input.expiresAt,
      revokedAt: null,
      lockedAt: null,
      user: this.user,
      roles: ['OWNER'],
      permissions: ['user.manage'],
    });
  }

  async findSessionByTokenHash(tokenHash: string) {
    return this.sessions.get(tokenHash) ?? null;
  }

  async revokeSession(sessionId: string) {
    const session = this.byId(sessionId);
    session.revokedAt = new Date();
  }

  async lockSession(sessionId: string) {
    this.byId(sessionId).lockedAt = new Date();
  }

  async unlockSession(sessionId: string) {
    this.byId(sessionId).lockedAt = null;
  }

  async touchSession() {}

  async appendAudit(event: AuditEvent) {
    this.audits.push(event);
  }

  seedSession(
    token: string,
    role: RoleCode,
    permissions: PermissionCode[],
    expiresAt = new Date('2026-10-02T00:00:00.000Z'),
  ) {
    if (!this.user) throw new Error('Missing fake user');
    this.sessions.set(hashSessionToken(token), {
      id: `session-${role}`,
      expiresAt,
      revokedAt: null,
      lockedAt: null,
      user: this.user,
      roles: [role],
      permissions,
    });
  }

  private byId(id: string) {
    const session = [...this.sessions.values()].find((item) => item.id === id);
    if (!session) throw new Error('Missing fake session');
    return session;
  }
}

const now = new Date('2026-10-01T00:00:00.000Z');
let repository: MemoryAuthRepository;
let service: AuthService;

beforeEach(async () => {
  repository = new MemoryAuthRepository();
  repository.user = {
    id: '00000000-0000-4000-8000-000000000001',
    username: 'owner',
    fullName: 'Development Owner',
    passwordHash: await hashPassword('correct horse battery staple'),
    isActive: true,
    mustChangePassword: true,
    failedLoginCount: 0,
    lockedUntil: null,
  };
  service = new AuthService(
    repository,
    { sessionTtlMinutes: 60, maxFailedAttempts: 3, lockoutMinutes: 15 },
    () => now,
  );
});

describe('authentication service', () => {
  it('creates a session while persisting only the token hash', async () => {
    const result = await service.login(
      ' OWNER ',
      'correct horse battery staple',
    );

    expect(result.user).not.toHaveProperty('passwordHash');
    expect(repository.sessions.has(result.token)).toBe(false);
    expect(repository.sessions.has(hashSessionToken(result.token))).toBe(true);
    expect(JSON.stringify(repository.audits)).not.toContain(result.token);
    expect(JSON.stringify(repository.audits)).not.toContain('battery');
  });

  it('rejects bad credentials and throttles repeated attempts', async () => {
    await expect(
      service.login('owner', 'wrong-password'),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
    await expect(
      service.login('owner', 'wrong-password'),
    ).rejects.toBeInstanceOf(AuthError);
    await expect(
      service.login('owner', 'wrong-password'),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
    await expect(
      service.login('owner', 'wrong-password'),
    ).rejects.toMatchObject({
      statusCode: 429,
    });
  });

  it('rejects inactive accounts', async () => {
    if (repository.user) repository.user.isActive = false;
    await expect(
      service.login('owner', 'correct horse battery staple'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects expired and logged-out sessions', async () => {
    repository.seedSession('expired', 'OWNER', ['user.manage'], new Date(0));
    await expect(service.current('expired')).rejects.toMatchObject({
      statusCode: 401,
    });

    const login = await service.login('owner', 'correct horse battery staple');
    await service.logout(login.token);
    await expect(service.current(login.token)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('locks and unlocks a session only with the account password', async () => {
    const login = await service.login('owner', 'correct horse battery staple');
    await service.lock(login.token);
    await expect(service.current(login.token)).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(
      service.unlock(login.token, 'wrong-password'),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
    await service.unlock(login.token, 'correct horse battery staple');
    await expect(service.current(login.token)).resolves.toMatchObject({
      locked: false,
    });
  });
});

describe.each<[RoleCode, PermissionCode[], boolean]>([
  ['OWNER', ['user.manage'], true],
  ['ADMINISTRATOR', ['user.manage'], true],
  ['CASHIER', ['payment.create'], false],
  ['COLLECTION_SUPERVISOR', ['collection.reconcile'], false],
  ['ACCOUNTING_AUDITOR', ['audit.view'], false],
  ['TECHNICIAN', ['service.manage'], false],
  ['READ_ONLY_VIEWER', ['report.view'], false],
])('%s API boundary', (role, permissions, allowed) => {
  it(`${allowed ? 'allows' : 'rejects'} direct user administration calls`, async () => {
    repository.seedSession(role, role, permissions);
    const operation = service.requirePermission(role, 'user.manage');
    if (allowed)
      await expect(operation).resolves.toMatchObject({ roles: [role] });
    else await expect(operation).rejects.toMatchObject({ statusCode: 403 });
  });
});
