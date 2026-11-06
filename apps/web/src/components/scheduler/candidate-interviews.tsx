'use client';

import type { AtsApplicationDetail, Interview } from '@hireflow/shared';
import { CalendarPlus, Clock3 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { zoneLabel } from '@/lib/format';
import { errorMessage } from '@/lib/forms';
import { formatInterviewTime } from '@hireflow/shared';
import { useApplicationInterviews, useCancelInterview, useWithdrawOffer } from '@/lib/scheduler';
import { CancelInterviewDialog } from './cancel-dialog';
import { CalendarButton, InterviewRow, JoinLink } from './interview-row';
import { InterviewScheduler } from './interview-scheduler';

const STATUS_WORDS: Record<Interview['status'], string> = {
  scheduled: 'Booked',
  completed: 'Done',
  cancelled: 'Cancelled',
  no_show: 'Did not come',
};

export function CandidateInterviews({
  cid,
  data,
  runsHiring,
}: {
  cid: string;
  data: AtsApplicationDetail;
  runsHiring: boolean;
}) {
  const { profile } = useAuth();
  const timeZone = profile?.timezone ?? 'UTC';
  const toast = useToast();
  const { data: schedule, isPending } = useApplicationInterviews(cid, data.id);
  const cancel = useCancelInterview(cid);
  const withdraw = useWithdrawOffer(cid);
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [moving, setMoving] = useState<Interview | null>(null);
  const [cancelling, setCancelling] = useState<Interview | null>(null);

  const stage = data.stages.find((item) => item.id === data.stageId);
  const finished = stage?.kind === 'rejected' || stage?.kind === 'hired';
  const openOffer = schedule?.offers.find((offer) => offer.status === 'open');

  return (
    <section
      data-testid="interviews-block"
      className="animate-fade-up rounded-[20px] border border-line bg-raised/60 p-5 sm:p-6"
      style={{ animationDelay: '40ms' }}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-extrabold tracking-tight">Interviews</h2>
          <p className="text-[13px] text-muted">Times are in {zoneLabel(timeZone)}</p>
        </div>
        {runsHiring && !finished && (
          <Button
            onClick={() => {
              setMoving(null);
              setSchedulerOpen(true);
            }}
          >
            <CalendarPlus aria-hidden className="size-4" />
            Book an interview
          </Button>
        )}
      </div>

      {openOffer && (
        <div
          data-testid="open-offer"
          className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl bg-status-screening/15 px-4 py-3 text-[15px]"
        >
          <Clock3 aria-hidden className="size-5 shrink-0" />
          <p className="min-w-48 flex-1">
            Waiting for {data.candidate.fullName} to choose from {openOffer.slots.length}{' '}
            {openOffer.slots.length === 1 ? 'time' : 'times'}. The link works until{' '}
            {formatInterviewTime(openOffer.expiresAt, timeZone)}.
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                void navigator.clipboard
                  ?.writeText(openOffer.bookingUrl)
                  .then(() => toast('Link copied'))
              }
            >
              Copy link
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={withdraw.isPending}
              onClick={() =>
                withdraw.mutate(openOffer.id, {
                  onError: (error) => toast(errorMessage(error), 'error'),
                })
              }
            >
              Take back
            </Button>
          </div>
        </div>
      )}

      {isPending ? (
        <Skeleton className="h-6 max-w-40" />
      ) : !schedule?.interviews.length ? (
        <p className="text-[15px] text-muted">No interviews yet.</p>
      ) : (
        <ul className="grid gap-2.5">
          {schedule.interviews.map((interview) => {
            const live = interview.status === 'scheduled' && Date.parse(interview.end) > Date.now();
            const mine = interview.interviewer.id === profile?.id;
            return (
              <InterviewRow
                key={interview.id}
                start={interview.start}
                end={interview.end}
                timeZone={timeZone}
                muted={!live}
                title={`With ${interview.interviewer.fullName}`}
                detail={
                  interview.notes
                    ? `${STATUS_WORDS[interview.status]}. ${interview.notes}`
                    : STATUS_WORDS[interview.status]
                }
              >
                {live && interview.meetingUrl && <JoinLink url={interview.meetingUrl} />}
                {live && mine && <CalendarButton id={interview.id} />}
                {live && runsHiring && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setMoving(interview);
                        setSchedulerOpen(true);
                      }}
                    >
                      Change time
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setCancelling(interview)}>
                      Cancel
                    </Button>
                  </>
                )}
              </InterviewRow>
            );
          })}
        </ul>
      )}

      <InterviewScheduler
        cid={cid}
        applicationId={data.id}
        candidateName={data.candidate.fullName}
        open={schedulerOpen}
        moving={moving}
        onClose={() => setSchedulerOpen(false)}
      />
      <CancelInterviewDialog
        name={data.candidate.fullName}
        open={cancelling !== null}
        busy={cancel.isPending}
        onCancel={() => setCancelling(null)}
        onConfirm={() => {
          if (!cancelling) return;
          cancel.mutate(cancelling.id, {
            onSuccess: () => toast('Interview cancelled. We told everyone by email.'),
            onError: (error) => toast(errorMessage(error), 'error'),
            onSettled: () => setCancelling(null),
          });
        }}
      />
    </section>
  );
}
