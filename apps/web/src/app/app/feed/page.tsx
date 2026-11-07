'use client';

import { BellPlus, Radar, Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { FeedCard } from '@/components/feed/feed-card';
import { Button, buttonClass } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useFeedJobs } from '@/lib/feed';
import { useDebounced } from '@/lib/use-debounced';

export default function FeedPage() {
  const [q, setQ] = useState('');
  const [location, setLocation] = useState('');
  const [remote, setRemote] = useState(false);
  const debouncedQ = useDebounced(q.trim());
  const debouncedLocation = useDebounced(location.trim());
  const filters = useMemo(
    () => ({ q: debouncedQ, location: debouncedLocation, remote }),
    [debouncedQ, debouncedLocation, remote],
  );
  const { data, isPending, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useFeedJobs(filters);
  const jobs = data?.pages.flatMap((page) => page.items) ?? [];
  const filtered = Boolean(filters.q || filters.location || filters.remote);

  return (
    <div className="flex min-h-full flex-col p-4 sm:p-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl font-extrabold tracking-tight sm:text-7xl">
            Find jobs
          </h1>
          <p className="mt-2 text-[15px] text-muted">
            New jobs from public company job boards, checked every 30 minutes.
          </p>
        </div>
        <Link href="/app/alerts" className={buttonClass('secondary')}>
          <BellPlus aria-hidden className="size-4" />
          Job alerts
        </Link>
      </header>

      <form
        role="search"
        onSubmit={(event) => event.preventDefault()}
        className="mb-6 grid items-end gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]"
      >
        <TextField
          label="Search jobs"
          type="search"
          placeholder="Job title, skill or company"
          maxLength={200}
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <TextField
          label="Location"
          type="search"
          placeholder="City or country"
          maxLength={200}
          value={location}
          onChange={(event) => setLocation(event.target.value)}
        />
        <label className="flex h-12 cursor-pointer items-center gap-2.5 rounded-control border border-line-strong bg-sunken px-4 text-[15px] font-semibold">
          <input
            type="checkbox"
            className="size-4 accent-[var(--color-accent)]"
            checked={remote}
            onChange={(event) => setRemote(event.target.checked)}
          />
          Remote only
        </label>
      </form>

      {isPending ? (
        <div role="status" aria-label="Loading jobs" className="grid gap-2.5">
          <Skeleton className="h-40 rounded-[20px]" />
          <Skeleton className="h-40 rounded-[20px]" />
        </div>
      ) : isError ? (
        <ErrorState message="We could not load jobs." onRetry={() => refetch()} />
      ) : jobs.length === 0 ? (
        <EmptyState
          className="flex-1"
          title={filtered ? 'No jobs found' : 'Jobs are on the way'}
          icon={
            filtered ? (
              <Search aria-hidden className="size-9" />
            ) : (
              <Radar aria-hidden className="size-9" />
            )
          }
          action={
            <Link href="/app/alerts" className={buttonClass('primary', 'lg')}>
              Set up a job alert
            </Link>
          }
        >
          {filtered
            ? 'Try fewer words, or set up an alert and we will tell you when one comes in.'
            : 'We check job boards every 30 minutes. New jobs will show here.'}
        </EmptyState>
      ) : (
        <>
          <ul className="grid gap-2.5">
            {jobs.map((job) => (
              <FeedCard key={job.id} job={job} />
            ))}
          </ul>
          {hasNextPage && (
            <div className="mt-6 flex justify-center">
              <Button
                variant="secondary"
                loading={isFetchingNextPage}
                onClick={() => fetchNextPage()}
              >
                Show more jobs
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
