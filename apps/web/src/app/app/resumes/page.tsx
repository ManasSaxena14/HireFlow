'use client';

import { MAX_RESUME_BYTES, type Resume } from '@hireflow/shared';
import { FileText, Upload } from 'lucide-react';
import Link from 'next/link';
import { type ChangeEvent, useRef, useState } from 'react';
import { Button, buttonClass } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/forms';
import { timeAgo } from '@/lib/format';
import { fetchResumeFileLink, useDeleteResume, useResumes, useUploadResume } from '@/lib/resumes';

function ResumeCard({ resume }: { resume: Resume }) {
  const remove = useDeleteResume();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  const download = async () => {
    try {
      const { url } = await fetchResumeFileLink(resume.id);
      window.location.assign(url);
    } catch (error) {
      toast(errorMessage(error), 'error');
    }
  };

  return (
    <li
      data-testid="resume-card"
      className="rounded-[20px] border border-line bg-raised/60 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-extrabold tracking-tight break-words">
            {resume.label}
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            {resume.originalName} · Added {timeAgo(resume.createdAt)}
            {resume.lastScore !== null && ` · Last score ${resume.lastScore} out of 100`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {resume.status === 'ready' && (
            <Link href={`/app/resumes/${resume.id}/match`} className={buttonClass('primary', 'sm')}>
              Check against a job
            </Link>
          )}
          <Button variant="secondary" size="sm" onClick={download}>
            Download
          </Button>
          <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        </div>
      </div>

      {resume.status === 'pending' && (
        <p role="status" className="mt-4 text-[15px] text-muted">
          We are reading your resume. This takes a few seconds.
        </p>
      )}
      {resume.status === 'failed' && (
        <p
          role="alert"
          className="mt-4 rounded-control bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
        >
          {resume.parseError ?? 'We could not read this file.'}
        </p>
      )}
      {resume.status === 'ready' &&
        (resume.parsedSkills.length > 0 ? (
          <ul aria-label="Skills we found" className="mt-4 flex flex-wrap gap-1.5">
            {resume.parsedSkills.map((skill) => (
              <li
                key={skill}
                className="rounded-full bg-overlay px-3 py-1 text-[13px] font-semibold"
              >
                {skill}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-[15px] text-muted">
            We read the file but did not find any skills we know. You can still check it against a
            job.
          </p>
        ))}

      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Delete this resume?">
        <div className="space-y-5 p-6">
          <p className="text-[15px] text-muted">
            This removes the file and its past checks for good. This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() =>
                remove.mutate(resume.id, {
                  onSuccess: () => toast('Resume deleted'),
                  onError: (error) => {
                    setConfirming(false);
                    toast(errorMessage(error), 'error');
                  },
                })
              }
            >
              Delete resume
            </Button>
          </div>
        </div>
      </Dialog>
    </li>
  );
}

export default function ResumesPage() {
  const { data, isPending, isError, refetch } = useResumes();
  const upload = useUploadResume();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_RESUME_BYTES) {
      toast('This file is too big. The limit is 5 MB.', 'error');
      return;
    }
    upload.mutate(file, { onError: (error) => toast(errorMessage(error), 'error') });
  };
  const pickButton = (label: string, size: 'md' | 'lg') => (
    <Button size={size} loading={upload.isPending} onClick={() => input.current?.click()}>
      <Upload aria-hidden className="size-4" />
      {label}
    </Button>
  );

  return (
    <div className="flex min-h-full flex-col p-4 sm:p-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl font-extrabold tracking-tight sm:text-7xl">
            Resumes
          </h1>
          <p className="mt-2 text-[15px] text-muted">
            See how well a resume fits a job, and exactly which skills are missing.
          </p>
        </div>
        {pickButton('Upload a resume', 'md')}
        <input
          ref={input}
          type="file"
          aria-label="Choose a resume file"
          accept=".pdf,.docx"
          onChange={onPick}
          className="sr-only"
        />
      </header>

      {isPending ? (
        <div role="status" aria-label="Loading resumes">
          <Skeleton className="h-36 rounded-[20px]" />
        </div>
      ) : isError ? (
        <ErrorState message="We could not load your resumes." onRetry={() => refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          className="flex-1"
          title="No resumes yet"
          icon={<FileText aria-hidden className="size-9" />}
          action={pickButton('Upload your first resume', 'lg')}
        >
          Add a PDF or Word (.docx) file of up to 5 MB. Only you can see it.
        </EmptyState>
      ) : (
        <ul className="grid gap-2.5 2xl:grid-cols-2">
          {data.map((resume) => (
            <ResumeCard key={resume.id} resume={resume} />
          ))}
        </ul>
      )}
    </div>
  );
}
