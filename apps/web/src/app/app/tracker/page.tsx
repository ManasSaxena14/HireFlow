'use client';

import { ArrowUpRight, BriefcaseBusiness, Plus, Search, SearchX } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ApplicationDetails } from '@/components/tracker/application-details';
import { ApplicationForm } from '@/components/tracker/application-form';
import { KanbanBoard } from '@/components/tracker/kanban-board';
import { StatsCards } from '@/components/tracker/stats-cards';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { useBoard, useCreateApplication, useMoveApplication } from '@/lib/tracker';
import { useDebounced } from '@/lib/use-debounced';

export default function TrackerPage() {
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [archived, setArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const toast = useToast();

  const q = useDebounced(search);
  const tagFilter = useDebounced(tag);
  const board = useBoard({ q, tag: tagFilter, archived });
  const create = useCreateApplication();
  const move = useMoveApplication();

  const filtering = Boolean(q || tagFilter || archived);
  const items = board.data ?? [];
  const firstName = profile?.fullName.split(' ')[0];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:h-full lg:min-h-[44rem]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[15px] font-medium text-muted">Hi {firstName}, here is your search.</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
            My job board
          </h1>
        </div>
        <Button size="lg" onClick={() => setAdding(true)}>
          <Plus aria-hidden className="size-5" strokeWidth={2.5} />
          Add a job
        </Button>
      </header>

      <StatsCards />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-80">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle"
          />
          <input
            type="search"
            aria-label="Search by title or company"
            placeholder="Search by job title or company"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-11 w-full rounded-control border border-line-strong bg-sunken pr-3 pl-10 text-sm placeholder:text-subtle focus:border-accent focus:ring-3 focus:ring-accent/25 focus:outline-none"
          />
        </div>
        <input
          type="search"
          aria-label="Filter by tag"
          placeholder="Tag"
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          className="h-11 w-32 rounded-control border border-line-strong bg-sunken px-3.5 text-sm placeholder:text-subtle focus:border-accent focus:ring-3 focus:ring-accent/25 focus:outline-none"
        />
        <label className="ml-1 flex h-11 items-center gap-2 text-sm font-medium text-muted">
          <input
            type="checkbox"
            checked={archived}
            onChange={(event) => setArchived(event.target.checked)}
            className="size-4 accent-accent"
          />
          Show archived
        </label>
      </div>

      <div className="min-h-0 flex-1">
        {board.isPending ? (
          <div
            className="flex h-full gap-3 overflow-hidden"
            role="status"
            aria-label="Loading board"
          >
            {[0, 1, 2, 3, 4].map((column) => (
              <Skeleton key={column} className="min-h-96 min-w-64 flex-1 rounded-[20px]" />
            ))}
          </div>
        ) : board.isError ? (
          <ErrorState message="We could not load your board." onRetry={() => board.refetch()} />
        ) : items.length === 0 && !filtering ? (
          <EmptyState
            className="h-full min-h-96"
            title="Your board is empty"
            icon={<BriefcaseBusiness aria-hidden className="size-9" />}
            action={
              <Button size="lg" onClick={() => setAdding(true)}>
                Add your first job
              </Button>
            }
          >
            Add a job you like. Then drag it across the board as things change.
          </EmptyState>
        ) : items.length === 0 ? (
          <EmptyState
            className="h-full min-h-96"
            title="No jobs found"
            icon={<SearchX aria-hidden className="size-9" />}
          >
            Try a different search.
          </EmptyState>
        ) : (
          <KanbanBoard
            applications={items}
            onOpen={setOpenId}
            onMove={(id, toStatus) => move.mutate({ id, toStatus })}
          />
        )}
      </div>

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add a job">
        <ApplicationForm
          submitLabel="Add to board"
          onCancel={() => setAdding(false)}
          onSubmit={async (values) => {
            await create.mutateAsync(values);
            setAdding(false);
          }}
          onDuplicate={(existingId) => {
            setAdding(false);
            setOpenId(existingId);
            toast('This job is already on your board, so we opened it.');
          }}
        />
      </Dialog>

      <Dialog
        open={openId !== null}
        onClose={() => setOpenId(null)}
        title="Job details"
        variant="sheet"
        actions={
          openId && (
            <Link
              href={`/app/tracker/${openId}`}
              aria-label="Open full page"
              title="Open full page"
              className="grid size-9 place-items-center rounded-control text-muted hover:bg-raised hover:text-fg"
            >
              <ArrowUpRight aria-hidden className="size-5" />
            </Link>
          )
        }
      >
        {openId && <ApplicationDetails id={openId} onArchived={() => setOpenId(null)} />}
      </Dialog>
    </div>
  );
}
