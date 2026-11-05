'use client';

import { ArrowUpRight, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApplicationDetails } from '@/components/tracker/application-details';
import { ApplicationForm } from '@/components/tracker/application-form';
import { KanbanBoard } from '@/components/tracker/kanban-board';
import { StatsCards } from '@/components/tracker/stats-cards';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useBoard, useCreateApplication, useMoveApplication } from '@/lib/tracker';

function useDebounced(value: string, delay = 250): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function TrackerPage() {
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

  return (
    <div className="px-5 py-6 sm:px-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
        <Button onClick={() => setAdding(true)}>
          <Plus aria-hidden className="size-4" />
          Add application
        </Button>
      </header>

      <div className="mt-5">
        <StatsCards />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle"
          />
          <input
            type="search"
            aria-label="Search by title or company"
            placeholder="Search title or company"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-9 w-full rounded-control border border-line-strong bg-sunken pr-3 pl-8.5 text-sm placeholder:text-subtle focus:border-muted focus:outline-none"
          />
        </div>
        <input
          type="search"
          aria-label="Filter by tag"
          placeholder="Tag"
          value={tag}
          onChange={(event) => setTag(event.target.value)}
          className="h-9 w-28 rounded-control border border-line-strong bg-sunken px-3 text-sm placeholder:text-subtle focus:border-muted focus:outline-none"
        />
        <label className="ml-1 flex h-9 items-center gap-2 text-[13px] text-muted">
          <input
            type="checkbox"
            checked={archived}
            onChange={(event) => setArchived(event.target.checked)}
            className="size-3.5 accent-accent"
          />
          Show archived
        </label>
      </div>

      <div className="mt-4">
        {board.isPending ? (
          <div className="flex gap-3 overflow-hidden" role="status" aria-label="Loading board">
            {[0, 1, 2, 3].map((column) => (
              <Skeleton key={column} className="h-72 w-68 shrink-0" />
            ))}
          </div>
        ) : board.isError ? (
          <ErrorState message="Your board could not be loaded." onRetry={() => board.refetch()} />
        ) : items.length === 0 && !filtering ? (
          <EmptyState
            title="Your board is empty"
            action={<Button onClick={() => setAdding(true)}>Add your first application</Button>}
          >
            Add a job you are interested in, then drag it along as things move.
          </EmptyState>
        ) : items.length === 0 ? (
          <EmptyState title="Nothing matches those filters" />
        ) : (
          <KanbanBoard
            applications={items}
            onOpen={setOpenId}
            onMove={(id, toStatus) => move.mutate({ id, toStatus })}
          />
        )}
      </div>

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add application">
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
            toast('Already on your board, so we opened it for you.');
          }}
        />
      </Dialog>

      <Dialog
        open={openId !== null}
        onClose={() => setOpenId(null)}
        title="Application"
        variant="sheet"
        actions={
          openId && (
            <Link
              href={`/app/tracker/${openId}`}
              aria-label="Open full page"
              title="Open full page"
              className="grid size-8 place-items-center rounded-control text-muted hover:bg-raised hover:text-fg"
            >
              <ArrowUpRight aria-hidden className="size-4" />
            </Link>
          )
        }
      >
        {openId && <ApplicationDetails id={openId} onArchived={() => setOpenId(null)} />}
      </Dialog>
    </div>
  );
}
