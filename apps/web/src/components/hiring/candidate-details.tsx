'use client';

import {
  type AtsApplicationDetail,
  type MembershipRole,
  RECOMMENDATIONS,
  type Recommendation,
} from '@hireflow/shared';
import { clsx } from 'clsx';
import { ArrowLeft, FileText, Mail, Phone, Star, Trash2, UserPlus, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type CSSProperties, type FormEvent, type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormError, SelectField, TextAreaField } from '@/components/ui/field';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
  canRunHiring,
  fetchResumeLink,
  KIND_COLORS,
  RECOMMENDATION_LABELS,
  ROLE_LABELS,
  useAddComment,
  useAddScorecard,
  useAssign,
  useCandidate,
  useDeleteCandidate,
  useMembers,
  useMoveCandidate,
  useUnassign,
} from '@/lib/ats';
import { useAuth } from '@/lib/auth';
import { avatarColor, formatDateTime, timeAgo } from '@/lib/format';
import { errorMessage } from '@/lib/forms';
import { RejectDialog } from './reject-dialog';

function Block({
  title,
  delay,
  children,
  testId,
}: {
  title: string;
  delay: number;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section
      data-testid={testId}
      className="animate-fade-up rounded-[20px] border border-line bg-raised/60 p-5 sm:p-6"
      style={{ animationDelay: `${delay}ms` }}
    >
      <h2 className="font-display mb-4 text-2xl font-extrabold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function ResumeButton({ cid, data }: { cid: string; data: AtsApplicationDetail }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!data.resume) return null;
  const open = async () => {
    setBusy(true);
    try {
      const { url } = await fetchResumeLink(cid, data.id);
      window.location.assign(url);
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="lg" loading={busy} onClick={open}>
      <FileText aria-hidden className="size-5" />
      Get resume
    </Button>
  );
}

function Overview({
  cid,
  data,
  canMove,
}: {
  cid: string;
  data: AtsApplicationDetail;
  canMove: boolean;
}) {
  const move = useMoveCandidate(cid);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const { candidate } = data;

  return (
    <section className="animate-fade-up overflow-hidden rounded-[24px] border border-line bg-raised/60">
      <div className="flex flex-wrap items-start gap-5 p-5 sm:p-7">
        <span
          aria-hidden
          className="font-display grid size-20 shrink-0 place-items-center rounded-3xl text-4xl font-extrabold text-on-accent"
          style={{ background: avatarColor(candidate.fullName) }}
        >
          {candidate.fullName.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-6xl">
            {candidate.fullName}
          </h1>
          <p className="mt-2 text-lg text-muted">
            Applied for <span className="font-semibold text-fg">{data.jobTitle}</span>{' '}
            {timeAgo(data.appliedAt)}
          </p>
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[15px] text-muted">
            <li>
              <a
                href={`mailto:${candidate.email}`}
                className="inline-flex items-center gap-2 hover:text-accent"
              >
                <Mail aria-hidden className="size-4" />
                {candidate.email}
              </a>
            </li>
            {candidate.phone && (
              <li className="inline-flex items-center gap-2">
                <Phone aria-hidden className="size-4" />
                {candidate.phone}
              </li>
            )}
            {candidate.source && <li>Found us through {candidate.source}</li>}
          </ul>
        </div>
        <div className="flex items-center gap-4">
          {data.score !== null && (
            <p className="text-right">
              <span className="font-display flex items-center justify-end gap-1.5 text-4xl font-extrabold text-status-screening">
                <Star aria-hidden className="size-7 fill-current" />
                {data.score.toFixed(1)}
              </span>
              <span className="text-[13px] text-muted">Team score</span>
            </p>
          )}
          <ResumeButton cid={cid} data={data} />
        </div>
      </div>
      <div className="border-t border-line p-5 sm:px-7">
        <div role="group" aria-label="Step" className="flex flex-wrap gap-1.5">
          {data.stages.map((stage) => {
            const current = stage.id === data.stageId;
            return (
              <button
                key={stage.id}
                type="button"
                aria-pressed={current}
                disabled={!canMove && !current}
                onClick={() => {
                  if (current || !canMove) return;
                  if (stage.kind === 'rejected') setRejecting(stage.id);
                  else move.mutate({ id: data.id, toStageId: stage.id });
                }}
                style={{ '--status': KIND_COLORS[stage.kind] } as CSSProperties}
                className={clsx(
                  'h-10 rounded-full border px-4 text-[13px] font-bold transition-colors',
                  current
                    ? 'border-(--status) bg-(--status) text-on-accent'
                    : 'border-line-strong text-muted enabled:hover:border-(--status) enabled:hover:text-fg disabled:opacity-50',
                )}
              >
                {stage.name}
              </button>
            );
          })}
        </div>
        {data.rejectionReason && (
          <p className="mt-4 rounded-2xl bg-danger-soft px-4 py-3 text-[15px]">
            <span className="font-bold">Why not: </span>
            {data.rejectionReason}
          </p>
        )}
      </div>
      <RejectDialog
        name={candidate.fullName}
        open={rejecting !== null}
        busy={move.isPending}
        onCancel={() => setRejecting(null)}
        onConfirm={(reason) => {
          if (rejecting) {
            move.mutate(
              { id: data.id, toStageId: rejecting, reason },
              { onSettled: () => setRejecting(null) },
            );
          }
        }}
      />
    </section>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">Your rating</legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((rating) => (
          <label
            key={rating}
            className="grid size-11 cursor-pointer place-items-center rounded-control transition has-focus-visible:ring-3 has-focus-visible:ring-accent/50 hover:bg-overlay"
          >
            <input
              type="radio"
              name="rating"
              value={rating}
              checked={value === rating}
              onChange={() => onChange(rating)}
              className="sr-only"
            />
            <span className="sr-only">{rating} out of 5</span>
            <Star
              aria-hidden
              className={clsx(
                'size-7 transition',
                rating <= value ? 'fill-status-screening text-status-screening' : 'text-subtle',
              )}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Scorecards({ cid, data }: { cid: string; data: AtsApplicationDetail }) {
  const { profile } = useAuth();
  const add = useAddScorecard(cid, data.id);
  const [rating, setRating] = useState(0);
  const [recommendation, setRecommendation] = useState<Recommendation>('yes');
  const [comments, setComments] = useState('');
  const [error, setError] = useState<string | null>(null);
  const alreadySent = data.scorecards.some((card) => card.interviewerId === profile?.id);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (rating === 0) {
      setError('Please pick a rating.');
      return;
    }
    setError(null);
    add.mutate(
      { rating, recommendation, comments },
      { onError: (failure) => setError(errorMessage(failure)) },
    );
  };

  return (
    <>
      {!alreadySent && (
        <form onSubmit={submit} noValidate className="mb-5 space-y-4">
          <FormError>{error}</FormError>
          <StarPicker value={rating} onChange={setRating} />
          <SelectField
            label="Should we hire this person?"
            value={recommendation}
            onChange={(event) => setRecommendation(event.target.value as Recommendation)}
          >
            {RECOMMENDATIONS.map((option) => (
              <option key={option} value={option}>
                {RECOMMENDATION_LABELS[option]}
              </option>
            ))}
          </SelectField>
          <TextAreaField
            label="Notes"
            rows={3}
            value={comments}
            onChange={(event) => setComments(event.target.value)}
          />
          <Button type="submit" loading={add.isPending}>
            Send my score
          </Button>
        </form>
      )}
      {data.scorecards.length > 0 ? (
        <ul className="space-y-3" data-testid="scorecards">
          {data.scorecards.map((card) => (
            <li key={card.id} className="animate-card-in rounded-2xl bg-overlay/60 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[15px] font-bold">{card.interviewerName}</p>
                <p className="flex items-center gap-2 text-[13px] font-bold">
                  <span className="flex items-center gap-1 text-status-screening">
                    <Star aria-hidden className="size-3.5 fill-current" />
                    {card.rating}
                    <span className="sr-only"> out of 5</span>
                  </span>
                  {RECOMMENDATION_LABELS[card.recommendation]}
                </p>
              </div>
              {card.comments && (
                <p className="mt-1.5 text-[15px] leading-relaxed whitespace-pre-wrap text-muted">
                  {card.comments}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        alreadySent || <p className="text-[15px] text-muted">No one has sent a score yet.</p>
      )}
    </>
  );
}

function Comments({ cid, data }: { cid: string; data: AtsApplicationDetail }) {
  const { profile } = useAuth();
  const add = useAddComment(cid, data.id);
  const [body, setBody] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    add.mutate(body, { onSuccess: () => setBody('') });
  };

  return (
    <>
      <form onSubmit={submit} noValidate className="space-y-3">
        {add.isError && <FormError>{errorMessage(add.error)}</FormError>}
        <TextAreaField
          label="Add a comment"
          rows={2}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <Button type="submit" variant="secondary" size="sm" loading={add.isPending}>
          Post comment
        </Button>
      </form>
      <ul className="mt-5 space-y-4" data-testid="comments">
        {data.comments.map((comment) => (
          <li key={comment.id} className="animate-card-in border-l-3 border-accent pl-3.5">
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{comment.body}</p>
            <p className="mt-1 text-xs text-subtle">
              {comment.authorName} · {formatDateTime(comment.createdAt, profile?.timezone ?? 'UTC')}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

function Interviewers({ cid, data }: { cid: string; data: AtsApplicationDetail }) {
  const members = useMembers(cid);
  const assign = useAssign(cid, data.id);
  const unassign = useUnassign(cid, data.id);
  const [userId, setUserId] = useState('');
  const assigned = new Set(data.assignees.map((person) => person.userId));
  const options = members.data?.filter((member) => !assigned.has(member.userId)) ?? [];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (userId) assign.mutate(userId, { onSuccess: () => setUserId('') });
  };

  return (
    <>
      <p className="mb-4 text-[15px] leading-relaxed text-muted">
        Interviewers can only see the people you give them.
      </p>
      {data.assignees.length > 0 && (
        <ul className="mb-4 flex flex-wrap gap-2" data-testid="assignees">
          {data.assignees.map((person) => (
            <li
              key={person.userId}
              className="animate-card-in flex items-center gap-1.5 rounded-full bg-overlay py-1 pr-1 pl-3.5 text-[13px] font-semibold"
            >
              {person.fullName}
              <button
                type="button"
                aria-label={`Remove ${person.fullName}`}
                onClick={() => unassign.mutate(person.userId)}
                className="grid size-6 place-items-center rounded-full text-muted hover:bg-raised hover:text-fg"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {(assign.isError || unassign.isError) && (
        <FormError>{errorMessage(assign.error ?? unassign.error)}</FormError>
      )}
      <form onSubmit={submit} className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <SelectField
            label="Give to"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
          >
            <option value="">Choose a person</option>
            {options.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.fullName} ({ROLE_LABELS[member.role]})
              </option>
            ))}
          </SelectField>
        </div>
        <Button
          type="submit"
          variant="secondary"
          size="lg"
          disabled={!userId}
          loading={assign.isPending}
        >
          <UserPlus aria-hidden className="size-4" />
          Add
        </Button>
      </form>
    </>
  );
}

function History({ data }: { data: AtsApplicationDetail }) {
  const { profile } = useAuth();
  return (
    <ol className="space-y-5 border-l-2 border-line pl-5" data-testid="history">
      {data.events.map((event) => (
        <li key={event.id} className="relative">
          <span
            aria-hidden
            className="absolute top-1.5 -left-[27px] size-3 rounded-full bg-accent ring-4 ring-canvas"
          />
          <p className="text-[15px]">
            {event.fromStageName ? (
              <>
                {event.fromStageName} <span className="text-subtle">→</span>{' '}
                <span className="font-bold">{event.toStageName ?? 'A removed step'}</span>
              </>
            ) : (
              <>
                Applied, in{' '}
                <span className="font-bold">{event.toStageName ?? 'a removed step'}</span>
              </>
            )}
          </p>
          <p className="mt-0.5 text-xs text-subtle">
            {event.actorName ? `${event.actorName} · ` : ''}
            {formatDateTime(event.createdAt, profile?.timezone ?? 'UTC')}
          </p>
        </li>
      ))}
    </ol>
  );
}

function DeleteCandidate({ cid, data }: { cid: string; data: AtsApplicationDetail }) {
  const remove = useDeleteCandidate(cid);
  const router = useRouter();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  return (
    <>
      <p className="mb-4 text-[15px] leading-relaxed text-muted">
        This removes {data.candidate.fullName}, their resumes and all their applications to your
        company. You cannot undo this.
      </p>
      <Button variant="danger" onClick={() => setAsking(true)}>
        <Trash2 aria-hidden className="size-4" />
        Delete this person
      </Button>
      <Dialog open={asking} onClose={() => setAsking(false)} title="Delete this person?">
        <div className="space-y-4 p-6">
          <p className="text-[15px] leading-relaxed text-muted">
            All data about {data.candidate.fullName} will be gone for good.
          </p>
          {remove.isError && <FormError>{errorMessage(remove.error)}</FormError>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAsking(false)}>
              Keep
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(data.candidate.id, {
                  onSuccess: () => {
                    toast('Person deleted');
                    router.replace(`/company/${cid}/jobs/${data.jobId}`);
                  },
                })
              }
            >
              Yes, delete
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

export function CandidateDetails({
  cid,
  id,
  role,
}: {
  cid: string;
  id: string;
  role: MembershipRole;
}) {
  const { data, isPending, isError, refetch } = useCandidate(cid, id);

  if (isPending) {
    return (
      <div className="space-y-4 p-4 sm:p-6" role="status" aria-label="Loading person">
        <Skeleton className="h-52 rounded-[24px]" />
        <div className="grid gap-4 xl:grid-cols-3">
          <Skeleton className="h-72 rounded-[20px]" />
          <Skeleton className="h-72 rounded-[20px]" />
          <Skeleton className="h-72 rounded-[20px]" />
        </div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="p-4 sm:p-6">
        <ErrorState message="We could not find this person." onRetry={() => refetch()} />
      </div>
    );
  }

  const runsHiring = canRunHiring(role);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Link
        href={`/company/${cid}/jobs/${data.jobId}`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-fg"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Back to {data.jobTitle}
      </Link>
      <Overview cid={cid} data={data} canMove={runsHiring} />
      <div className="grid items-start gap-4 xl:grid-cols-3">
        <Block title="Scores" delay={70} testId="scores-block">
          <Scorecards cid={cid} data={data} />
        </Block>
        <Block title="Comments" delay={140}>
          <Comments cid={cid} data={data} />
        </Block>
        <div className="space-y-4">
          {runsHiring && (
            <Block title="Interviewers" delay={210}>
              <Interviewers cid={cid} data={data} />
            </Block>
          )}
          <Block title="History" delay={280}>
            <History data={data} />
          </Block>
          {role === 'admin' && (
            <Block title="Delete" delay={350}>
              <DeleteCandidate cid={cid} data={data} />
            </Block>
          )}
        </div>
      </div>
    </div>
  );
}
