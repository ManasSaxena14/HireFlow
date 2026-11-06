'use client';

import type { Interview } from '@hireflow/shared';
import { clsx } from 'clsx';
import { CalendarDays } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { CancelInterviewDialog } from '@/components/scheduler/cancel-dialog';
import { CalendarButton, InterviewRow, JoinLink } from '@/components/scheduler/interview-row';
import { InterviewScheduler } from '@/components/scheduler/interview-scheduler';
import { Button, buttonClass } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { canRunHiring } from '@/lib/ats';
import { useAuth } from '@/lib/auth';
import { zoneLabel } from '@/lib/format';
import { errorMessage } from '@/lib/forms';
import { useCancelInterview, useCompanyInterviews } from '@/lib/scheduler';
import { useCompanyRole } from '../use-membership';

const SCOPES = [
  ['upcoming', 'Coming up'],
  ['past', 'Past'],
] as const;

export default function CompanyInterviewsPage() {
  const { cid, role } = useCompanyRole();
  const { profile } = useAuth();
  const timeZone = profile?.timezone ?? 'UTC';
  const toast = useToast();
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const query = useCompanyInterviews(cid, scope);
  const cancel = useCancelInterview(cid);
  const [moving, setMoving] = useState<Interview | null>(null);
  const [cancelling, setCancelling] = useState<Interview | null>(null);
  const runsHiring = canRunHiring(role);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="flex min-h-full flex-col p-4 sm:p-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl font-extrabold tracking-tight sm:text-7xl">
            Interviews
          </h1>
          <p className="mt-2 text-[15px] text-muted">Times are in {zoneLabel(timeZone)}</p>
        </div>
        <div role="group" aria-label="Which interviews" className="flex gap-1">
          {SCOPES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={scope === value}
              onClick={() => setScope(value)}
              className={clsx(
                'h-11 rounded-control px-5 text-sm font-bold transition',
                scope === value ? 'bg-accent text-on-accent' : 'text-muted hover:text-fg',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {query.isPending ? (
        <div className="grid gap-2.5" role="status" aria-label="Loading interviews">
          <Skeleton className="h-28 rounded-[20px]" />
          <Skeleton className="h-28 rounded-[20px]" />
        </div>
      ) : query.isError ? (
        <ErrorState message="We could not load the interviews." onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          className="flex-1"
          title={scope === 'upcoming' ? 'No interviews coming up' : 'No past interviews'}
          icon={<CalendarDays aria-hidden className="size-9" />}
          action={
            scope === 'upcoming' && (
              <Link href={`/company/${cid}/availability`} className={buttonClass('primary', 'lg')}>
                Set my hours
              </Link>
            )
          }
        >
          {runsHiring
            ? 'Open a candidate and choose Book an interview.'
            : 'Interviews booked with you will show here.'}
        </EmptyState>
      ) : (
        <>
          <ul className="grid gap-2.5 2xl:grid-cols-2">
            {items.map((interview) => {
              const live =
                interview.status === 'scheduled' && Date.parse(interview.end) > Date.now();
              return (
                <InterviewRow
                  key={interview.id}
                  start={interview.start}
                  end={interview.end}
                  timeZone={timeZone}
                  muted={!live}
                  title={
                    <Link
                      href={`/company/${cid}/candidates/${interview.applicationId}`}
                      className="hover:text-accent"
                    >
                      {interview.candidate.fullName}
                    </Link>
                  }
                  detail={`${interview.jobTitle}, with ${interview.interviewer.fullName}${
                    interview.status === 'cancelled' ? ' (cancelled)' : ''
                  }`}
                >
                  {live && interview.meetingUrl && <JoinLink url={interview.meetingUrl} />}
                  {live && interview.interviewer.id === profile?.id && (
                    <CalendarButton id={interview.id} />
                  )}
                  {live && runsHiring && (
                    <>
                      <Button variant="secondary" size="sm" onClick={() => setMoving(interview)}>
                        Change time
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setCancelling(interview)}>
                        Cancel
                      </Button>
                    </>
                  )}
                </InterviewRow>
              );
            })}
          </ul>
          {query.hasNextPage && (
            <Button
              variant="secondary"
              className="mx-auto mt-5"
              loading={query.isFetchingNextPage}
              onClick={() => query.fetchNextPage()}
            >
              Show more
            </Button>
          )}
        </>
      )}

      {moving && (
        <InterviewScheduler
          cid={cid}
          applicationId={moving.applicationId}
          candidateName={moving.candidate.fullName}
          moving={moving}
          open
          onClose={() => setMoving(null)}
        />
      )}
      <CancelInterviewDialog
        name={cancelling?.candidate.fullName ?? ''}
        open={cancelling !== null}
        busy={cancel.isPending}
        onCancel={() => setCancelling(null)}
        onConfirm={() => {
          if (!cancelling) return;
          cancel.mutate(cancelling.id, {
            onSuccess: () => toast('Interview cancelled. We told everyone by email.'),
            onError: (error) => toast(errorMessage(error), 'error'),
            onSettled: () => setCancelling(null),
          });
        }}
      />
    </div>
  );
}
