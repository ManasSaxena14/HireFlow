'use client';

import type { FeedJob } from '@hireflow/shared';
import { Bookmark, BookmarkCheck, ExternalLink, Globe2, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button, buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import { useFeedJob, useSaveFeedJob } from '@/lib/feed';
import { errorMessage } from '@/lib/forms';
import { timeAgo } from '@/lib/format';

function FullDescription({ id }: { id: string }) {
  const { data, isPending, isError, refetch } = useFeedJob(id, true);
  if (isPending) return <Skeleton className="mt-4 h-40" />;
  if (isError) {
    return (
      <p role="alert" className="mt-4 text-sm text-muted">
        We could not load this job.{' '}
        <button type="button" className="font-semibold text-fg underline" onClick={() => refetch()}>
          Try again
        </button>
      </p>
    );
  }
  return (
    <div className="mt-4 max-h-[28rem] overflow-y-auto rounded-2xl bg-sunken p-4 text-[15px] leading-relaxed whitespace-pre-line text-muted">
      {data.description ??
        'This job has no description. Open it on the company site to learn more.'}
    </div>
  );
}

export function FeedCard({ job }: { job: FeedJob }) {
  const [open, setOpen] = useState(false);
  const save = useSaveFeedJob();
  const toast = useToast();

  const onSave = () =>
    save.mutate(job.id, {
      onSuccess: () => toast('Saved to your job board'),
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'DUPLICATE_JOB') {
          toast('This job is already on your board');
        } else {
          toast(errorMessage(error), 'error');
        }
      },
    });

  return (
    <li
      data-testid="feed-job"
      className="rounded-[20px] border border-line bg-raised/60 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-72">
          <h2 className="font-display text-xl font-extrabold tracking-tight sm:text-2xl">
            {job.title}
          </h2>
          <p className="mt-1 text-[15px] font-semibold text-fg">{job.companyName}</p>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
            {job.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin aria-hidden className="size-3.5" />
                {job.location}
              </span>
            )}
            {job.remote && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-accent">
                <Globe2 aria-hidden className="size-3.5" />
                Remote
              </span>
            )}
            <span>Posted {timeAgo(job.postedAt ?? job.createdAt)}</span>
            <span>From {job.sourceName}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {job.savedApplicationId ? (
            <Link
              href={`/app/tracker/${job.savedApplicationId}`}
              className={buttonClass('secondary', 'sm')}
            >
              <BookmarkCheck aria-hidden className="size-4 text-accent" />
              On your board
            </Link>
          ) : (
            <Button size="sm" loading={save.isPending} onClick={onSave}>
              <Bookmark aria-hidden className="size-4" />
              Save to board
            </Button>
          )}
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass('secondary', 'sm')}
          >
            Apply
            <ExternalLink aria-hidden className="size-3.5" />
            <span className="sr-only"> (opens the company site in a new tab)</span>
          </a>
        </div>
      </div>

      {job.summary && !open && (
        <p className="mt-3 line-clamp-2 text-[15px] leading-relaxed text-muted">{job.summary}</p>
      )}
      {open && <FullDescription id={job.id} />}
      {job.summary && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="mt-2 text-sm font-semibold text-fg underline-offset-4 hover:text-accent hover:underline"
        >
          {open ? 'Show less' : 'Read more'}
          <span className="sr-only"> about {job.title}</span>
        </button>
      )}
    </li>
  );
}
