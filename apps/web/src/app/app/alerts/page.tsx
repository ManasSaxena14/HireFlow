'use client';

import type { JobAlert } from '@hireflow/shared';
import { clsx } from 'clsx';
import { BellRing, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { AlertForm } from '@/components/feed/alert-form';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { useAlerts, useCreateAlert, useDeleteAlert, useUpdateAlert } from '@/lib/feed';
import { errorMessage } from '@/lib/forms';
import { timeAgo } from '@/lib/format';

const Chip = ({ children }: { children: string }) => (
  <li className="rounded-full bg-overlay px-3 py-1 text-[13px] font-semibold">{children}</li>
);

function AlertCard({ alert, onEdit }: { alert: JobAlert; onEdit: () => void }) {
  const update = useUpdateAlert();
  const remove = useDeleteAlert();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  const facts = [
    alert.frequency === 'instant' ? 'Emails right away' : 'Emails once a day',
    alert.locations.length > 0 ? `In ${alert.locations.join(', ')}` : 'Any place',
    ...(alert.remoteOnly ? ['Remote only'] : []),
    alert.sentCount === 1 ? '1 job sent' : `${alert.sentCount} jobs sent`,
    ...(alert.lastSentAt ? [`Last sent ${timeAgo(alert.lastSentAt)}`] : []),
  ];

  return (
    <li
      data-testid="alert-card"
      className={clsx(
        'rounded-[20px] border border-line bg-raised/60 p-5 sm:p-6',
        !alert.active && 'opacity-70',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-extrabold tracking-tight">
            {alert.name}
            {!alert.active && (
              <span className="ml-3 align-middle text-sm font-semibold text-muted">Paused</span>
            )}
          </h2>
          <p className="mt-1 text-[13px] text-muted">{facts.join(' · ')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={update.isPending}
            onClick={() =>
              update.mutate(
                { id: alert.id, active: !alert.active },
                { onError: (error) => toast(errorMessage(error), 'error') },
              )
            }
          >
            {alert.active ? 'Pause' : 'Turn on'}
          </Button>
          <Button variant="secondary" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        </div>
      </div>
      <ul aria-label="Keywords" className="mt-4 flex flex-wrap gap-1.5">
        {alert.keywords.map((keyword) => (
          <Chip key={keyword}>{keyword}</Chip>
        ))}
      </ul>

      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Delete this alert?">
        <div className="space-y-5 p-6">
          <p className="text-[15px] text-muted">
            We will stop sending you jobs for {alert.name}. Jobs you already saved stay on your
            board.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(alert.id, {
                  onSuccess: () => toast('Alert deleted'),
                  onError: (error) => {
                    setConfirming(false);
                    toast(errorMessage(error), 'error');
                  },
                })
              }
            >
              Delete alert
            </Button>
          </div>
        </div>
      </Dialog>
    </li>
  );
}

export default function AlertsPage() {
  const { profile } = useAuth();
  const { data, isPending, isError, refetch } = useAlerts();
  const create = useCreateAlert();
  const update = useUpdateAlert();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<JobAlert | null>(null);

  return (
    <div className="flex min-h-full flex-col p-4 sm:p-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl font-extrabold tracking-tight sm:text-7xl">
            Job alerts
          </h1>
          <p className="mt-2 text-[15px] text-muted">
            Tell us what you want, and we will email you each new job once.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus aria-hidden className="size-4" />
          New alert
        </Button>
      </header>

      {profile && !profile.emailVerifiedAt && (
        <p
          role="status"
          className="mb-4 rounded-2xl border border-line-strong bg-raised p-4 text-[15px]"
        >
          Please confirm your email to get alerts. We only send them to a confirmed address.{' '}
          <Link href="/app/settings" className="font-semibold underline underline-offset-4">
            Go to settings
          </Link>
        </p>
      )}

      {isPending ? (
        <div role="status" aria-label="Loading alerts">
          <Skeleton className="h-36 rounded-[20px]" />
        </div>
      ) : isError ? (
        <ErrorState message="We could not load your alerts." onRetry={() => refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          className="flex-1"
          title="No alerts yet"
          icon={<BellRing aria-hidden className="size-9" />}
          action={
            <Button size="lg" onClick={() => setAdding(true)}>
              Set up your first alert
            </Button>
          }
        >
          Pick a few keywords and stop checking job boards yourself.
        </EmptyState>
      ) : (
        <ul className="grid gap-2.5 2xl:grid-cols-2">
          {data.map((alert) => (
            <AlertCard key={alert.id} alert={alert} onEdit={() => setEditing(alert)} />
          ))}
        </ul>
      )}

      <Dialog open={adding} onClose={() => setAdding(false)} title="New job alert">
        <AlertForm
          submitLabel="Save alert"
          onCancel={() => setAdding(false)}
          onSubmit={async (values) => {
            await create.mutateAsync(values);
            setAdding(false);
            toast('Alert saved. It will look at new jobs from now on.');
          }}
        />
      </Dialog>
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Edit job alert">
        {editing && (
          <AlertForm
            key={editing.id}
            initial={editing}
            submitLabel="Save changes"
            onCancel={() => setEditing(null)}
            onSubmit={async (values) => {
              await update.mutateAsync({ id: editing.id, ...values });
              setEditing(null);
              toast('Alert updated');
            }}
          />
        )}
      </Dialog>
    </div>
  );
}
