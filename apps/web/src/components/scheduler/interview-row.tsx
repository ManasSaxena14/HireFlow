'use client';

import { clsx } from 'clsx';
import { CalendarPlus, Video } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button, buttonClass } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { dayParts, formatTime } from '@/lib/format';
import { errorMessage } from '@/lib/forms';
import { downloadCalendarFile } from '@/lib/scheduler';

export function DateBlock({
  iso,
  timeZone,
  muted,
}: {
  iso: string;
  timeZone: string;
  muted?: boolean;
}) {
  const { weekday, day, month } = dayParts(iso, timeZone);
  return (
    <span
      className={clsx(
        'grid size-20 shrink-0 place-items-center rounded-2xl py-1.5 text-center leading-none',
        muted ? 'bg-overlay text-muted' : 'bg-accent text-on-accent',
      )}
    >
      <span className="text-[11px] font-bold tracking-wider uppercase">{weekday}</span>
      <span className="font-display text-3xl font-extrabold">{day}</span>
      <span className="text-[11px] font-bold tracking-wider uppercase">{month}</span>
    </span>
  );
}

export function CalendarButton({ id }: { id: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await downloadCalendarFile(id);
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="secondary" size="sm" loading={busy} onClick={save}>
      <CalendarPlus aria-hidden className="size-4" />
      Add to calendar
    </Button>
  );
}

export function JoinLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonClass('secondary', 'sm')}
    >
      <Video aria-hidden className="size-4" />
      Join
    </a>
  );
}

interface InterviewRowProps {
  start: string;
  end: string;
  timeZone: string;
  muted?: boolean;
  badge?: ReactNode;
  title: ReactNode;
  detail: ReactNode;
  children?: ReactNode;
}

export function InterviewRow({
  start,
  end,
  timeZone,
  muted,
  badge,
  title,
  detail,
  children,
}: InterviewRowProps) {
  return (
    <li
      data-testid="interview-row"
      className="animate-card-in flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[20px] border border-line bg-raised/60 p-4"
    >
      <DateBlock iso={start} timeZone={timeZone} muted={muted} />
      <div className="min-w-48 flex-1">
        <p className="font-display text-2xl font-extrabold tracking-tight">
          {formatTime(start, timeZone)} – {formatTime(end, timeZone)}
        </p>
        <p className="mt-0.5 text-[15px] font-semibold">{title}</p>
        <p className="mt-0.5 text-[13px] text-muted">{detail}</p>
      </div>
      {badge}
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </li>
  );
}
