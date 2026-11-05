'use client';

import { TRACKER_STATUSES, type TrackerStatus } from '@hireflow/shared';
import { clsx } from 'clsx';
import { ArchiveRestore, Archive, ArrowUpRight, BellRing, Pencil } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormError, SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatSalary, timeAgo } from '@/lib/format';
import {
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
  return 'Could not reach the server. Please try again.';
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line px-5 py-5">
      <h3 className="mb-3 text-[13px] font-medium text-muted">{title}</h3>
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
        <ul className="mb-4 space-y-2" data-testid="reminders">
          {data.reminders.map((reminder) => (
            <li
              key={reminder.id}
              className="flex gap-3 rounded-control border border-line bg-raised p-3"
            >
              <BellRing
                aria-hidden
                className={clsx(
                  'mt-0.5 size-4 shrink-0',
                  reminder.sentAt ? 'text-subtle' : 'text-accent',
                )}
              />
              <div className="min-w-0">
                <p className="text-sm">{reminder.message}</p>
                <p className="mt-1 font-mono text-[11px] text-muted">
                  {reminder.sentAt ? 'Sent ' : ''}
                  {formatDateTime(reminder.sentAt ?? reminder.remindAt, timeZone)} · {timeZone}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-muted">No reminders yet.</p>
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
            label="About"
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
        <ul className="mt-4 space-y-3">
          {data?.map((note) => (
            <li key={note.id} className="border-l-2 border-line-strong pl-3">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{note.body}</p>
              <p className="mt-1 font-mono text-[11px] text-subtle">
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
    <ol className="space-y-4" data-testid="timeline">
      {[...(data ?? [])].reverse().map((event) => (
        <li key={event.id} className="relative pl-5">
          <span
            aria-hidden
            className="absolute top-1.5 left-0 size-2 rounded-full bg-line-strong"
          />
          <p className="text-sm">
            {event.fromStatus ? (
              <>
                {STATUS_LABELS[event.fromStatus]} <span className="text-subtle">→</span>{' '}
                <span className="font-medium">{STATUS_LABELS[event.toStatus]}</span>
              </>
            ) : (
              <>
                Added as <span className="font-medium">{STATUS_LABELS[event.toStatus]}</span>
              </>
            )}
          </p>
          {event.note && <p className="mt-0.5 text-[13px] text-muted">{event.note}</p>}
          <p className="mt-0.5 font-mono text-[11px] text-subtle">
            {formatDateTime(event.createdAt, profile?.timezone ?? 'UTC')}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function ApplicationDetails({ id, onArchived }: { id: string; onArchived?: () => void }) {
  const { data, isPending, isError, refetch } = useApplication(id);
  const move = useMoveApplication();
  const update = useUpdateApplication(id);
  const archive = useArchiveApplication();
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  if (isPending) {
    return (
      <div className="space-y-3 p-5" role="status" aria-label="Loading application">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="mt-6 h-24" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="p-5">
        <ErrorState message="This application could not be loaded." onRetry={() => refetch()} />
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

  return (
    <>
      <div className="px-5 pt-5 pb-5">
        <h1 className="text-xl leading-snug font-semibold tracking-tight">{data.title}</h1>
        <p className="mt-0.5 text-[15px] text-muted">{data.companyName}</p>

        <div className="mt-5 max-w-56">
          <SelectField
            label="Status"
            value={data.status}
            onChange={(event) => move.mutate({ id, toStatus: event.target.value as TrackerStatus })}
          >
            {TRACKER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </SelectField>
        </div>

        {facts.length > 0 && (
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="mt-0.5 text-sm">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {data.tags.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {data.tags.map((tag) => (
              <li key={tag} className="rounded-control bg-overlay px-2 py-0.5 text-xs text-muted">
                {tag}
              </li>
            ))}
          </ul>
        )}

        {data.description && (
          <p className="mt-4 max-h-48 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap text-muted">
            {data.description}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {data.jobUrl && (
            <a
              href={data.jobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-control border border-line-strong bg-raised px-3 text-[13px] font-medium hover:bg-overlay"
            >
              Job posting
              <ArrowUpRight aria-hidden className="size-3.5" />
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
                    toast('Application archived');
                    onArchived?.();
                  },
                  onError: () => toast('Could not archive that application.', 'error'),
                })
              }
            >
              <Archive aria-hidden className="size-3.5" />
              Archive
            </Button>
          )}
        </div>
      </div>

      <Block title="Reminders">
        <Reminders id={id} />
      </Block>
      <Block title="Notes">
        <Notes id={id} />
      </Block>
      <Block title="History">
        <Timeline id={id} />
      </Block>

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit application">
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
