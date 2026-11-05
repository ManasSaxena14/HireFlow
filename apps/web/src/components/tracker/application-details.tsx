'use client';

import { TRACKER_STATUSES } from '@hireflow/shared';
import { clsx } from 'clsx';
import { Archive, ArchiveRestore, ArrowUpRight, BellRing, Pencil } from 'lucide-react';
import { type CSSProperties, type FormEvent, type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormError, TextAreaField, TextField } from '@/components/ui/field';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatSalary, timeAgo } from '@/lib/format';
import {
  STATUS_COLORS,
  STATUS_LABELS,
  useAddNote,
  useAddReminder,
  useApplication,
  useArchiveApplication,
  useEvents,
  useMoveApplication,
  useNotes,
  useUpdateApplication,
} from '@/lib/tracker';
import { ApplicationForm } from './application-form';

function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.fieldIssues[0]?.message ?? error.message;
  return 'We could not reach the server. Please try again.';
}

function Block({ title, children, delay }: { title: string; children: ReactNode; delay: number }) {
  return (
    <section
      className="animate-fade-up rounded-[20px] border border-line bg-raised/60 p-5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <h3 className="font-display mb-4 text-xl font-extrabold tracking-tight">{title}</h3>
      {children}
    </section>
  );
}

function Reminders({ id }: { id: string }) {
  const { profile } = useAuth();
  const { data } = useApplication(id);
  const addReminder = useAddReminder(id);
  const [when, setWhen] = useState('');
  const [message, setMessage] = useState('');
  const timeZone = profile?.timezone ?? 'UTC';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    addReminder.mutate(
      { remindAt: when ? new Date(when).toISOString() : '', message },
      {
        onSuccess: () => {
          setWhen('');
          setMessage('');
        },
      },
    );
  };

  return (
    <>
      {data?.reminders.length ? (
        <ul className="mb-5 space-y-2.5" data-testid="reminders">
          {data.reminders.map((reminder) => (
            <li
              key={reminder.id}
              className="flex gap-3 rounded-2xl border border-line bg-overlay/60 p-3.5"
            >
              <span
                className={clsx(
                  'grid size-9 shrink-0 place-items-center rounded-xl',
                  reminder.sentAt ? 'bg-overlay text-subtle' : 'bg-accent text-on-accent',
                )}
              >
                <BellRing aria-hidden className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-medium">{reminder.message}</p>
                <p className="mt-1 text-xs text-muted">
                  {reminder.sentAt ? 'Sent on ' : ''}
                  {formatDateTime(reminder.sentAt ?? reminder.remindAt, timeZone)} ({timeZone})
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-5 text-[15px] text-muted">No reminders yet.</p>
      )}
      <form onSubmit={submit} noValidate className="space-y-3">
        {addReminder.isError && <FormError>{errorText(addReminder.error)}</FormError>}
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Remind me on"
            type="datetime-local"
            value={when}
            onChange={(event) => setWhen(event.target.value)}
          />
          <TextField
            label="What about?"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary" size="sm" loading={addReminder.isPending}>
          Add reminder
        </Button>
      </form>
    </>
  );
}

function Notes({ id }: { id: string }) {
  const { profile } = useAuth();
  const { data, isPending } = useNotes(id);
  const addNote = useAddNote(id);
  const [body, setBody] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    addNote.mutate(body, { onSuccess: () => setBody('') });
  };

  return (
    <>
      <form onSubmit={submit} noValidate className="space-y-3">
        {addNote.isError && <FormError>{errorText(addNote.error)}</FormError>}
        <TextAreaField
          label="Add a note"
          rows={2}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <Button type="submit" variant="secondary" size="sm" loading={addNote.isPending}>
          Save note
        </Button>
      </form>
      {isPending ? (
        <Skeleton className="mt-4 h-14" />
      ) : (
        <ul className="mt-5 space-y-3">
          {data?.map((note) => (
            <li key={note.id} className="animate-card-in border-l-3 border-accent pl-3.5">
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{note.body}</p>
              <p className="mt-1 text-xs text-subtle">
                {formatDateTime(note.createdAt, profile?.timezone ?? 'UTC')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Timeline({ id }: { id: string }) {
  const { profile } = useAuth();
  const { data, isPending } = useEvents(id);
  if (isPending) return <Skeleton className="h-14" />;
  return (
    <ol className="space-y-5 border-l-2 border-line pl-5" data-testid="timeline">
      {[...(data ?? [])].reverse().map((event) => (
        <li key={event.id} className="relative">
          <span
            aria-hidden
            className="absolute top-1.5 -left-[27px] size-3 rounded-full ring-4 ring-canvas"
            style={{ background: STATUS_COLORS[event.toStatus] }}
          />
          <p className="text-[15px]">
            {event.fromStatus ? (
              <>
                {STATUS_LABELS[event.fromStatus]} <span className="text-subtle">→</span>{' '}
                <span className="font-bold">{STATUS_LABELS[event.toStatus]}</span>
              </>
            ) : (
              <>
                Added as <span className="font-bold">{STATUS_LABELS[event.toStatus]}</span>
              </>
            )}
          </p>
          {event.note && <p className="mt-0.5 text-sm text-muted">{event.note}</p>}
          <p className="mt-0.5 text-xs text-subtle">
            {formatDateTime(event.createdAt, profile?.timezone ?? 'UTC')}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function ApplicationDetails({
  id,
  onArchived,
  layout = 'sheet',
}: {
  id: string;
  onArchived?: () => void;
  layout?: 'sheet' | 'page';
}) {
  const { data, isPending, isError, refetch } = useApplication(id);
  const move = useMoveApplication();
  const update = useUpdateApplication(id);
  const archive = useArchiveApplication();
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  if (isPending) {
    return (
      <div className="space-y-3 p-6" role="status" aria-label="Loading job">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="mt-6 h-32" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="p-6">
        <ErrorState message="We could not load this job." onRetry={() => refetch()} />
      </div>
    );
  }

  const salary = formatSalary(data.salaryMin, data.salaryMax, data.currency);
  const facts = [
    ['Location', data.location],
    ['Found on', data.source],
    ['Salary', salary],
    ['Applied', data.appliedAt ? timeAgo(data.appliedAt) : null],
  ].filter((fact): fact is [string, string] => Boolean(fact[1]));

  const overview = (
    <section className="animate-fade-up rounded-[20px] border border-line bg-raised/60 p-5 sm:p-6">
      <h1 className="font-display text-4xl leading-[1.05] font-extrabold tracking-tight">
        {data.title}
      </h1>
      <p className="mt-1.5 text-lg text-muted">{data.companyName}</p>

      <div role="group" aria-label="Status" className="mt-5 flex flex-wrap gap-1.5">
        {TRACKER_STATUSES.map((status) => {
          const current = data.status === status;
          return (
            <button
              key={status}
              type="button"
              aria-pressed={current}
              onClick={() => !current && move.mutate({ id, toStatus: status })}
              style={{ '--status': STATUS_COLORS[status] } as CSSProperties}
              className={clsx(
                'h-9 rounded-full border px-3.5 text-[13px] font-bold transition-colors',
                current
                  ? 'border-(--status) bg-(--status) text-on-accent'
                  : 'border-line-strong text-muted hover:border-(--status) hover:text-fg',
              )}
            >
              {STATUS_LABELS[status]}
            </button>
          );
        })}
      </div>

      {facts.length > 0 && (
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[13px] text-muted">{label}</dt>
              <dd className="mt-0.5 text-[15px] font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {data.tags.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-1.5">
          {data.tags.map((tag) => (
            <li key={tag} className="rounded-full bg-overlay px-3 py-1 text-[13px] text-muted">
              {tag}
            </li>
          ))}
        </ul>
      )}

      {data.description && (
        <p className="mt-5 max-h-56 overflow-y-auto text-[15px] leading-relaxed whitespace-pre-wrap text-muted">
          {data.description}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {data.jobUrl && (
          <a
            href={data.jobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-control border border-line-strong bg-raised px-3.5 text-[13px] font-semibold hover:bg-overlay"
          >
            Open job post
            <ArrowUpRight aria-hidden className="size-4" />
          </a>
        )}
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
          <Pencil aria-hidden className="size-3.5" />
          Edit
        </Button>
        {data.archivedAt ? (
          <Button
            variant="secondary"
            size="sm"
            loading={update.isPending}
            onClick={() => update.mutate({ archived: false })}
          >
            <ArchiveRestore aria-hidden className="size-3.5" />
            Restore
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            loading={archive.isPending}
            onClick={() =>
              archive.mutate(id, {
                onSuccess: () => {
                  toast('Job moved to archive');
                  onArchived?.();
                },
                onError: () => toast('We could not archive this job.', 'error'),
              })
            }
          >
            <Archive aria-hidden className="size-3.5" />
            Archive
          </Button>
        )}
      </div>
    </section>
  );

  const reminders = (
    <Block title="Reminders" delay={70}>
      <Reminders id={id} />
    </Block>
  );
  const notes = (
    <Block title="Notes" delay={140}>
      <Notes id={id} />
    </Block>
  );
  const history = (
    <Block title="History" delay={210}>
      <Timeline id={id} />
    </Block>
  );

  return (
    <>
      {layout === 'page' ? (
        <div className="grid items-start gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-1">
            {overview}
            {history}
          </div>
          <div className="xl:col-span-1">{reminders}</div>
          <div className="xl:col-span-1">{notes}</div>
        </div>
      ) : (
        <div className="space-y-4 p-4">
          {overview}
          {reminders}
          {notes}
          {history}
        </div>
      )}

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit job">
        <ApplicationForm
          initial={data}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            const { status: _status, ...fields } = values;
            await update.mutateAsync(fields);
            setEditing(false);
          }}
        />
      </Dialog>
    </>
  );
}
