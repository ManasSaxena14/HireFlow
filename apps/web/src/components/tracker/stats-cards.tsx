'use client';

import { Skeleton } from '@/components/ui/states';
import { useStats } from '@/lib/tracker';

const FUNNEL_LABELS = {
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
} as const;

function Stat({
  label,
  value,
  note,
  className,
}: {
  label: string;
  value: string;
  note?: string;
  className?: string;
}) {
  return (
    <div className={`bg-sunken px-4 py-3.5 ${className ?? ''}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {note && <p className="mt-0.5 text-[11px] text-subtle">{note}</p>}
    </div>
  );
}

export function StatsCards() {
  const { data, isPending, isError } = useStats();

  if (isError) return null;
  if (isPending || !data) return <Skeleton className="h-27" />;

  const { byStatus, perWeek, responseRate, funnel } = data;
  const active = byStatus.applied + byStatus.screening + byStatus.interview + byStatus.offer;
  const thisWeek = perWeek.at(-1)?.count ?? 0;
  const lastWeek = perWeek.at(-2)?.count ?? 0;
  const widest = Math.max(funnel.applied, 1);

  return (
    <div
      data-testid="stats"
      className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line lg:grid-cols-[1fr_1fr_1fr_minmax(0,1.8fr)]"
    >
      <Stat label="In progress" value={String(active)} note={`${byStatus.saved} saved to apply`} />
      <Stat label="Applied this week" value={String(thisWeek)} note={`${lastWeek} last week`} />
      <Stat
        label="Response rate"
        className="col-span-2 lg:col-span-1"
        value={responseRate === null ? '—' : `${Math.round(responseRate * 100)}%`}
        note={responseRate === null ? 'Apply to see this' : 'Of everything applied to'}
      />
      <div className="col-span-2 bg-sunken px-4 py-3.5 lg:col-span-1">
        <p className="text-xs text-muted">Funnel</p>
        <dl className="mt-2 space-y-1">
          {(Object.keys(FUNNEL_LABELS) as (keyof typeof FUNNEL_LABELS)[]).map((stage) => (
            <div key={stage} className="flex items-center gap-2 text-[11px]">
              <dt className="w-14 shrink-0 text-muted">{FUNNEL_LABELS[stage]}</dt>
              <dd className="flex min-w-0 flex-1 items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-overlay">
                  <span
                    className="block h-full rounded-full bg-accent"
                    style={{ width: `${(funnel[stage] / widest) * 100}%` }}
                  />
                </span>
                <span className="w-5 text-right font-mono text-fg">{funnel[stage]}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
