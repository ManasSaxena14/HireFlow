'use client';

import { CalendarDays, Rocket } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Skeleton } from '@/components/ui/states';
import { useCountUp } from '@/lib/motion';
import { STATUS_COLORS, useStats } from '@/lib/tracker';

const STEPS = [
  { key: 'applied', label: 'Applied' },
  { key: 'screening', label: 'First round' },
  { key: 'interview', label: 'Interview' },
  { key: 'offer', label: 'Offer' },
] as const;

const Count = ({ value }: { value: number }) => <>{useCountUp(value)}</>;

export function StatsCards() {
  const { data, isPending, isError } = useStats();

  if (isError) return null;
  if (isPending || !data) return <Skeleton className="h-36 rounded-[20px]" />;

  const { byStatus, perWeek, responseRate, funnel } = data;
  const active = byStatus.applied + byStatus.screening + byStatus.interview + byStatus.offer;
  const thisWeek = perWeek.at(-1)?.count ?? 0;
  const lastWeek = perWeek.at(-2)?.count ?? 0;
  const tallest = Math.max(...perWeek.map((week) => week.count), 1);
  const widest = Math.max(funnel.applied, 1);
  const percent = responseRate === null ? null : Math.round(responseRate * 100);

  return (
    <div
      data-testid="stats"
      className="grid grid-cols-2 gap-3 xl:grid-cols-[1fr_1.25fr_1fr_1.75fr]"
    >
      <div className="glow-button animate-fade-up card-lift flex min-h-36 flex-col justify-between rounded-[20px] bg-accent p-5 text-on-accent">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Rocket aria-hidden className="size-4" />
          Active jobs
        </p>
        <div>
          <p className="font-display text-6xl leading-none font-extrabold tabular-nums">
            <Count value={active} />
          </p>
          <p className="mt-1 text-[13px] font-semibold">{byStatus.saved} saved for later</p>
        </div>
      </div>

      <div className="spot animate-fade-up card-lift flex min-h-36 flex-col justify-between rounded-[20px] border border-line bg-raised p-5 [animation-delay:70ms]">
        <p className="flex items-center gap-2 text-sm font-semibold text-muted">
          <CalendarDays aria-hidden className="size-4" />
          Applied this week
        </p>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-display text-6xl leading-none font-extrabold tabular-nums">
              <Count value={thisWeek} />
            </p>
            <p className="mt-1 text-[13px] text-muted">{lastWeek} last week</p>
          </div>
          <div aria-hidden className="hidden h-16 flex-1 items-end justify-end gap-1 sm:flex">
            {perWeek.map((week, index) => (
              <span
                key={week.weekStart}
                className={`w-2.5 rounded-full transition-[height] duration-700 ${index === perWeek.length - 1 ? 'bg-accent' : 'bg-line-strong'}`}
                style={{ height: `${Math.max((week.count / tallest) * 100, 10)}%` }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="spot animate-fade-up card-lift col-span-2 flex min-h-36 items-center justify-between gap-3 rounded-[20px] border border-line bg-raised p-5 [animation-delay:140ms] xl:col-span-1">
        <div>
          <p className="text-sm font-semibold text-muted">Reply rate</p>
          <p className="mt-2 text-[13px] leading-snug text-muted">
            {percent === null ? 'Apply to a job to see this' : 'Companies that replied to you'}
          </p>
        </div>
        <div
          className="ring-chart grid size-24 shrink-0 place-items-center rounded-full"
          style={{ '--ring': `${percent ?? 0}%` } as CSSProperties}
        >
          <span className="font-display grid size-[4.75rem] place-items-center rounded-full bg-raised text-2xl font-extrabold">
            {percent === null ? (
              '–'
            ) : (
              <>
                <Count value={percent} />%
              </>
            )}
          </span>
        </div>
      </div>

      <div className="spot animate-fade-up card-lift col-span-2 flex min-h-36 flex-col justify-between rounded-[20px] border border-line bg-raised p-5 [animation-delay:210ms] xl:col-span-1">
        <p className="text-sm font-semibold text-muted">How far you got</p>
        <dl className="mt-3 space-y-2">
          {STEPS.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-3 text-[13px]">
              <dt className="w-20 shrink-0 font-medium text-muted">{label}</dt>
              <dd className="flex min-w-0 flex-1 items-center gap-3">
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-overlay">
                  <span
                    className="animate-grow block h-full rounded-full transition-[width] duration-700"
                    style={{
                      width: `${(funnel[key] / widest) * 100}%`,
                      background: STATUS_COLORS[key],
                    }}
                  />
                </span>
                <span className="w-5 text-right font-bold tabular-nums">
                  <Count value={funnel[key]} />
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
