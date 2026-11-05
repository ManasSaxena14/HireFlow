'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { CompanyNav } from '@/components/hiring/company-nav';
import { buttonClass } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { useAuth } from '@/lib/auth';

export default function CompanyLayout({ children }: { children: ReactNode }) {
  const { cid } = useParams<{ cid: string }>();
  const { profile } = useAuth();
  const memberships = profile?.memberships ?? [];
  const membership = memberships.find((item) => item.companyId === cid);

  if (!membership) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          title="Company not found"
          action={
            <Link href="/company" className={buttonClass('primary', 'lg')}>
              See your companies
            </Link>
          }
        >
          You may not be part of this company.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col lg:h-full">
      <CompanyNav membership={membership} many={memberships.length > 1} />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
