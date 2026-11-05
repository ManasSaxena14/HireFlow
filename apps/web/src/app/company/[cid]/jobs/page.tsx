'use client';

import type { Job, JobStatus } from '@hireflow/shared';
import { clsx } from 'clsx';
import { ArrowRight, BriefcaseBusiness, MapPin, Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { canRunHiring, useJobs } from '@/lib/ats';
import { timeAgo } from '@/lib/format';
import { useCompanyRole } from '../use-membership';

const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: 'Draft',
  open: 'Live',
  closed: 'Closed',
};

function JobRow({ cid, job, index }: { cid: string; job: Job; index: number }) {
  return (
    <li className="animate-fade-up" style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}>
      <Link
        href={`/company/${cid}/jobs/${job.id}`}
        className="group card-lift flex h-full flex-col rounded-[22px] border border-line bg-raised p-5 hover:border-accent sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <span
            className={clsx(
              'rounded-full px-3 py-1 text-xs font-bold',
              job.status === 'open' && 'bg-success text-on-accent',
              job.status === 'draft' && 'bg-overlay text-muted',
              job.status === 'closed' && 'bg-sunken text-subtle',
            )}
          >
            {JOB_STATUS_LABELS[job.status]}
          </span>
          <span className="text-xs text-subtle">{timeAgo(job.createdAt)}</span>
        </div>
        <h2 className="font-display mt-5 text-3xl leading-tight font-extrabold tracking-tight transition group-hover:text-accent">
          {job.title}
        </h2>
        <p className="mt-2 flex items-center gap-1.5 text-[15px] text-muted">
          <MapPin aria-hidden className="size-4 shrink-0" />
          {[job.location, job.remote ? 'From home' : null].filter(Boolean).join(' · ') ||
            'No location'}
        </p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-7">
          <p className="flex items-baseline gap-2">
            <Users aria-hidden className="size-4 self-center text-accent" />
            <span className="font-display text-3xl font-extrabold">{job.applicationCount}</span>
            <span className="text-[13px] text-muted">
              {job.applicationCount === 1 ? 'person' : 'people'}
            </span>
          </p>
          <ArrowRight
            aria-hidden
            className="size-5 text-muted transition group-hover:translate-x-1 group-hover:text-accent"
          />
        </div>
      </Link>
    </li>
  );
}

export default function JobsPage() {
  const { cid, role } = useCompanyRole();
  const jobs = useJobs(cid);
  const runsHiring = canRunHiring(role);

  return (
    <div className="flex min-h-full flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          {runsHiring ? 'Jobs' : 'Your interviews'}
        </h1>
        {runsHiring && (
          <Link href={`/company/${cid}/jobs/new`} className={buttonClass('primary', 'lg')}>
            <Plus aria-hidden className="size-5" strokeWidth={2.5} />
            Post a job
          </Link>
        )}
      </header>

      {jobs.isPending ? (
        <div
          className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3"
          role="status"
          aria-label="Loading jobs"
        >
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-64 rounded-[22px]" />
          ))}
        </div>
      ) : jobs.isError ? (
        <ErrorState message="We could not load your jobs." onRetry={() => jobs.refetch()} />
      ) : jobs.data.items.length === 0 ? (
        <EmptyState
          className="flex-1"
          title={runsHiring ? 'No jobs yet' : 'Nobody for you yet'}
          icon={<BriefcaseBusiness aria-hidden className="size-9" />}
          action={
            runsHiring && (
              <Link href={`/company/${cid}/jobs/new`} className={buttonClass('primary', 'lg')}>
                Post your first job
              </Link>
            )
          }
        >
          {runsHiring
            ? 'Post a job and share your careers page. New people show up here.'
            : 'When your team gives you someone to interview, you will see them here.'}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {jobs.data.items.map((job, index) => (
            <JobRow key={job.id} cid={cid} job={job} index={index} />
          ))}
        </ul>
      )}
    </div>
  );
}
