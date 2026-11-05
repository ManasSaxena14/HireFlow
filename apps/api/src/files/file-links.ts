import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { ResumeLink } from '@hireflow/shared';
import { ConfigService } from '../config/config.service.js';

const LINK_LIFETIME_MS = 5 * 60 * 1000;

/** Short-lived download links. Whoever has the link can open the file until it runs out. */
@Injectable()
export class FileLinks {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    // Its own key, made from the main secret, so a link can never be used as a login token.
    this.key = Buffer.from(
      hkdfSync('sha256', config.env.JWT_REFRESH_SECRET, '', 'hireflow-file-links', 32),
    );
  }

  private sign(fileId: string, expires: number): string {
    return createHmac('sha256', this.key).update(`${fileId}.${expires}`).digest('base64url');
  }

  create(fileId: string, now = Date.now()): ResumeLink {
    const expires = now + LINK_LIFETIME_MS;
    const signature = this.sign(fileId, expires);
    return {
      url: `/api/v1/files/${fileId}?expires=${expires}&signature=${signature}`,
      expiresAt: new Date(expires).toISOString(),
    };
  }

  isValid(fileId: string, expires: number, signature: string, now = Date.now()): boolean {
    if (!Number.isSafeInteger(expires) || expires < now) return false;
    const expected = Buffer.from(this.sign(fileId, expires));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }
}
