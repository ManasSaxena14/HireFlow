'use client';

import { CalendarDays } from 'lucide-react';
import Link from 'next/link';
import { CalendarButton, InterviewRow, JoinLink } from '@/components/scheduler/interview-row';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useAuth } from '@/lib/auth';
import { zoneLabel } from '@/lib/format';
import { useMyInterviews } from '@/lib/scheduler';

export default function MyInterviewsPage() {
  const { profile } = useAuth();
  const timeZone = profile?.timezone ?? 'UTC';
  const { data, isPending, isError, refetch } = useMyInterviews();

  return (
    <div className="flex min-h-full flex-col p-4 sm:p-6">
      <header className="mb-6">
        <h1 className="font-display text-5xl font-extrabold tracking-tight sm:text-7xl">
          Interviews
        </h1>
        <p className="mt-2 text-[15px] text-muted">Times are in {zoneLabel(timeZone)}</p>
      </header>
      {isPending ? (
        <div role="status" aria-label="Loading interviews">
          <Skeleton className="h-28 rounded-[20px]" />
        </div>
      ) : isError ? (
        <ErrorState message="We could not load your interviews." onRetry={() => refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          className="flex-1"
          title="No interviews coming up"
          icon={<CalendarDays aria-hidden className="size-9" />}
        >
          Interviews you run or attend will show here.
        </EmptyState>
      ) : (
        <ul className="grid gap-2.5 2xl:grid-cols-2">
          {data.map((interview) => (
            <InterviewRow
              key={interview.id}
              start={interview.start}
              end={interview.end}
              timeZone={timeZone}
              title={
                interview.role === 'interviewer' ? (
                  <Link
                    href={`/company/${interview.companyId}/candidates/${interview.applicationId}`}
                    className="hover:text-accent"
                  >
                    {interview.otherPerson}
                  </Link>
                ) : (
                  `With ${interview.otherPerson}`
                )
              }
              detail={`${interview.jobTitle} at ${interview.companyName}`}
            >
              {interview.meetingUrl && <JoinLink url={interview.meetingUrl} />}
              <CalendarButton id={interview.id} />
            </InterviewRow>
          ))}
        </ul>
      )}
    </div>
  );
}
