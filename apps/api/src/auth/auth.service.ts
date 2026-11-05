import { randomUUID } from 'node:crypto';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { LoginInput, RegisterInput, ResetPasswordInput } from '@hireflow/shared';
import argon2 from 'argon2';
import { sql } from 'kysely';
import { AuditService } from '../common/audit.service.js';
import { DomainError, unauthenticated } from '../common/domain-error.js';
import { ConfigService } from '../config/config.service.js';
import { Database, type Executor, isUniqueViolation } from '../database/database.js';
import { MailQueue } from '../queue/mail-queue.js';
import {
  hashRefreshToken,
  randomToken,
  REFRESH_REUSE_GRACE_MS,
  REFRESH_TOKEN_TTL_MS,
  RESET_TOKEN_TTL_MS,
  sha256,
  VERIFY_TOKEN_TTL_MS,
} from './tokens.js';

const LOGIN_FAILURE_WINDOW = '15 minutes';

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; fullName: string; timezone: string };
}

@Injectable()
export class AuthService implements OnModuleInit {
  /** Verified when the email is unknown, so both login paths take the same time. */
  private decoyHash = '';

  constructor(
    private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailQueue,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.decoyHash = await argon2.hash(randomToken());
  }

  async register(input: RegisterInput) {
    const passwordHash = await argon2.hash(input.password);
    try {
      return await this.db.transaction().execute(async (tx) => {
        const user = await tx
          .insertInto('users')
          .values({
            email: input.email,
            passwordHash,
            fullName: input.fullName,
            timezone: input.timezone ?? 'UTC',
            emailVerifiedAt: null,
          })
          .returning(['id', 'email', 'fullName', 'timezone'])
          .executeTakeFirstOrThrow();
        await this.sendVerificationEmail(tx, user);
        return user;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'users_email_lower')) {
        throw new DomainError('CONFLICT', 'An account with this email already exists.', [
          { path: 'email', message: 'Already registered' },
        ]);
      }
      throw error;
    }
  }

  private async sendVerificationEmail(
    tx: Executor,
    user: { id: string; email: string; fullName: string },
  ) {
    const token = randomToken();
    await tx
      .insertInto('emailTokens')
      .values({
        userId: user.id,
        purpose: 'verify_email',
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
        usedAt: null,
      })
      .execute();
    await this.mail.enqueue(
      {
        template: 'verify-email',
        to: user.email,
        name: user.fullName,
        dedupeKey: `verify-email:${sha256(token)}`,
        link: `${this.config.env.APP_URL}/verify-email?token=${token}`,
      },
      tx,
    );
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<Session> {
    const user = await this.db
      .selectFrom('users')
      .select(['id', 'email', 'fullName', 'timezone', 'passwordHash', 'isActive'])
      .where((eb) => eb(eb.fn('lower', ['email']), '=', input.email))
      .executeTakeFirst();

    const valid = await argon2.verify(user?.passwordHash ?? this.decoyHash, input.password);
    if (!user || !valid || !user.isActive) {
      if (user) await this.recordLoginFailure(user.id, meta.ip);
      throw unauthenticated('Incorrect email or password.');
    }

    const { passwordHash: _, isActive: __, ...profile } = user;
    const refreshToken = await this.issueRefreshToken(this.db, user.id, randomUUID(), meta);
    return { accessToken: await this.signAccessToken(user.id), refreshToken, user: profile };
  }

  /** Failures are aggregated: one audit entry per account per window, not one per attempt. */
  private async recordLoginFailure(userId: string, ip: string | null) {
    const recent = await this.db
      .selectFrom('auditLogs')
      .select('id')
      .where('entityType', '=', 'user')
      .where('entityId', '=', userId)
      .where('action', '=', 'auth.login_failed')
      .where('createdAt', '>', sql<Date>`now() - ${LOGIN_FAILURE_WINDOW}::interval`)
      .limit(1)
      .executeTakeFirst();
    if (recent) return;
    await this.audit.record({
      actorId: userId,
      action: 'auth.login_failed',
      entityType: 'user',
      entityId: userId,
      ip,
    });
  }

  /**
   * Rotates the refresh token. Presenting one that was already rotated means it leaked
   * or was replayed, so the whole family is revoked and every holder must sign in again.
   *
   * The exception is a token rotated moments ago: a page reload can cancel the response
   * after the server has rotated, leaving the browser holding the old cookie. That token is
   * accepted once more and the unseen successor is dropped. If it really was a thief, the
   * real user's next refresh presents a dead token outside the window and trips detection.
   */
  async refresh(token: string, meta: RequestMeta): Promise<Session> {
    const tokenHash = this.hashRefresh(token);

    const outcome = await this.db.transaction().execute(async (tx) => {
      const current = await tx
        .selectFrom('refreshTokens')
        .selectAll()
        .where('tokenHash', '=', tokenHash)
        .forUpdate()
        .executeTakeFirst();
      if (!current) return { kind: 'invalid' as const };

      if (current.revokedAt) {
        const lostResponse = await this.isLostResponse(tx, current);
        await this.revokeWhere(tx, 'familyId', current.familyId);
        if (!lostResponse) {
          await this.audit.record(
            {
              actorId: current.userId,
              action: 'auth.refresh_reuse_detected',
              entityType: 'user',
              entityId: current.userId,
              ip: meta.ip,
            },
            tx,
          );
          return { kind: 'invalid' as const };
        }
      }
      if (current.expiresAt.getTime() <= Date.now()) return { kind: 'invalid' as const };

      const user = await tx
        .selectFrom('users')
        .select(['id', 'email', 'fullName', 'timezone', 'isActive'])
        .where('id', '=', current.userId)
        .executeTakeFirstOrThrow();
      if (!user.isActive) return { kind: 'invalid' as const };

      await tx
        .updateTable('refreshTokens')
        .set({ revokedAt: new Date() })
        .where('id', '=', current.id)
        // Keeps the original time on a replay, so repeat attempts cannot extend the window.
        .where('revokedAt', 'is', null)
        .execute();
      const refreshToken = await this.issueRefreshToken(tx, user.id, current.familyId, meta);
      const { isActive: _, ...profile } = user;
      return { kind: 'ok' as const, refreshToken, user: profile };
    });

    if (outcome.kind === 'invalid') throw unauthenticated('Your session has expired.');
    return {
      accessToken: await this.signAccessToken(outcome.user.id),
      refreshToken: outcome.refreshToken,
      user: outcome.user,
    };
  }

  /** True when this token was rotated (not signed out) within the grace window. */
  private async isLostResponse(
    tx: Executor,
    token: { familyId: string; revokedAt: Date | null },
  ): Promise<boolean> {
    if (!token.revokedAt) return false;
    if (Date.now() - token.revokedAt.getTime() >= REFRESH_REUSE_GRACE_MS) return false;
    // Logout revokes without a successor, so a live token in the family means rotation.
    const successor = await tx
      .selectFrom('refreshTokens')
      .select('id')
      .where('familyId', '=', token.familyId)
      .where('revokedAt', 'is', null)
      .limit(1)
      .executeTakeFirst();
    return Boolean(successor);
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.db
      .updateTable('refreshTokens')
      .set({ revokedAt: new Date() })
      .where('tokenHash', '=', this.hashRefresh(token))
      .where('revokedAt', 'is', null)
      .execute();
  }

  async logoutAll(userId: string): Promise<void> {
    await this.revokeWhere(this.db, 'userId', userId);
  }

  async verifyEmail(token: string): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      const userId = await this.consumeEmailToken(tx, token, 'verify_email');
      await tx
        .updateTable('users')
        .set({ emailVerifiedAt: new Date() })
        .where('id', '=', userId)
        .execute();
    });
  }

  async forgotPassword(email: string): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      const user = await tx
        .selectFrom('users')
        .select(['id', 'email', 'fullName'])
        .where((eb) => eb(eb.fn('lower', ['email']), '=', email))
        .where('isActive', '=', true)
        .executeTakeFirst();
      if (!user) return;

      await tx
        .updateTable('emailTokens')
        .set({ usedAt: new Date() })
        .where('userId', '=', user.id)
        .where('purpose', '=', 'reset_password')
        .where('usedAt', 'is', null)
        .execute();

      const token = randomToken();
      await tx
        .insertInto('emailTokens')
        .values({
          userId: user.id,
          purpose: 'reset_password',
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
          usedAt: null,
        })
        .execute();
      await this.mail.enqueue(
        {
          template: 'reset-password',
          to: user.email,
          name: user.fullName,
          dedupeKey: `reset-password:${sha256(token)}`,
          link: `${this.config.env.APP_URL}/reset-password?token=${token}`,
        },
        tx,
      );
    });
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const passwordHash = await argon2.hash(input.password);
    await this.db.transaction().execute(async (tx) => {
      const userId = await this.consumeEmailToken(tx, input.token, 'reset_password');
      await tx.updateTable('users').set({ passwordHash }).where('id', '=', userId).execute();
      await this.revokeWhere(tx, 'userId', userId);
    });
  }

  private async consumeEmailToken(
    tx: Executor,
    token: string,
    purpose: 'verify_email' | 'reset_password',
  ): Promise<string> {
    // The conditional update is atomic, so a token can only ever be used once.
    const row = await tx
      .updateTable('emailTokens')
      .set({ usedAt: new Date() })
      .where('tokenHash', '=', sha256(token))
      .where('purpose', '=', purpose)
      .where('usedAt', 'is', null)
      .where('expiresAt', '>', new Date())
      .returning('userId')
      .executeTakeFirst();
    if (!row) throw new DomainError('VALIDATION_ERROR', 'This link is invalid or has expired.');
    return row.userId;
  }

  private revokeWhere(executor: Executor, column: 'familyId' | 'userId', value: string) {
    return executor
      .updateTable('refreshTokens')
      .set({ revokedAt: new Date() })
      .where(column, '=', value)
      .where('revokedAt', 'is', null)
      .execute();
  }

  private async issueRefreshToken(
    executor: Executor,
    userId: string,
    familyId: string,
    meta: RequestMeta,
  ): Promise<string> {
    const token = randomToken();
    await executor
      .insertInto('refreshTokens')
      .values({
        userId,
        familyId,
        tokenHash: this.hashRefresh(token),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        revokedAt: null,
        userAgent: meta.userAgent,
      })
      .execute();
    return token;
  }

  private signAccessToken(userId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId });
  }

  private hashRefresh(token: string): string {
    return hashRefreshToken(token, this.config.env.JWT_REFRESH_SECRET);
  }
}
