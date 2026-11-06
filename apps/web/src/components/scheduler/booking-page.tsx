'use client';

import type { PublicOffer, Slot } from '@hireflow/shared';
import { clsx } from 'clsx';
import { CalendarPlus, CircleCheck, LoaderCircle, Video } from 'lucide-react';
import { DateTime } from 'luxon';
import { useMemo, useState } from 'react';
import { Logo } from '@/components/logo';
import { Button, buttonClass } from '@/components/ui/button';
import { FormError } from '@/components/ui/field';
import { ApiError } from '@/lib/api';
import { dayParts, formatTime, zoneLabel } from '@/lib/format';
import { errorMessage } from '@/lib/forms';
import { useBookOffer, usePublicOffer } from '@/lib/scheduler';

function Frame({
  band,
  title,
  children,
}: {
  band: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="bg-accent px-5 pt-6 pb-10 text-on-accent sm:px-[4vw] sm:pb-14">
        <p className="text-[15px] font-bold">{band}</p>
        <h1 className="font-display animate-fade-up mt-12 text-[clamp(2.75rem,7vw,7.5rem)] leading-[0.95] font-extrabold tracking-tight">
          {title}
        </h1>
      </header>
      <main className="flex-1 px-5 py-8 sm:px-[4vw] sm:py-12">{children}</main>
      <footer className="flex items-center gap-2 border-t border-line px-5 py-5 text-[13px] text-muted sm:px-[4vw]">
        Booked through <Logo className="text-sm" />
      </footer>
    </div>
  );
}

function Booked({ offer, timeZone }: { offer: PublicOffer; timeZone: string }) {
  const booked = offer.booked;
  if (!booked) return null;
  return (
    <Frame band={`${offer.jobTitle} at ${offer.companyName}`} title="You are booked">
      <div data-testid="booked" className="animate-fade-up max-w-3xl">
        <CircleCheck aria-hidden className="mb-4 size-14 text-success" />
        <p className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          {dayParts(booked.start, timeZone).long}
        </p>
        <p className="mt-2 text-2xl font-semibold">
          {formatTime(booked.start, timeZone)} – {formatTime(booked.end, timeZone)}
        </p>
        <p className="mt-1 text-[15px] text-muted">
          {zoneLabel(timeZone)}. You will meet {offer.interviewerName}.
        </p>
        <div className="mt-7 flex flex-wrap gap-2">
          <a href={booked.calendarUrl} className={buttonClass('primary', 'lg')}>
            <CalendarPlus aria-hidden className="size-5" />
            Add to calendar
          </a>
          {booked.meetingUrl && (
            <a
              href={booked.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass('secondary', 'lg')}
            >
              <Video aria-hidden className="size-5" />
              Meeting link
            </a>
          )}
        </div>
        <p className="mt-6 text-[15px] text-muted">
          We sent this to your email too. We will also send you a reminder before the interview. If
          you need to change the time, please contact {offer.companyName}.
        </p>
      </div>
    </Frame>
  );
}

const ENDED = {
  expired: ['This link has run out', 'Please ask the company to send you a new one.'],
  withdrawn: ['This link no longer works', 'Please contact the company if you have a question.'],
  booked: ['This time is booked', 'Please check your email for the details.'],
} as const;

export function BookingPage({ token }: { token: string }) {
  const { data: offer, isPending, isError, error, refetch } = usePublicOffer(token);
  const book = useBookOffer(token);
  const [picked, setPicked] = useState<string | null>(null);
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const days = useMemo(() => {
    const groups = new Map<string, Slot[]>();
    for (const slot of offer?.slots ?? []) {
      const key = DateTime.fromISO(slot.start, { zone: timeZone }).toISODate() as string;
      groups.set(key, [...(groups.get(key) ?? []), slot]);
    }
    return [...groups.values()];
  }, [offer?.slots, timeZone]);

  if (isPending) {
    return (
      <div
        className="grid min-h-dvh place-items-center bg-canvas"
        role="status"
        aria-label="Loading"
      >
        <LoaderCircle aria-hidden className="size-6 animate-spin text-muted" />
      </div>
    );
  }
  if (isError || !offer) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <Frame band="HireFlow" title={missing ? 'This link does not work' : 'Something went wrong'}>
        <p className="text-lg text-muted">
          {missing
            ? 'Please check that you opened the full link from your email.'
            : 'We could not load this page. Please try again.'}
        </p>
        {!missing && (
          <Button className="mt-5" onClick={() => refetch()}>
            Try again
          </Button>
        )}
      </Frame>
    );
  }
  if (offer.booked) return <Booked offer={offer} timeZone={timeZone} />;
  if (offer.status !== 'open') {
    const [title, note] = ENDED[offer.status];
    return (
      <Frame band={`${offer.jobTitle} at ${offer.companyName}`} title={title}>
        <p className="text-lg text-muted">{note}</p>
      </Frame>
    );
  }

  const firstName = offer.candidateName.split(' ')[0];
  const stillFree = offer.slots.some((slot) => slot.start === picked);

  return (
    <Frame band={`${offer.jobTitle} at ${offer.companyName}`} title={`${firstName}, pick a time`}>
      <p className="mb-8 text-lg text-muted">
        You will meet {offer.interviewerName} for {offer.durationMin} minutes. Times are in{' '}
        <span className="font-semibold text-fg">{zoneLabel(timeZone)}</span>.
      </p>
      {days.length === 0 ? (
        <p className="text-lg font-semibold">
          All of these times have been taken. Please ask {offer.companyName} to send new ones.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {days.map((slots, index) => (
            <section
              key={slots[0]?.start}
              className="animate-fade-up rounded-[24px] border border-line bg-raised/60 p-5"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <h2 className="font-display mb-4 text-2xl font-extrabold tracking-tight">
                {dayParts((slots[0] as Slot).start, timeZone).long}
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {slots.map((slot) => (
                  <button
                    key={slot.start}
                    type="button"
                    aria-pressed={picked === slot.start}
                    onClick={() => setPicked(slot.start)}
                    className={clsx(
                      'h-14 rounded-control border text-base font-bold transition',
                      picked === slot.start
                        ? 'border-accent bg-accent text-on-accent'
                        : 'border-line-strong hover:border-accent',
                    )}
                  >
                    {formatTime(slot.start, timeZone)}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <div className="mt-6 max-w-xl space-y-3">
        {book.isError && <FormError>{errorMessage(book.error)}</FormError>}
        {days.length > 0 && (
          <Button
            size="xl"
            loading={book.isPending}
            disabled={!stillFree}
            onClick={() => picked && book.mutate(picked, { onError: () => setPicked(null) })}
            className="w-full"
          >
            Book this time
          </Button>
        )}
      </div>
    </Frame>
  );
}
