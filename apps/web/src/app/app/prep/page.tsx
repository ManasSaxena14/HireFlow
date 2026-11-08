'use client';

import type { ReviewItem } from '@hireflow/shared';
import { Flame, Trash2 } from 'lucide-react';
import { LogSessionForm } from '@/components/prep/log-session-form';
import { BarList } from '@/components/ui/bar-list';
import { Button } from '@/components/ui/button';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/forms';
import { timeAgo } from '@/lib/format';
import {
  GRADES,
  KIND_LABELS,
  useDeleteReview,
  useDeleteSession,
  useGradeReview,
  usePrepStats,
  useReviews,
  useSessions,
} from '@/lib/prep';

const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-[20px] border border-line bg-raised/60 p-5 sm:p-6">
    <h2 className="font-display mb-4 text-2xl font-extrabold tracking-tight">{title}</h2>
    {children}
  </section>
);

const days = (count: number) => (count === 1 ? '1 day' : `${count} days`);

function StatTiles() {
  const { data, isPending, isError } = usePrepStats();
  if (isError) return null;
  if (isPending) return <Skeleton className="h-32 rounded-[20px]" />;
  const { streak, last30Days } = data;
  const tried =
    last30Days.outcomes.solved + last30Days.outcomes.partial + last30Days.outcomes.failed;
  const tiles = [
    {
      label: 'Practised in the last 30 days',
      value: String(last30Days.sessions),
      note: `${last30Days.minutes} minutes`,
    },
    {
      label: 'Got it',
      value: tried === 0 ? '–' : `${Math.round((last30Days.outcomes.solved / tried) * 100)}%`,
      note: tried === 0 ? 'Add how it went to see this' : `of ${tried} with a result`,
    },
    { label: 'Reviews due', value: String(data.reviewsDue), note: 'today' },
  ];
  return (
    <div data-testid="prep-stats" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <div className="glow-button flex min-h-32 flex-col justify-between rounded-[20px] bg-accent p-5 text-on-accent">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Flame aria-hidden className="size-4" />
          Days in a row
        </p>
        <div>
          <p className="font-display text-6xl leading-none font-extrabold tabular-nums">
            {streak.current}
          </p>
          <p className="mt-1 text-[13px] font-semibold">
            {streak.practisedToday
              ? `Best: ${days(streak.best)}`
              : streak.current > 0
                ? 'Practise today to keep it going'
                : `Best: ${days(streak.best)}`}
          </p>
        </div>
      </div>
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="flex min-h-32 flex-col justify-between rounded-[20px] border border-line bg-raised p-5"
        >
          <p className="text-sm font-semibold text-muted">{tile.label}</p>
          <div>
            <p className="font-display text-5xl leading-none font-extrabold tabular-nums">
              {tile.value}
            </p>
            <p className="mt-1 text-[13px] text-muted">{tile.note}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReviewCard({ item, due }: { item: ReviewItem; due: boolean }) {
  const grade = useGradeReview();
  const remove = useDeleteReview();
  const toast = useToast();
  const onGrade = (quality: number) =>
    grade.mutate(
      { id: item.id, quality },
      {
        onSuccess: (next) =>
          toast(
            next.intervalDays === 1
              ? `We will ask about ${item.topic} again tomorrow.`
              : `Next review of ${item.topic} in ${next.intervalDays} days.`,
          ),
        onError: (error) => toast(errorMessage(error), 'error'),
      },
    );
  return (
    <li data-testid="review-card" className="rounded-2xl bg-sunken p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold break-words">{item.topic}</p>
          <p className="text-[13px] text-muted">
            {due ? 'How well do you remember it?' : `Next review on ${item.dueOn}`}
          </p>
        </div>
        <button
          type="button"
          aria-label={`Stop reviewing ${item.topic}`}
          title="Stop reviewing"
          onClick={() => remove.mutate(item.id)}
          className="grid size-8 shrink-0 place-items-center rounded-control text-muted hover:bg-overlay hover:text-fg"
        >
          <Trash2 aria-hidden className="size-4" />
        </button>
      </div>
      {due && (
        <div
          role="group"
          aria-label={`Grade ${item.topic}`}
          className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6"
        >
          {GRADES.map((option) => (
            <Button
              key={option.quality}
              size="sm"
              variant={option.quality >= 3 ? 'secondary' : 'ghost'}
              disabled={grade.isPending}
              onClick={() => onGrade(option.quality)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}
    </li>
  );
}

function Reviews() {
  const { data, isPending, isError, refetch } = useReviews();
  const stats = usePrepStats();
  if (isPending) return <Skeleton className="h-40" />;
  if (isError)
    return <ErrorState message="We could not load your reviews." onRetry={() => refetch()} />;
  const dueCount = stats.data?.reviewsDue ?? 0;
  const due = data.slice(0, dueCount);
  const later = data.slice(dueCount);
  return (
    <div className="space-y-4">
      {data.length === 0 ? (
        <p className="text-[15px] text-muted">
          Save a practice and its topic comes back here, just before you would forget it.
        </p>
      ) : due.length === 0 ? (
        <p className="text-[15px] text-muted">Nothing to review today. Well done.</p>
      ) : (
        <ul className="space-y-2">
          {due.map((item) => (
            <ReviewCard key={item.id} item={item} due />
          ))}
        </ul>
      )}
      {later.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-muted hover:text-fg">
            Coming up ({later.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {later.map((item) => (
              <ReviewCard key={item.id} item={item} due={false} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Breakdown() {
  const { data } = usePrepStats();
  if (!data || data.last30Days.sessions === 0) {
    return <p className="text-[15px] text-muted">Your time by type and topic shows here.</p>;
  }
  const minutes = (value: number) => `${value} min`;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <h3 className="mb-3 text-sm font-bold">Sessions by type</h3>
        <BarList
          label="Sessions by type"
          rows={data.last30Days.byKind.map((row) => ({
            name: KIND_LABELS[row.kind],
            value: row.sessions,
            note: minutes(row.minutes),
          }))}
        />
      </div>
      <div>
        <h3 className="mb-3 text-sm font-bold">Your main topics</h3>
        <BarList
          label="Your main topics"
          rows={data.last30Days.topTopics.map((row) => ({
            name: row.topic,
            value: row.sessions,
            note: minutes(row.minutes),
          }))}
        />
      </div>
    </div>
  );
}

function History() {
  const { data, isPending, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useSessions();
  const remove = useDeleteSession();
  if (isPending) return <Skeleton className="h-32" />;
  if (isError)
    return <ErrorState message="We could not load your practice." onRetry={() => refetch()} />;
  const sessions = data.pages.flatMap((page) => page.items);
  if (sessions.length === 0) return <p className="text-[15px] text-muted">Nothing saved yet.</p>;
  const outcomeLabel = { solved: 'Got it', partial: 'Partly', failed: 'Got stuck' } as const;
  return (
    <>
      <ul className="divide-y divide-line">
        {sessions.map((session) => (
          <li key={session.id} className="flex items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-semibold break-words">{session.topic}</p>
              <p className="text-[13px] text-muted">
                {[
                  KIND_LABELS[session.kind],
                  session.durationMin ? `${session.durationMin} min` : null,
                  session.outcome ? outcomeLabel[session.outcome] : null,
                  timeAgo(session.createdAt),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {session.notes && (
                <p className="mt-1 text-sm whitespace-pre-line text-muted">{session.notes}</p>
              )}
            </div>
            <button
              type="button"
              aria-label={`Delete practice: ${session.topic}`}
              title="Delete"
              onClick={() => remove.mutate(session.id)}
              className="grid size-8 shrink-0 place-items-center rounded-control text-muted hover:bg-overlay hover:text-fg"
            >
              <Trash2 aria-hidden className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      {hasNextPage && (
        <Button
          variant="secondary"
          className="mt-3 w-full"
          loading={isFetchingNextPage}
          onClick={() => fetchNextPage()}
        >
          Show more
        </Button>
      )}
    </>
  );
}

export default function PrepPage() {
  return (
    <div className="flex min-h-full flex-col gap-4 p-4 sm:p-6">
      <header className="mb-2">
        <h1 className="font-display text-5xl font-extrabold tracking-tight sm:text-7xl">
          Practice
        </h1>
        <p className="mt-2 text-[15px] text-muted">
          Log what you practise for interviews. Each topic comes back for review just before you
          would forget it.
        </p>
      </header>
      <StatTiles />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Panel title="Log practice">
          <LogSessionForm />
        </Panel>
        <div className="space-y-4">
          <Panel title="Review today">
            <Reviews />
          </Panel>
          <Panel title="Last 30 days">
            <Breakdown />
          </Panel>
        </div>
      </div>
      <Panel title="Your practice">
        <History />
      </Panel>
    </div>
  );
}
