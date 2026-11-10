'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ApplyToJobInput, applyToJobSchema, MAX_RESUME_BYTES } from '@hireflow/shared';
import { clsx } from 'clsx';
import { CircleCheck, FileUp, X } from 'lucide-react';
import Link from 'next/link';
import { type ChangeEvent, type DragEvent, useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { FormError, TextField } from '@/components/ui/field';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyServerErrors } from '@/lib/forms';

function resumeProblem(file: File): string | null {
  if (!/\.(pdf|docx)$/i.test(file.name)) return 'Please upload a PDF or Word (.docx) file.';
  if (file.size > MAX_RESUME_BYTES) return 'This file is too big. The limit is 5 MB.';
  return null;
}

export function ApplyForm({
  companySlug,
  jobSlug,
  jobTitle,
  companyName,
}: {
  companySlug: string;
  jobSlug: string;
  jobTitle: string;
  companyName: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [onYourBoard, setOnYourBoard] = useState(false);
  const { status, restore } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ApplyToJobInput>({ resolver: zodResolver(applyToJobSchema) });

  const choose = (picked: File | undefined) => {
    if (!picked) return;
    const problem = resumeProblem(picked);
    setFileError(problem);
    setFile(problem ? null : picked);
  };
  const onPick = (event: ChangeEvent<HTMLInputElement>) => choose(event.target.files?.[0]);
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files[0]);
  };
  const clear = () => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    if (!file) {
      setFileError('Please add your resume.');
      return;
    }
    const body = new FormData();
    body.set('fullName', values.fullName);
    body.set('email', values.email);
    if (values.phone) body.set('phone', values.phone);
    body.set('resume', file);
    try {
      // Someone who is signed in gets this application on their own job board too. On this
      // public page the session is looked up now, once, when they apply.
      if (status !== 'authenticated') await restore();
      const result = await api<{ onYourBoard?: boolean }>(
        `/public/companies/${companySlug}/jobs/${jobSlug}/apply`,
        { method: 'POST', body, auth: false },
      );
      setOnYourBoard(Boolean(result.onYourBoard));
      setDone(true);
    } catch (error) {
      if (error instanceof ApiError) {
        const issue = error.fieldIssues.find(({ path }) => path === 'resume');
        if (issue) {
          setFileError(issue.message);
          return;
        }
      }
      setFormError(applyServerErrors(error, setError));
    }
  });

  if (done) {
    return (
      <div role="status" className="animate-pop-in py-10 text-center">
        <span className="glow-button mx-auto grid size-20 place-items-center rounded-3xl bg-accent text-on-accent">
          <CircleCheck aria-hidden className="size-10" />
        </span>
        <p className="font-display mt-6 text-4xl font-extrabold tracking-tight">You applied!</p>
        <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-muted">
          {companyName} got your application for {jobTitle}. We also sent you an email.
        </p>
        {onYourBoard && (
          <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-muted">
            It is on your job board too, and it will move there by itself as {companyName} goes
            through their hiring.{' '}
            <Link
              href="/app/tracker"
              className="font-semibold text-fg underline underline-offset-4"
            >
              Open my job board
            </Link>
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <FormError>{formError}</FormError>
      <TextField
        label="Full name"
        autoComplete="name"
        error={errors.fullName?.message}
        {...register('fullName')}
      />
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <TextField
        label="Phone (not required)"
        type="tel"
        autoComplete="tel"
        error={errors.phone?.message}
        {...register('phone')}
      />
      <div>
        <p className="mb-2 text-sm font-semibold">Your resume</p>
        {file ? (
          <p className="flex items-center gap-3 rounded-control border border-success/50 bg-success/10 px-3.5 py-3 text-sm font-medium">
            <CircleCheck aria-hidden className="size-5 shrink-0 text-success" />
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <button
              type="button"
              aria-label="Remove file"
              onClick={clear}
              className="grid size-7 shrink-0 place-items-center rounded-control text-muted hover:text-fg"
            >
              <X aria-hidden className="size-4" />
            </button>
          </p>
        ) : (
          <label
            htmlFor={inputId}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={clsx(
              'flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition has-focus-visible:ring-3 has-focus-visible:ring-accent/40',
              dragging
                ? 'border-accent bg-accent/10'
                : fileError
                  ? 'border-danger'
                  : 'border-line-strong hover:border-accent',
            )}
          >
            <FileUp aria-hidden className="size-7 text-accent" />
            <span className="text-[15px] font-semibold">
              Drop your file here or click to choose
            </span>
            <span className="text-[13px] text-muted">PDF or Word (.docx), up to 5 MB</span>
          </label>
        )}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          aria-label="Your resume"
          accept=".pdf,.docx"
          onChange={onPick}
          className="sr-only"
        />
        {fileError && (
          <p role="alert" className="mt-1.5 text-[13px] text-danger">
            {fileError}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
        Send my application
      </Button>
      <p className="text-center text-[13px] text-muted">
        Have a HireFlow account? Use its email, and this application also appears on your job board
        and moves there by itself.
      </p>
    </form>
  );
}
