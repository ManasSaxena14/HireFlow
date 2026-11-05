'use client';

import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';

/** The company layout only shows these pages to members, so this always finds a role. */
export function useCompanyRole() {
  const { cid } = useParams<{ cid: string }>();
  const { profile } = useAuth();
  const membership = profile?.memberships.find((item) => item.companyId === cid);
  return { cid, role: membership?.role ?? 'interviewer', slug: membership?.slug ?? '' };
}
