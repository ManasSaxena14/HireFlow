import type { OfferStatus } from '@hireflow/shared';

export function offerStatus(offer: {
  interviewId: string | null;
  withdrawnAt: Date | null;
  expiresAt: Date;
}): OfferStatus {
  if (offer.interviewId) return 'booked';
  if (offer.withdrawnAt) return 'withdrawn';
  return offer.expiresAt.getTime() <= Date.now() ? 'expired' : 'open';
}
