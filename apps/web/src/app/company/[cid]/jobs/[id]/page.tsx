'use client';

import type { AtsApplication, PipelineStage } from '@hireflow/shared';
import { clsx } from 'clsx';
import { ArrowLeft, ArrowUpRight, Columns3, Globe, Lock, Pencil, Search } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { JobForm } from '@/components/hiring/job-form';
import { PipelineBoard } from '@/components/hiring/pipeline-board';
import { RejectDialog } from '@/components/hiring/reject-dialog';
import { StagesEditor } from '@/components/hiring/stages-editor';
import { Button, buttonClass } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
  canRunHiring,
  useJob,
  useJobStatus,
  useMoveCandidate,
  usePipeline,
  useUpdateJob,
} from '@/lib/ats';
import { errorMessage } from '@/lib/forms';
import { useDebounced } from '@/lib/use-debounced';
import { useCompanyRole } from '../../use-membership';

const STATUS_TEXT = { draft: 'Draft', open: 'Live', closed: 'Closed' } as const;

interface PendingRejection {
  application: AtsApplication;
  stage: PipelineStage;
}

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const { cid, role, slug } = useCompanyRole();
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const job = useJob(cid, id);
  const board = usePipeline(cid, id, q);
  const status = useJobStatus(cid, id);
  const update = useUpdateJob(cid, id);
  const move = useMoveCandidate(cid);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [editingSteps, setEditingSteps] = useState(false);
  const [rejection, setRejection] = useState<PendingRejection | null>(null);
  const flightRef = useRef<((id: string, stageId: string) => void) | null>(null);

  if (job.isPending) {
    return (
      <div className="flex gap-3 overflow-hidden p-4 sm:p-6" role="status" aria-label="Loading job">
        {[0, 1, 2, 3, 4].map((column) => (
          <Skeleton key={column} className="min-h-96 min-w-64 flex-1 rounded-[20px]" />
        ))}
      </div>
    );
  }
  if (job.isError) {
    return (
      <div className="p-4 sm:p-6">
        <ErrorState message="We could not find this job." onRetry={() => job.refetch()} />
      </div>
    );
  }

  const { data } = job;
  const changeStatus = (action: 'publish' | 'close') =>
    status.mutate(action, {
      onSuccess: () => toast(action === 'publish' ? 'This job is now live' : 'This job is closed'),
      onError: (error) => toast(errorMessage(error), 'error'),
    });

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:h-full lg:min-h-[40rem]">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/company/${cid}/jobs`}
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-fg"
          >
            <ArrowLeft aria-hidden className="size-4" />
            All jobs
          </Link>
          <h1 className="font-display mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-4xl font-extrabold tracking-tight sm:text-5xl">
            {data.title}
            <span
              data-testid="job-status"
              className={clsx(
                'rounded-full px-3 py-1 font-sans text-[13px] font-bold tracking-normal',
                data.status === 'open' ? 'bg-success text-on-accent' : 'bg-overlay text-muted',
              )}
            >
              {STATUS_TEXT[data.status]}
            </span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.status === 'open' && (
            <a
              href={`/c/${slug}/jobs/${data.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass('ghost', 'md')}
            >
              See public page
              <ArrowUpRight aria-hidden className="size-4" />
            </a>
          )}
          {data.canManage && (
            <>
              <Button variant="secondary" onClick={() => setEditingSteps(true)}>
                <Columns3 aria-hidden className="size-4" />
                Steps
              </Button>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil aria-hidden className="size-4" />
                Edit
              </Button>
              {data.status === 'open' ? (
                <Button
                  variant="danger"
                  loading={status.isPending}
                  onClick={() => changeStatus('close')}
                >
                  <Lock aria-hidden className="size-4" />
                  Close job
                </Button>
              ) : (
                <Button loading={status.isPending} onClick={() => changeStatus('publish')}>
                  <Globe aria-hidden className="size-4" />
                  Make it live
                </Button>
              )}
            </>
          )}
        </div>
      </header>

      {data.status === 'draft' && data.canManage && (
        <p className="animate-fade-up rounded-2xl border border-status-screening/40 bg-status-screening/10 px-5 py-3 text-[15px] font-medium">
          This job is a draft, so nobody can see it yet. Make it live when you are ready.
        </p>
      )}

      <div className="relative w-full sm:w-80">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle"
        />
        <input
          type="search"
          aria-label="Search by name or email"
          placeholder="Search by name or email"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-11 w-full rounded-control border border-line-strong bg-sunken pr-3 pl-10 text-sm placeholder:text-subtle focus:border-accent focus:ring-3 focus:ring-accent/25 focus:outline-none"
        />
      </div>

      <div className="min-h-0 flex-1">
        {board.isPending ? (
          <div className="flex h-full gap-3 overflow-hidden" role="status" aria-label="Loading">
            {data.stages.map((stage) => (
              <Skeleton key={stage.id} className="min-h-96 min-w-64 flex-1 rounded-[20px]" />
            ))}
          </div>
        ) : board.isError ? (
          <ErrorState message="We could not load this board." onRetry={() => board.refetch()} />
        ) : (
          <PipelineBoard
            cid={cid}
            stages={data.stages}
            applications={board.data}
            canMove={canRunHiring(role)}
            flightRef={flightRef}
            onMove={(application, stage) => {
              if (stage.kind === 'rejected') {
                setRejection({ application, stage });
                return false;
              }
              move.mutate({ id: application.id, toStageId: stage.id });
              return true;
            }}
          />
        )}
      </div>

      <RejectDialog
        name={rejection?.application.candidate.fullName ?? ''}
        open={rejection !== null}
        onCancel={() => setRejection(null)}
        onConfirm={(reason) => {
          if (!rejection) return;
          flightRef.current?.(rejection.application.id, rejection.stage.id);
          move.mutate({
            id: rejection.application.id,
            toStageId: rejection.stage.id,
            reason,
          });
          setRejection(null);
        }}
      />

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit job">
        <div className="p-6">
          <JobForm
            initial={data}
            submitLabel="Save changes"
            onCancel={() => setEditing(false)}
            onSubmit={async (values) => {
              await update.mutateAsync(values);
              setEditing(false);
            }}
          />
        </div>
      </Dialog>

      <Dialog
        open={editingSteps}
        onClose={() => setEditingSteps(false)}
        title="Steps for this job"
        variant="sheet"
      >
        {editingSteps && (
          <StagesEditor
            cid={cid}
            jobId={id}
            stages={data.stages}
            onDone={() => setEditingSteps(false)}
          />
        )}
      </Dialog>
    </div>
  );
}
