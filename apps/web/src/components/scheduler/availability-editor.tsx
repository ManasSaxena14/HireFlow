'use client';

import type { Availability } from '@hireflow/shared';
import { clsx } from 'clsx';
import { Plus, Trash2 } from 'lucide-react';
import { DateTime } from 'luxon';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FormError, SelectField, TextField } from '@/components/ui/field';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { zoneLabel } from '@/lib/format';
import { errorMessage } from '@/lib/forms';
import { useAvailability, useSaveAvailability } from '@/lib/scheduler';

const WEEK = [
  [1, 'Monday'],
  [2, 'Tuesday'],
  [3, 'Wednesday'],
  [4, 'Thursday'],
  [5, 'Friday'],
  [6, 'Saturday'],
  [0, 'Sunday'],
] as const;
const WORK_DAYS = [1, 2, 3, 4, 5];

interface HoursDraft {
  key: string;
  weekday: number;
  startTime: string;
  endTime: string;
  validFrom: string | null;
  validTo: string | null;
}

interface BlockDraft {
  key: string;
  start: string;
  end: string;
  reason: string;
}

const LOCAL_INPUT = "yyyy-MM-dd'T'HH:mm";
let nextKey = 0;
const newKey = () => `new-${nextKey++}`;

const hours = (weekday: number, startTime = '09:00', endTime = '17:00'): HoursDraft => ({
  key: newKey(),
  weekday,
  startTime,
  endTime,
  validFrom: null,
  validTo: null,
});

function Editor({ cid, saved }: { cid: string; saved: Availability }) {
  const toast = useToast();
  const save = useSaveAvailability(cid);
  const zones = useMemo(() => Intl.supportedValuesOf('timeZone'), []);
  const [timezone, setTimezone] = useState(saved.timezone);
  const [rules, setRules] = useState<HoursDraft[]>(() =>
    saved.rules.map((rule) => ({ ...rule, key: rule.id })),
  );
  const [blocks, setBlocks] = useState<BlockDraft[]>(() =>
    saved.blocks.map((block) => ({
      key: block.id,
      start: DateTime.fromISO(block.start, { zone: saved.timezone }).toFormat(LOCAL_INPUT),
      end: DateTime.fromISO(block.end, { zone: saved.timezone }).toFormat(LOCAL_INPUT),
      reason: block.reason ?? '',
    })),
  );
  const [problem, setProblem] = useState<string | null>(null);

  const updateRule = (key: string, change: Partial<HoursDraft>) =>
    setRules((current) =>
      current.map((rule) => (rule.key === key ? { ...rule, ...change } : rule)),
    );
  const removeRule = (key: string) =>
    setRules((current) => current.filter((rule) => rule.key !== key));
  const updateBlock = (key: string, change: Partial<BlockDraft>) =>
    setBlocks((current) =>
      current.map((block) => (block.key === key ? { ...block, ...change } : block)),
    );

  const copyToWorkDays = (weekday: number) => {
    const source = rules.filter((rule) => rule.weekday === weekday);
    setRules((current) => [
      ...current.filter((rule) => !WORK_DAYS.includes(rule.weekday) || rule.weekday === weekday),
      ...WORK_DAYS.filter((day) => day !== weekday).flatMap((day) =>
        source.map((rule) => hours(day, rule.startTime, rule.endTime)),
      ),
    ]);
  };

  const submit = () => {
    if (rules.some((rule) => rule.endTime <= rule.startTime)) {
      setProblem('Each end time must be after its start time.');
      return;
    }
    const toInstant = (value: string) =>
      DateTime.fromISO(value, { zone: timezone }).toUTC().toISO();
    const cleanBlocks = blocks.map((block) => ({
      start: block.start ? toInstant(block.start) : null,
      end: block.end ? toInstant(block.end) : null,
      reason: block.reason,
    }));
    if (cleanBlocks.some((block) => !block.start || !block.end)) {
      setProblem('Please choose a start and an end for each day off.');
      return;
    }
    if (cleanBlocks.some((block) => (block.end as string) <= (block.start as string))) {
      setProblem('Each day off must end after it starts.');
      return;
    }
    setProblem(null);
    save.mutate(
      {
        timezone,
        rules: rules.map(({ key: _key, ...rule }) => rule),
        blocks: cleanBlocks as { start: string; end: string; reason: string }[],
      },
      {
        onSuccess: () => toast('Your hours are saved'),
        onError: (error) => setProblem(errorMessage(error)),
      },
    );
  };

  return (
    <div className="grid items-start gap-4 p-4 sm:p-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className="animate-fade-up rounded-[24px] border border-line bg-raised/60 p-5 sm:p-8">
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-6xl">
          My hours
        </h1>
        <p className="mt-2 mb-6 text-lg text-muted">
          Interviews can only be offered in these hours. Your clock stays the same when the clocks
          change.
        </p>
        <ul className="divide-y divide-line">
          {WEEK.map(([weekday, name]) => {
            const windows = rules.filter((rule) => rule.weekday === weekday);
            const isOn = windows.length > 0;
            return (
              <li
                key={weekday}
                data-testid={`day-${name.toLowerCase()}`}
                className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3.5"
              >
                <label className="flex h-11 w-40 cursor-pointer items-center gap-3 text-[15px] font-bold">
                  <input
                    type="checkbox"
                    checked={isOn}
                    onChange={(event) =>
                      event.target.checked
                        ? setRules((current) => [...current, hours(weekday)])
                        : setRules((current) => current.filter((rule) => rule.weekday !== weekday))
                    }
                    className="size-5 accent-accent"
                  />
                  {name}
                </label>
                {isOn ? (
                  <div className="min-w-64 flex-1 space-y-2">
                    {windows.map((rule) => (
                      <div key={rule.key} className="flex flex-wrap items-center gap-2">
                        <input
                          type="time"
                          step={900}
                          aria-label={`${name} start`}
                          value={rule.startTime}
                          onChange={(event) =>
                            updateRule(rule.key, { startTime: event.target.value })
                          }
                          className="h-11 rounded-control border border-line-strong bg-sunken px-3 text-[15px] font-semibold"
                        />
                        <span className="text-sm text-muted">to</span>
                        <input
                          type="time"
                          step={900}
                          aria-label={`${name} end`}
                          value={rule.endTime}
                          onChange={(event) =>
                            updateRule(rule.key, { endTime: event.target.value })
                          }
                          className={clsx(
                            'h-11 rounded-control border bg-sunken px-3 text-[15px] font-semibold',
                            rule.endTime <= rule.startTime ? 'border-danger' : 'border-line-strong',
                          )}
                        />
                        <button
                          type="button"
                          aria-label={`Remove these ${name} hours`}
                          onClick={() => removeRule(rule.key)}
                          className="grid size-10 place-items-center rounded-control text-muted hover:bg-danger-soft hover:text-danger"
                        >
                          <Trash2 aria-hidden className="size-4" />
                        </button>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setRules((current) => [...current, hours(weekday, '13:00', '17:00')])
                        }
                      >
                        <Plus aria-hidden className="size-4" />
                        Add more hours
                      </Button>
                      {WORK_DAYS.includes(weekday) && (
                        <Button variant="ghost" size="sm" onClick={() => copyToWorkDays(weekday)}>
                          Use for Monday to Friday
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="flex h-11 items-center text-[15px] text-subtle">Not working</p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="space-y-4">
        <section
          className="animate-fade-up rounded-[24px] border border-line bg-raised/60 p-5 sm:p-8"
          style={{ animationDelay: '80ms' }}
        >
          <h2 className="font-display text-3xl font-extrabold tracking-tight">Time zone</h2>
          <p className="mt-1.5 mb-5 text-[15px] text-muted">
            The hours on this page use this zone.
          </p>
          <SelectField
            label="Time zone"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
          >
            {!zones.includes(timezone) && <option value={timezone}>{zoneLabel(timezone)}</option>}
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zoneLabel(zone)}
              </option>
            ))}
          </SelectField>
        </section>

        <section
          className="animate-fade-up rounded-[24px] border border-line bg-raised/60 p-5 sm:p-8"
          style={{ animationDelay: '140ms' }}
        >
          <h2 className="font-display text-3xl font-extrabold tracking-tight">Days off</h2>
          <p className="mt-1.5 mb-5 text-[15px] text-muted">
            Add a holiday or any time you are away. Nobody can be offered these times.
          </p>
          <div className="space-y-4">
            {blocks.map((block, index) => (
              <div
                key={block.key}
                data-testid="day-off"
                className="space-y-3 rounded-2xl border border-line-strong p-4"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    label="From"
                    type="datetime-local"
                    value={block.start}
                    onChange={(event) => updateBlock(block.key, { start: event.target.value })}
                  />
                  <TextField
                    label="Until"
                    type="datetime-local"
                    value={block.end}
                    onChange={(event) => updateBlock(block.key, { end: event.target.value })}
                  />
                </div>
                <TextField
                  label="Reason (optional)"
                  value={block.reason}
                  onChange={(event) => updateBlock(block.key, { reason: event.target.value })}
                />
                <Button
                  variant="danger"
                  size="sm"
                  aria-label={`Remove day off ${index + 1}`}
                  onClick={() =>
                    setBlocks((current) => current.filter((item) => item.key !== block.key))
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              variant="secondary"
              onClick={() =>
                setBlocks((current) => [
                  ...current,
                  { key: newKey(), start: '', end: '', reason: '' },
                ])
              }
            >
              <Plus aria-hidden className="size-4" />
              Add a day off
            </Button>
          </div>
        </section>

        <FormError>{problem}</FormError>
        <Button size="lg" loading={save.isPending} onClick={submit} className="w-full">
          Save my hours
        </Button>
      </div>
    </div>
  );
}

export function AvailabilityEditor({ cid }: { cid: string }) {
  const { data, isPending, isError, refetch } = useAvailability(cid);
  // Starts again from what was saved if the data changes in another tab.
  const [version, setVersion] = useState(0);
  useEffect(() => setVersion((value) => value + 1), [data?.timezone]);

  if (isPending) {
    return (
      <div className="p-4 sm:p-6" role="status" aria-label="Loading your hours">
        <Skeleton className="h-96 rounded-[24px]" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="p-4 sm:p-6">
        <ErrorState message="We could not load your hours." onRetry={() => refetch()} />
      </div>
    );
  }
  return <Editor key={version} cid={cid} saved={data} />;
}
