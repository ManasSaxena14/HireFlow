'use client';

import { FUNNEL_STEPS, type FunnelStep } from '@hireflow/shared';
import { BarChart3 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BarList } from '@/components/ui/bar-list';
import { SelectField } from '@/components/ui/field';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useFunnel, useSources, useTimeToHire } from '@/lib/analytics';
import { canRunHiring, useJobs } from '@/lib/ats';
import { useCompanyRole } from '../use-membership';

const STEP_LABELS: Record<FunnelStep, string> = {
  applied: 'Applied',
  screening: 'First round',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
};

const RANGES = [
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 365, label: 'Last 12 months' },
] as const;

const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const daysLabel = (value: number | null) =>
  value === null ? '–' : value === 1 ? '1 day' : `${value} days`;

function Panel({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[20px] border border-line bg-raised/60 p-5 sm:p-6">
      <h2 className="font-display text-2xl font-extrabold tracking-tight">{title}</h2>
      <p className="mt-1 mb-5 text-[13px] text-muted">{intro}</p>
      {children}
    </section>
  );
}

function Loading() {
  return <Skeleton className="h-40" />;
}

export default function NumbersPage() {
  const { cid, role } = useCompanyRole();
  const [days, setDays] = useState<number>(90);
  const [jobId, setJobId] = useState('');
  const filters = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - (days - 1) * 86_400_000);
    return { from: isoDay(from), to: isoDay(to), jobId };
  }, [days, jobId]);

  const jobs = useJobs(cid);
  const funnel = useFunnel(cid, filters);
  const time = useTimeToHire(cid, filters);
  const sources = useSources(cid, filters);

  if (!canRunHiring(role)) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState title="Not for your role" icon={<BarChart3 aria-hidden className="size-9" />}>
          Hiring numbers are for the people who run hiring in this company.
        </EmptyState>
      </div>
    );
  }

  const jobList = jobs.data?.items ?? [];

  return (
    <div className="flex min-h-full flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl font-extrabold tracking-tight sm:text-7xl">
            Numbers
          </h1>
          <p className="mt-2 text-[15px] text-muted">
            How people move through your hiring, how long it takes and where they come from.
          </p>
        </div>
        <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
          <SelectField
            label="Time"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            {RANGES.map((range) => (
              <option key={range.days} value={range.days}>
                {range.label}
              </option>
            ))}
          </SelectField>
          <SelectField label="Job" value={jobId} onChange={(event) => setJobId(event.target.value)}>
            <option value="">All jobs</option>
            {jobList.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </SelectField>
        </div>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Panel
          title="How far people get"
          intro="People who applied in this time, by the furthest step they reached. Someone turned down after an interview still counts as interviewed."
        >
          {funnel.isPending ? (
            <Loading />
          ) : funnel.isError ? (
            <ErrorState
              message="We could not load these numbers."
              onRetry={() => funnel.refetch()}
            />
          ) : funnel.data.total === 0 ? (
            <p className="text-[15px] text-muted">Nobody applied in this time.</p>
          ) : (
            <>
              <BarList
                label="How far people get"
                rows={funnel.data.steps.map((row, index) => {
                  const before = funnel.data.steps[index - 1]?.count;
                  return {
                    name: STEP_LABELS[row.step],
                    value: row.count,
                    note:
                      index === 0 || !before
                        ? undefined
                        : `${Math.round((row.count / before) * 100)}% of the step before`,
                  };
                })}
              />
              <p className="mt-4 text-[13px] text-muted">
                {funnel.data.rejected} of {funnel.data.total} were turned down.
              </p>
            </>
          )}
        </Panel>

        <Panel
          title="Time to hire"
          intro="From applying to being moved to a hired step, for people hired in this time."
        >
          {time.isPending ? (
            <Loading />
          ) : time.isError ? (
            <ErrorState message="We could not load these numbers." onRetry={() => time.refetch()} />
          ) : time.data.hires === 0 ? (
            <p className="text-[15px] text-muted">Nobody was hired in this time.</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Typical', time.data.medianDays],
                  ['Average', time.data.averageDays],
                  ['Fastest', time.data.fastestDays],
                  ['Slowest', time.data.slowestDays],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-2xl bg-sunken p-4">
                    <dt className="text-[13px] text-muted">{label}</dt>
                    <dd className="font-display mt-1 text-2xl font-extrabold tabular-nums">
                      {daysLabel(value as number | null)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 mb-4 text-[13px] text-muted">
                {time.data.hires === 1 ? '1 hire' : `${time.data.hires} hires`}. Typical means the
                middle value.
              </p>
              <BarList
                label="Typical days to hire by job"
                format={(value) => daysLabel(value)}
                rows={time.data.byJob.map((row) => ({
                  name: row.title,
                  value: row.medianDays,
                  note: row.hires === 1 ? '1 hire' : `${row.hires} hires`,
                }))}
              />
            </>
          )}
        </Panel>

        <Panel title="Where people come from" intro="What people told us when they applied.">
          {sources.isPending ? (
            <Loading />
          ) : sources.isError ? (
            <ErrorState
              message="We could not load these numbers."
              onRetry={() => sources.refetch()}
            />
          ) : sources.data.sources.length === 0 ? (
            <p className="text-[15px] text-muted">Nobody applied in this time.</p>
          ) : (
            <BarList
              label="Where people come from"
              rows={sources.data.sources.map((row) => ({
                name: row.source,
                value: row.applications,
                note: row.hires === 1 ? '1 hired' : `${row.hires} hired`,
              }))}
            />
          )}
        </Panel>
      </div>
      <p className="text-[13px] text-subtle">
        Steps are grouped by their type, so jobs with different step names can be added up. The
        steps are {FUNNEL_STEPS.map((step) => STEP_LABELS[step]).join(', ')}.
      </p>
    </div>
  );
}
