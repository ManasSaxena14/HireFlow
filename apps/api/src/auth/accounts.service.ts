import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DomainError, unauthenticated } from '../common/domain-error.js';
import { Database, isUniqueViolation } from '../database/database.js';
import type { AuthClaims } from './auth-tokens.js';

interface Known {
  id: string;
  email: string;
  emailVerified: boolean;
  until: number;
}

/** How long a known account is trusted before the database is asked again. */
const KNOWN_FOR_MS = 60_000;
const MAX_KNOWN = 5000;

/**
 * Turns a Neon Auth user into a HireFlow account. The account is made on the first request,
 * and its email and confirmed state follow Neon Auth after that.
 */
@Injectable()
export class Accounts {
  private readonly known = new Map<string, Known>();

  constructor(private readonly db: Database) {}

  /** The HireFlow user id for this Neon Auth user. */
  async idFor(claims: AuthClaims): Promise<string> {
    const cached = this.known.get(claims.sub);
    if (
      cached &&
      cached.until > Date.now() &&
      cached.email === claims.email &&
      cached.emailVerified === claims.emailVerified
    ) {
      return cached.id;
    }

    const row = (await this.byAuthId(claims.sub)) ?? (await this.link(claims));
    if (!row.isActive) throw unauthenticated('This account is turned off.');

    if (row.email !== claims.email || (row.emailVerifiedAt !== null) !== claims.emailVerified) {
      try {
        await this.db
          .updateTable('users')
          .set({
            email: claims.email,
            emailVerifiedAt: claims.emailVerified ? (row.emailVerifiedAt ?? new Date()) : null,
          })
          .where('id', '=', row.id)
          .execute();
      } catch (error) {
        // The person changed their email in Neon Auth to one another account here still uses.
        if (isUniqueViolation(error, 'users_email_lower')) throw this.emailTaken(claims);
        throw error;
      }
    }

    if (this.known.size >= MAX_KNOWN) this.known.clear();
    this.known.set(claims.sub, {
      id: row.id,
      email: claims.email,
      emailVerified: claims.emailVerified,
      until: Date.now() + KNOWN_FOR_MS,
    });
    return row.id;
  }

  /** Forgets cached accounts, so a turned off account is stopped at once. */
  forget(): void {
    this.known.clear();
  }

  private byAuthId(authId: string) {
    return this.db
      .selectFrom('users')
      .select(['id', 'email', 'emailVerifiedAt', 'isActive'])
      .where('authId', '=', authId)
      .executeTakeFirst();
  }

  private emailTaken(claims: AuthClaims): DomainError {
    return new DomainError(
      'CONFLICT',
      claims.emailVerified
        ? 'Another account already uses this email.'
        : 'An older account uses this email. Confirm your email to open it.',
    );
  }

  private async link(claims: AuthClaims) {
    // An account made before Neon Auth is taken over only with a confirmed email, so nobody
    // can sign up with someone else's address and get into their account.
    if (claims.emailVerified) {
      const adopted = await this.db
        .updateTable('users')
        .set({ authId: claims.sub })
        .where(sql<string>`lower(email)`, '=', claims.email)
        .where('authId', 'is', null)
        .returning(['id', 'email', 'emailVerifiedAt', 'isActive'])
        .executeTakeFirst();
      if (adopted) return adopted;
    }

    try {
      return await this.db
        .insertInto('users')
        .values({
          authId: claims.sub,
          email: claims.email,
          fullName: claims.name || claims.email.split('@')[0] || 'New user',
          emailVerifiedAt: claims.emailVerified ? new Date() : null,
        })
        .returning(['id', 'email', 'emailVerifiedAt', 'isActive'])
        .executeTakeFirstOrThrow();
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Two first requests at once: the other one made or took over the account.
      const made = await this.byAuthId(claims.sub);
      if (made) return made;
      if (isUniqueViolation(error, 'users_email_lower')) throw this.emailTaken(claims);
      throw error;
    }
  }
}
