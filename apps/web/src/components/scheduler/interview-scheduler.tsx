'use client';

import type { CompanyMember, Interview, Slot } from '@hireflow/shared';
import { MAX_OFFERED_SLOTS } from '@hireflow/shared';
import { clsx } from 'clsx';
import { CalendarClock, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { DateTime } from 'luxon';
import Link from 'next/link';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormError, SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useMembers } from '@/lib/ats';
import { useAuth } from '@/lib/auth';
import { dayParts, formatTime, zoneLabel } from '@/lib/format';
import { errorMessage } from '@/lib/forms';
import {
  useBookInterview,
  useCreateOffer,
  useRescheduleInterview,
  useSuggestedSlots,
} from '@/lib/scheduler';

const LENGTHS = [15, 30, 45, 60, 90, 120];
const DAYS_SHOWN = 7;
const DAYS_AHEAD = 56;

type Mode = 'book' | 'offer';

function DayStrip({
  timeZone,
  selected,
  onSelect,
}: {
  timeZone: string;
  selected: string;
  onSelect: (day: string) => void;
}) {
  const [page, setPage] = useState(0);
  const today = useMemo(() => DateTime.now().setZone(timeZone).startOf('day'), [timeZone]);
  const days = Array.from({ length: DAYS_SHOWN }, (_, index) =>
    today.plus({ days: page * DAYS_SHOWN + index }),
  );
  return (
    <div className="flex items-stretch gap-1 sm:gap-1.5">
      <button
        type="button"
        aria-label="Earlier days"
        disabled={page === 0}
        onClick={() => setPage(page - 1)}
        className="grid w-6 shrink-0 place-items-center rounded-control sm:w-9 text-muted hover:bg-raised hover:text-fg disabled:opacity-30"
      >
        <ChevronLeft aria-hidden className="size-5" />
      </button>
      <div
        role="group"
        aria-label="Day"
        className="grid min-w-0 flex-1 grid-cols-7 gap-1 sm:gap-1.5"
      >
        {days.map((day) => {
          const value = day.toISODate() as string;
          const parts = dayParts(day.toUTC().toISO() as string, timeZone);
          const active = value === selected;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              aria-label={parts.long}
              onClick={() => onSelect(value)}
              className={clsx(
                'rounded-2xl border py-2 text-center transition',
                active
                  ? 'border-accent bg-accent text-on-accent'
                  : 'border-line-strong hover:border-accent',
              )}
            >
              <span className="block text-[10px] font-bold uppercase sm:text-[11px]">
                {parts.weekday}
              </span>
              <span className="font-display block text-xl font-extrabold">{parts.day}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-label="Later days"
        disabled={(page + 1) * DAYS_SHOWN >= DAYS_AHEAD}
        onClick={() => setPage(page + 1)}
        className="grid w-6 shrink-0 place-items-center rounded-control sm:w-9 text-muted hover:bg-raised hover:text-fg disabled:opacity-30"
      >
        <ChevronRight aria-hidden className="size-5" />
      </button>
    </div>
  );
}

interface SchedulerProps {
  cid: string;
  applicationId: string;
  candidateName: string;
  open: boolean;
  onClose: () => void;
  /** Set this to choose a new time for an interview that is already booked. */
  moving?: Interview | null;
}

export function InterviewScheduler({
  cid,
  applicationId,
  candidateName,
  open,
  onClose,
  moving,
}: SchedulerProps) {
  const { profile } = useAuth();
  const timeZone = profile?.timezone ?? 'UTC';
  const toast = useToast();
  const members = useMembers(cid, open);
  const today = useMemo(
    () => DateTime.now().setZone(timeZone).startOf('day').toISODate() as string,
    [timeZone],
  );

  const [mode, setMode] = useState<Mode>('book');
  const [interviewerId, setInterviewerId] = useState('');
  const [durationMin, setDurationMin] = useState(60);
  const [day, setDay] = useState(today);
  const [picked, setPicked] = useState<string[]>([]);
  const [meetingUrl, setMeetingUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode('book');
    setDay(today);
    setPicked([]);
    setProblem(null);
    setLink(null);
    setMeetingUrl('');
    setNotes('');
    if (moving) {
      setInterviewerId(moving.interviewer.id);
      setDurationMin((Date.parse(moving.end) - Date.parse(moving.start)) / 60_000);
    }
  }, [open, moving, today]);

  const interviewer =
    interviewerId ||
    members.data?.find((member) => member.role === 'interviewer')?.userId ||
    members.data?.[0]?.userId ||
    '';

  const search = useMemo(() => {
    const start = DateTime.fromISO(day, { zone: timeZone }).startOf('day');
    return {
      applicationId,
      interviewerIds: [interviewer],
      durationMin,
      from: start.toUTC().toISO() as string,
      to: start.plus({ days: 1 }).toUTC().toISO() as string,
      ...(moving ? { ignoreInterviewId: moving.id } : {}),
    };
  }, [applicationId, day, durationMin, interviewer, moving, timeZone]);

  const slots = useSuggestedSlots(cid, search, open && Boolean(interviewer));
  const book = useBookInterview(cid);
  const offer = useCreateOffer(cid);
  const reschedule = useRescheduleInterview(cid);
  const busy = book.isPending || offer.isPending || reschedule.isPending;
  const many = mode === 'offer' && !moving;

  const toggle = (slot: Slot) => {
    setProblem(null);
    if (!many) {
      setPicked([slot.start]);
      return;
    }
    setPicked((current) =>
      current.includes(slot.start)
        ? current.filter((start) => start !== slot.start)
        : current.length < MAX_OFFERED_SLOTS
          ? [...current, slot.start]
          : current,
    );
  };

  const onFailure = (error: unknown) => {
    setProblem(errorMessage(error));
    setPicked([]);
    void slots.refetch();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const first = picked[0];
    if (!first) {
      setProblem(many ? 'Please pick at least one time.' : 'Please pick a time.');
      return;
    }
    setProblem(null);
    if (moving) {
      reschedule.mutate(
        { id: moving.id, start: first },
        {
          onSuccess: () => {
            toast('Interview moved. We told everyone by email.');
            onClose();
          },
          onError: onFailure,
        },
      );
    } else if (many) {
      offer.mutate(
        {
          applicationId,
          interviewerId: interviewer,
          durationMin,
          slots: picked,
          meetingUrl,
          notes,
        },
        {
          onSuccess: (created) => {
            toast('Times sent by email');
            setLink(created.bookingUrl);
          },
          onError: onFailure,
        },
      );
    } else {
      book.mutate(
        { applicationId, interviewerId: interviewer, durationMin, start: first, meetingUrl, notes },
        {
          onSuccess: () => {
            toast('Interview booked. We told everyone by email.');
            onClose();
          },
          onError: onFailure,
        },
      );
    }
  };

  const title = moving ? `New time for ${candidateName}` : `Interview with ${candidateName}`;

  return (
    <Dialog open={open} onClose={onClose} title={title} variant="sheet">
      {link ? (
        <div className="space-y-5 p-6">
          <p className="font-display text-4xl font-extrabold tracking-tight">Times sent</p>
          <p className="text-[15px] text-muted">
            We emailed {candidateName} a link to pick one of the times. You can also share the link
            yourself.
          </p>
          <p
            data-testid="booking-link"
            className="rounded-2xl border border-line-strong bg-sunken p-4 text-sm break-all"
          >
            {link}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                void navigator.clipboard?.writeText(link).then(() => toast('Link copied'))
              }
            >
              <Copy aria-hidden className="size-4" />
              Copy link
            </Button>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5 p-4 sm:p-6">
          {!moving && (
            <div role="group" aria-label="How to book" className="grid grid-cols-2 gap-1.5">
              {(
                [
                  ['book', 'Pick the time'],
                  ['offer', 'Let them choose'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  onClick={() => {
                    setMode(value);
                    setPicked([]);
                  }}
                  className={clsx(
                    'h-12 rounded-control border text-sm font-bold transition',
                    mode === value
                      ? 'border-accent bg-accent text-on-accent'
                      : 'border-line-strong text-muted hover:text-fg',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <SelectField
              label="Interviewer"
              value={interviewer}
              disabled={Boolean(moving)}
              onChange={(event) => {
                setInterviewerId(event.target.value);
                setPicked([]);
              }}
            >
              {moving && !members.data?.some((m) => m.userId === moving.interviewer.id) && (
                <option value={moving.interviewer.id}>{moving.interviewer.fullName}</option>
              )}
              {members.data?.map((member: CompanyMember) => (
                <option key={member.userId} value={member.userId}>
                  {member.fullName}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Length"
              value={durationMin}
              onChange={(event) => {
                setDurationMin(Number(event.target.value));
                setPicked([]);
              }}
            >
              {[...new Set([...LENGTHS, durationMin])]
                .sort((a, b) => a - b)
                .map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} minutes
                  </option>
                ))}
            </SelectField>
          </div>

          <DayStrip
            timeZone={timeZone}
            selected={day}
            onSelect={(value) => {
              setDay(value);
              if (!many) setPicked([]);
            }}
          />

          <section aria-label="Free times">
            <p className="mb-2.5 text-[13px] text-muted">
              Times are in {zoneLabel(timeZone)}.
              {many && ` Pick up to ${MAX_OFFERED_SLOTS}, across any days.`}
            </p>
            {slots.isPending && interviewer ? (
              <Skeleton className="h-32" />
            ) : slots.isError ? (
              <FormError>{errorMessage(slots.error)}</FormError>
            ) : slots.data?.slots.length ? (
              <div data-testid="slots" className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {slots.data.slots.map((slot) => {
                  const active = picked.includes(slot.start);
                  return (
                    <button
                      key={slot.start}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggle(slot)}
                      className={clsx(
                        'h-11 rounded-control border text-sm font-bold transition',
                        active
                          ? 'border-accent bg-accent text-on-accent'
                          : 'border-line-strong hover:border-accent',
                      )}
                    >
                      {formatTime(slot.start, timeZone)}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-line-strong p-6 text-center">
                <CalendarClock aria-hidden className="mx-auto mb-2 size-6 text-muted" />
                <p className="text-[15px] font-semibold">No free times on this day</p>
                <p className="mt-1 text-[13px] text-muted">
                  Try another day. The interviewer may also need to set their hours in{' '}
                  <Link href={`/company/${cid}/availability`} className="underline">
                    My hours
                  </Link>
                  .
                </p>
              </div>
            )}
            {many && picked.length > 0 && (
              <p data-testid="picked-count" className="mt-2.5 text-sm font-semibold">
                {picked.length} {picked.length === 1 ? 'time' : 'times'} picked
              </p>
            )}
          </section>

          {!moving && (
            <>
              <TextField
                label="Meeting link (optional)"
                placeholder="https://"
                value={meetingUrl}
                onChange={(event) => setMeetingUrl(event.target.value)}
              />
              <TextAreaField
                label="Notes for the team (optional)"
                hint="The candidate will not see these."
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </>
          )}

          <FormError>{problem}</FormError>
          <Button type="submit" size="lg" loading={busy} className="w-full">
            {moving ? 'Move interview' : many ? 'Send times by email' : 'Book interview'}
          </Button>
        </form>
      )}
    </Dialog>
  );
}
