'use client';

import { clsx } from 'clsx';
import { ArrowUpRight, ArrowLeftRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Profile } from '@/lib/auth';
import { canRunHiring, ROLE_LABELS } from '@/lib/ats';

type Membership = Profile['memberships'][number];

export function CompanyNav({ membership, many }: { membership: Membership; many: boolean }) {
  const pathname = usePathname();
  const base = `/company/${membership.companyId}`;
  const inSection = (name: string) => pathname.startsWith(`${base}/${name}`);
  const tabs = [
    {
      href: `${base}/jobs`,
      label: 'Jobs',
      active: !['team', 'interviews', 'availability', 'numbers', 'activity'].some(inSection),
    },
    { href: `${base}/interviews`, label: 'Interviews', active: inSection('interviews') },
    { href: `${base}/availability`, label: 'My hours', active: inSection('availability') },
    ...(canRunHiring(membership.role)
      ? [{ href: `${base}/numbers`, label: 'Numbers', active: inSection('numbers') }]
      : []),
    ...(membership.role === 'admin'
      ? [
          { href: `${base}/team`, label: 'Team', active: inSection('team') },
          { href: `${base}/activity`, label: 'Activity', active: inSection('activity') },
        ]
      : []),
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-sunken/70 px-4 py-2.5 sm:px-6">
      <p className="flex min-w-0 items-center gap-2 text-sm">
        <span className="truncate font-bold">{membership.name}</span>
        <span className="shrink-0 rounded-full bg-overlay px-2.5 py-0.5 text-xs font-medium text-muted">
          {ROLE_LABELS[membership.role]}
        </span>
        {many && (
          <Link
            href="/company?choose=1"
            aria-label="Change company"
            title="Change company"
            className="grid size-7 shrink-0 place-items-center rounded-control text-muted hover:bg-raised hover:text-fg"
          >
            <ArrowLeftRight aria-hidden className="size-3.5" />
          </Link>
        )}
      </p>
      <nav aria-label="Company" className="flex items-center gap-1">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? 'page' : undefined}
            className={clsx(
              'rounded-control px-3 py-1.5 text-sm font-semibold transition',
              tab.active ? 'bg-overlay text-fg' : 'text-muted hover:text-fg',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <a
        href={`/c/${membership.slug}`}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition hover:text-accent"
      >
        Careers page
        <ArrowUpRight aria-hidden className="size-4" />
      </a>
    </div>
  );
}
