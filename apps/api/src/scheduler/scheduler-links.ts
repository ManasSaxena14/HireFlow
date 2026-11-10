import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { uuidSchema } from '@hireflow/shared';
import { ConfigService } from '../config/config.service.js';

/** Signed links for candidates, who usually have no account to sign in with. */
@Injectable()
export class SchedulerLinks {
  private readonly key: Buffer;
  private readonly appUrl: string;

  constructor(config: ConfigService) {
    this.key = Buffer.from(
      hkdfSync('sha256', config.env.LINK_SECRET, '', 'hireflow-interview-links', 32),
    );
    this.appUrl = config.env.APP_URL;
  }

  private sign(kind: string, id: string): string {
    return createHmac('sha256', this.key).update(`${kind}.${id}`).digest('base64url');
  }

  private matches(expected: string, given: string): boolean {
    const a = Buffer.from(expected);
    const b = Buffer.from(given);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  bookingUrl(offerId: string): string {
    return `${this.appUrl}/book/${offerId}.${this.sign('offer', offerId)}`;
  }

  /** Gives the offer id, or null if the token was changed or made up. */
  readOfferToken(token: string): string | null {
    const [id, signature, ...rest] = token.split('.');
    if (!id || !signature || rest.length > 0 || !uuidSchema.safeParse(id).success) return null;
    return this.matches(this.sign('offer', id), signature) ? id : null;
  }

  calendarUrl(interviewId: string): string {
    const signature = this.sign('calendar', interviewId);
    return `${this.appUrl}/api/v1/public/interviews/${interviewId}/calendar?signature=${signature}`;
  }

  isCalendarSignature(interviewId: string, signature: string): boolean {
    return this.matches(this.sign('calendar', interviewId), signature);
  }
}
