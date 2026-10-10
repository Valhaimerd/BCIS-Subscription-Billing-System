import type { PermissionCode, RoleCode, SafeUser } from '@bcis/contracts';
import argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

export interface AuthUserRecord {
  id: string;
  username: string;
  fullName: string;
  passwordHash: string;
  isActive: boolean;
  mustChangePassword: boolean;
  failedLoginCount: number;
  lockedUntil: Date | null;
}

export interface SessionRecord {
  id: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lockedAt: Date | null;
  user: AuthUserRecord;
  roles: RoleCode[];
  permissions: PermissionCode[];
}

export interface AuditEvent {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  reason?: string;
  newValues?: Record<string, unknown>;
}

export interface AuthRepository {
  findUserByUsername(username: string): Promise<AuthUserRecord | null>;
  updateFailedLogin(
    userId: string,
    failedLoginCount: number,
    lockedUntil: Date | null,
  ): Promise<void>;
  resetFailedLogin(userId: string): Promise<void>;
  createSession(session: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  revokeSession(sessionId: string): Promise<void>;
  lockSession(sessionId: string): Promise<void>;
  unlockSession(sessionId: string): Promise<void>;
  touchSession(sessionId: string): Promise<void>;
  appendAudit(event: AuditEvent): Promise<void>;
}

export interface AuthSettings {
  sessionTtlMinutes: number;
  maxFailedAttempts: number;
  lockoutMinutes: number;
}

export class AuthError extends Error {
  constructor(
    public readonly statusCode: 401 | 403 | 429,
    message: string,
  ) {
    super(message);
  }
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  });
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeUser(session: SessionRecord): SafeUser {
  return {
    id: session.user.id,
    username: session.user.username,
    fullName: session.user.fullName,
    roles: session.roles,
    permissions: session.permissions,
    mustChangePassword: session.user.mustChangePassword,
  };
}

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly settings: AuthSettings,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async login(username: string, password: string) {
    const normalizedUsername = username.trim().toLowerCase();
    const user = await this.repository.findUserByUsername(normalizedUsername);

    if (!user) {
      await hashPassword(password);
      await this.repository.appendAudit({
        actorUserId: null,
        action: 'AUTH_LOGIN_REJECTED',
        entityType: 'session',
        reason: 'invalid_credentials',
      });
      throw new AuthError(401, 'Invalid username or password.');
    }

    const now = this.now();
    if (!user.isActive) {
      await this.auditRejection(user.id, 'inactive_account');
      throw new AuthError(403, 'This account is inactive.');
    }
    if (user.lockedUntil && user.lockedUntil > now) {
      await this.auditRejection(user.id, 'login_throttled');
      throw new AuthError(429, 'Too many failed attempts. Try again later.');
    }

    if (!(await verifyPassword(user.passwordHash, password))) {
      const attempts = user.failedLoginCount + 1;
      const lockedUntil =
        attempts >= this.settings.maxFailedAttempts
          ? new Date(now.getTime() + this.settings.lockoutMinutes * 60_000)
          : null;
      await this.repository.updateFailedLogin(user.id, attempts, lockedUntil);
      await this.auditRejection(user.id, 'invalid_credentials');
      throw new AuthError(401, 'Invalid username or password.');
    }

    await this.repository.resetFailedLogin(user.id);
    const token = randomBytes(32).toString('base64url');
    const sessionId = randomUUID();
    const expiresAt = new Date(
      now.getTime() + this.settings.sessionTtlMinutes * 60_000,
    );
    await this.repository.createSession({
      id: sessionId,
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt,
    });
    await this.repository.appendAudit({
      actorUserId: user.id,
      action: 'AUTH_LOGIN_SUCCEEDED',
      entityType: 'session',
      entityId: sessionId,
    });

    const session = await this.requireSession(token, true);
    return { token, expiresAt, user: safeUser(session) };
  }

  async current(token: string, allowLocked = false) {
    const session = await this.requireSession(token, allowLocked);
    await this.repository.touchSession(session.id);
    return {
      expiresAt: session.expiresAt,
      locked: session.lockedAt !== null,
      user: safeUser(session),
    };
  }

  async logout(token: string): Promise<void> {
    const session = await this.requireSession(token, true);
    await this.repository.revokeSession(session.id);
    await this.repository.appendAudit({
      actorUserId: session.user.id,
      action: 'AUTH_LOGOUT',
      entityType: 'session',
      entityId: session.id,
    });
  }

  async lock(token: string): Promise<void> {
    const session = await this.requireSession(token);
    await this.repository.lockSession(session.id);
    await this.repository.appendAudit({
      actorUserId: session.user.id,
      action: 'AUTH_SESSION_LOCKED',
      entityType: 'session',
      entityId: session.id,
    });
  }

  async unlock(token: string, password: string): Promise<void> {
    const session = await this.requireSession(token, true);
    if (!session.lockedAt) return;
    if (!(await verifyPassword(session.user.passwordHash, password))) {
      await this.auditRejection(session.user.id, 'unlock_invalid_credentials');
      throw new AuthError(401, 'Invalid password.');
    }
    await this.repository.unlockSession(session.id);
    await this.repository.appendAudit({
      actorUserId: session.user.id,
      action: 'AUTH_SESSION_UNLOCKED',
      entityType: 'session',
      entityId: session.id,
    });
  }

  async requirePermission(token: string, permission: PermissionCode) {
    const session = await this.requireSession(token);
    if (!session.permissions.includes(permission)) {
      await this.repository.appendAudit({
        actorUserId: session.user.id,
        action: 'AUTHORIZATION_REJECTED',
        entityType: 'permission',
        entityId: permission,
      });
      throw new AuthError(403, 'You do not have permission for this action.');
    }
    return safeUser(session);
  }

  private async requireSession(token: string, allowLocked = false) {
    const session = await this.repository.findSessionByTokenHash(
      hashSessionToken(token),
    );
    if (!session || session.revokedAt) {
      throw new AuthError(401, 'Authentication is required.');
    }
    if (session.expiresAt <= this.now()) {
      await this.repository.revokeSession(session.id);
      throw new AuthError(401, 'The session has expired.');
    }
    if (session.lockedAt && !allowLocked) {
      throw new AuthError(403, 'The session is locked.');
    }
    if (!session.user.isActive) {
      throw new AuthError(403, 'This account is inactive.');
    }
    return session;
  }

  private async auditRejection(userId: string, reason: string) {
    await this.repository.appendAudit({
      actorUserId: userId,
      action: 'AUTH_LOGIN_REJECTED',
      entityType: 'session',
      reason,
    });
  }
}

export function readBearerToken(authorization: string | undefined): string {
  if (!authorization?.startsWith('Bearer ')) {
    throw new AuthError(401, 'Authentication is required.');
  }
  const token = authorization.slice('Bearer '.length).trim();
  if (!token) throw new AuthError(401, 'Authentication is required.');
  return token;
}
