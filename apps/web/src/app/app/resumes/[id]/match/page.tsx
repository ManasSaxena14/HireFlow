'use client';

import { MAX_JOB_TEXT_LENGTH, type ResumeMatch } from '@hireflow/shared';
import { clsx } from 'clsx';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { use, useState } from 'react';
import { MatchReport } from '@/components/resumes/match-report';
import { Button } from '@/components/ui/button';
import { FormError, SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { errorMessage } from '@/lib/forms';
import { timeAgo } from '@/lib/format';
import { useMatchResume, useResume, useResumeMatches } from '@/lib/resumes';
import { useBoard } from '@/lib/tracker';

const BOARD_FILTERS = { q: '', tag: '', archived: false };
const PASTE = '';

export default function ResumeMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const resume = useResume(id);
  const history = useResumeMatches(id);
  const board = useBoard(BOARD_FILTERS);
  const check = useMatchResume(id);

  const [jobId, setJobId] = useState(PASTE);
  const [text, setText] = useState('');
  const [label, setLabel] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [chosen, setChosen] = useState<ResumeMatch | null>(null);

  const shown = chosen ?? history.data?.[0] ?? null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setProblem(null);
    if (jobId === PASTE && text.trim().length < 30) {
      setProblem('Paste more of the job, so there is enough to compare.');
      return;
    }
    check.mutate(
      jobId === PASTE
        ? { jobDescription: text, ...(label.trim() ? { jobLabel: label } : {}) }
        : { trackedApplicationId: jobId },
      {
        onSuccess: (match) => setChosen(match),
        onError: (error) => setProblem(errorMessage(error)),
      },
    );
  };

  return (
    <div className="flex min-h-full flex-col p-4 sm:p-6">
      <Link
        href="/app/resumes"
        className="mb-4 inline-flex items-center gap-1.5 self-start text-sm font-semibold text-muted hover:text-fg"
      >
        <ArrowLeft aria-hidden className="size-4" />
        All resumes
      </Link>
      <header className="mb-6">
        <h1 className="font-display text-4xl font-extrabold tracking-tight break-words sm:text-6xl">
          {resume.data?.label ?? 'Resume check'}
        </h1>
        <p className="mt-2 text-[15px] text-muted">
          The score comes from clear rules, and the same resume and job always get the same score.
          It is a guide, and it does not decide anything for you.
        </p>
      </header>

      {resume.isPending ? (
        <div role="status" aria-label="Loading resume">
          <Skeleton className="h-64 rounded-[20px]" />
        </div>
      ) : resume.isError ? (
        <ErrorState message="We could not load this resume." onRetry={() => resume.refetch()} />
      ) : resume.data.status !== 'ready' ? (
        <ErrorState
          message={
            resume.data.status === 'pending'
              ? 'We are still reading this resume. This page will update by itself.'
              : (resume.data.parseError ?? 'We could not read this file.')
          }
        />
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <form
            onSubmit={submit}
            noValidate
            className="space-y-4 rounded-[20px] border border-line bg-raised/60 p-5 sm:p-6"
          >
            <FormError>{problem}</FormError>
            <SelectField
              label="Which job?"
              value={jobId}
              onChange={(event) => setJobId(event.target.value)}
            >
              <option value={PASTE}>I will paste the job description</option>
              {board.data?.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title} at {job.companyName}
                </option>
              ))}
            </SelectField>
            {jobId === PASTE && (
              <>
                <TextAreaField
                  label="Job description"
                  rows={10}
                  maxLength={MAX_JOB_TEXT_LENGTH}
                  placeholder="Paste the whole job here, with its Requirements part if it has one."
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
                <TextField
                  label="A name for this job (you can leave this empty)"
                  maxLength={120}
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                />
              </>
            )}
            <Button type="submit" className="w-full" loading={check.isPending}>
              Check my resume
            </Button>

            {Boolean(history.data?.length) && (
              <div className="border-t border-line pt-4">
                <h2 className="text-sm font-bold">Past checks</h2>
                <ul className="mt-2 space-y-1">
                  {history.data?.map((match) => (
                    <li key={match.id}>
                      <button
                        type="button"
                        aria-current={shown?.id === match.id ? 'true' : undefined}
                        onClick={() => setChosen(match)}
                        className={clsx(
                          'flex w-full items-center justify-between gap-3 rounded-control px-3 py-2 text-left text-sm transition hover:bg-overlay',
                          shown?.id === match.id && 'bg-overlay',
                        )}
                      >
                        <span className="min-w-0 truncate font-medium">
                          {match.jobRef ?? 'A job'}
                        </span>
                        <span className="shrink-0 text-muted">
                          <span className="font-bold text-fg">{match.score}</span> ·{' '}
                          {timeAgo(match.createdAt)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </form>

          {shown ? (
            <MatchReport match={shown} />
          ) : (
            <div className="grid min-h-64 place-items-center rounded-[20px] border border-dashed border-line-strong p-8 text-center text-[15px] text-muted">
              Your report will show here, with the skills you have and the ones that are missing.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
