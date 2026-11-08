'use client';

import { History } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useAuditLog } from '@/lib/audit';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { useCompanyRole } from '../use-membership';

const TYPES = [
  ['', 'Everything'],
  ['user', 'Team'],
  ['job', 'Jobs'],
  ['application', 'Candidates moving'],
  ['candidate', 'Candidates deleted'],
  ['interview', 'Interviews'],
  ['company', 'Company'],
] as const;

/** The log keeps short codes. These are what people see. */
const ACTION_WORDS: Record<string, string> = {
  'company.created': 'Created the company',
  'company.updated': 'Changed the company details',
  'member.added': 'Added a team member',
  'member.role_changed': 'Changed a role',
  'member.removed': 'Removed a team member',
  'job.created': 'Added a job',
  'job.updated': 'Changed a job',
  'job.stages_changed': 'Changed the steps of a job',
  'job.published': 'Made a job live',
  'job.closed': 'Closed a job',
  'application.moved': 'Moved a candidate',
  'scorecard.submitted': 'Sent feedback',
  'candidate.deleted': 'Deleted a candidate',
  'interview.created': 'Booked an interview',
  'interview.rescheduled': 'Moved an interview',
  'interview.cancelled': 'Cancelled an interview',
  'interview.booked_by_candidate': 'A candidate booked a time',
  'interview_offer.created': 'Sent times to a candidate',
  'interview_offer.withdrawn': 'Took back the times sent',
};

const describe = (action: string) => ACTION_WORDS[action] ?? action.replaceAll(/[._]/g, ' ');

export default function ActivityPage() {
  const { cid, role } = useCompanyRole();
  const { profile } = useAuth();
  const [type, setType] = useState('');
  const { data, isPending, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useAuditLog(cid, type);

  if (role !== 'admin') {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState title="For admins only" icon={<History aria-hidden className="size-9" />}>
          Only company admins can see the activity log.
        </EmptyState>
      </div>
    );
  }

  const entries = data?.pages.flatMap((page) => page.items) ?? [];
  const timeZone = profile?.timezone ?? 'UTC';

  return (
    <div className="flex min-h-full flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl font-extrabold tracking-tight sm:text-7xl">
            Activity
          </h1>
          <p className="mt-2 text-[15px] text-muted">
            Who changed what in this company. Nobody can change or delete these entries.
          </p>
        </div>
        <div className="w-full sm:w-64">
          <SelectField label="Show" value={type} onChange={(event) => setType(event.target.value)}>
            {TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
        </div>
      </header>

      {isPending ? (
        <Skeleton className="h-64 rounded-[20px]" />
      ) : isError ? (
        <ErrorState message="We could not load the activity." onRetry={() => refetch()} />
      ) : entries.length === 0 ? (
        <EmptyState title="Nothing here yet" icon={<History aria-hidden className="size-9" />} />
      ) : (
        <section className="rounded-[20px] border border-line bg-raised/60 px-5 sm:px-6">
          <ul className="divide-y divide-line">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
              >
                <span className="min-w-0">
                  <span className="font-semibold">{describe(entry.action)}</span>
                  <span className="text-muted">
                    {' '}
                    by {entry.actor ? entry.actor.fullName : 'someone outside the team'}
                  </span>
                </span>
                <span className="text-[13px] text-muted tabular-nums">
                  {formatDateTime(entry.createdAt, timeZone)}
                </span>
              </li>
            ))}
          </ul>
          {hasNextPage && (
            <div className="pb-4">
              <Button
                variant="secondary"
                className="w-full"
                loading={isFetchingNextPage}
                onClick={() => fetchNextPage()}
              >
                Show older
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
