import type { PermissionCode, RoleCode } from '@bcis/contracts';
import {
  auditLogs,
  permissions,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
  type DatabaseConnection,
} from '@bcis/database';
import { eq, inArray } from 'drizzle-orm';

import type {
  AuditEvent,
  AuthRepository,
  AuthUserRecord,
  SessionRecord,
} from './auth.js';

type Database = DatabaseConnection['db'];

function toUser(row: typeof users.$inferSelect): AuthUserRecord {
  return {
    id: row.id,
    username: row.username,
    fullName: row.fullName,
    passwordHash: row.passwordHash,
    isActive: row.isActive,
    mustChangePassword: row.mustChangePassword,
    failedLoginCount: row.failedLoginCount,
    lockedUntil: row.lockedUntil,
  };
}

export class PostgresAuthRepository implements AuthRepository {
  constructor(private readonly db: Database) {}

  async findUserByUsername(username: string) {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    return row ? toUser(row) : null;
  }

  async updateFailedLogin(
    userId: string,
    failedLoginCount: number,
    lockedUntil: Date | null,
  ) {
    await this.db
      .update(users)
      .set({ failedLoginCount, lockedUntil, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async resetFailedLogin(userId: string) {
    await this.db
      .update(users)
      .set({ failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async createSession(session: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    await this.db.insert(sessions).values(session);
  }

  async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<SessionRecord | null> {
    const [row] = await this.db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1);
    if (!row) return null;

    const roleRows = await this.db
      .select({ id: roles.id, code: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, row.user.id));
    const roleIds = roleRows.map(({ id }) => id);
    const permissionRows = roleIds.length
      ? await this.db
          .selectDistinct({ code: permissions.code })
          .from(rolePermissions)
          .innerJoin(
            permissions,
            eq(rolePermissions.permissionId, permissions.id),
          )
          .where(inArray(rolePermissions.roleId, roleIds))
      : [];

    return {
      id: row.session.id,
      expiresAt: row.session.expiresAt,
      revokedAt: row.session.revokedAt,
      lockedAt: row.session.lockedAt,
      user: toUser(row.user),
      roles: roleRows.map(({ code }) => code as RoleCode),
      permissions: permissionRows.map(({ code }) => code as PermissionCode),
    };
  }

  async revokeSession(sessionId: string) {
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, sessionId));
  }

  async lockSession(sessionId: string) {
    await this.db
      .update(sessions)
      .set({ lockedAt: new Date() })
      .where(eq(sessions.id, sessionId));
  }

  async unlockSession(sessionId: string) {
    await this.db
      .update(sessions)
      .set({ lockedAt: null, lastSeenAt: new Date() })
      .where(eq(sessions.id, sessionId));
  }

  async touchSession(sessionId: string) {
    await this.db
      .update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessions.id, sessionId));
  }

  async appendAudit(event: AuditEvent) {
    await this.db.insert(auditLogs).values({
      actorUserId: event.actorUserId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      reason: event.reason,
      newValues: event.newValues,
    });
  }
}
