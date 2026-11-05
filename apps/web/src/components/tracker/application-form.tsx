'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { CreateApplicationInput, TrackedApplication } from '@hireflow/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormError, TextAreaField, TextField } from '@/components/ui/field';
import { ApiError } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';

const numberField = z
  .string()
  .trim()
  .refine((value) => value === '' || /^\d+$/.test(value), 'Whole numbers only');

const formSchema = z.object({
  title: z.string().trim().min(1, 'Enter the job title').max(200),
  companyName: z.string().trim().min(1, 'Enter the company').max(200),
  jobUrl: z.string().trim(),
  location: z.string().trim().max(200),
  source: z.string().trim().max(100),
  salaryMin: numberField,
  salaryMax: numberField,
  currency: z.string().trim().max(3),
  tags: z.string(),
  description: z.string().trim().max(20_000),
});
type FormValues = z.infer<typeof formSchema>;

const toNumber = (value: string) => (value === '' ? null : Number(value));
const toList = (value: string) =>
  value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

export function ApplicationForm({
  initial,
  submitLabel,
  onSubmit,
  onDuplicate,
  onCancel,
}: {
  initial?: TrackedApplication;
  submitLabel: string;
  onSubmit: (values: CreateApplicationInput) => Promise<unknown>;
  onDuplicate?: (existingId: string) => void;
  onCancel: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: initial?.title ?? '',
      companyName: initial?.companyName ?? '',
      jobUrl: initial?.jobUrl ?? '',
      location: initial?.location ?? '',
      source: initial?.source ?? '',
      salaryMin: initial?.salaryMin?.toString() ?? '',
      salaryMax: initial?.salaryMax?.toString() ?? '',
      currency: initial?.currency ?? '',
      tags: initial?.tags.join(', ') ?? '',
      description: initial?.description ?? '',
    },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit({
        ...values,
        salaryMin: toNumber(values.salaryMin),
        salaryMax: toNumber(values.salaryMax),
        currency: values.currency === '' ? null : values.currency,
        tags: toList(values.tags),
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'DUPLICATE_JOB') {
        const existingId = (error.details[0] as { existingId?: string } | undefined)?.existingId;
        if (existingId && onDuplicate) {
          onDuplicate(existingId);
          return;
        }
      }
      setFormError(applyServerErrors(error, setError));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4 p-5">
      <FormError>{formError}</FormError>
      <TextField label="Job title" autoFocus error={errors.title?.message} {...register('title')} />
      <TextField label="Company" error={errors.companyName?.message} {...register('companyName')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Location" error={errors.location?.message} {...register('location')} />
        <TextField
          label="Found on"
          placeholder="LinkedIn, referral…"
          error={errors.source?.message}
          {...register('source')}
        />
      </div>
      <TextField
        label="Job link"
        type="url"
        placeholder="https://"
        error={errors.jobUrl?.message}
        {...register('jobUrl')}
      />
      <div className="grid grid-cols-[1fr_1fr_88px] gap-3">
        <TextField
          label="Salary from"
          inputMode="numeric"
          error={errors.salaryMin?.message}
          {...register('salaryMin')}
        />
        <TextField
          label="Salary to"
          inputMode="numeric"
          error={errors.salaryMax?.message}
          {...register('salaryMax')}
        />
        <TextField
          label="Currency"
          placeholder="INR"
          maxLength={3}
          error={errors.currency?.message}
          {...register('currency')}
        />
      </div>
      <TextField
        label="Tags"
        hint="Separate with commas."
        error={errors.tags?.message}
        {...register('tags')}
      />
      <TextAreaField
        label="Description"
        rows={4}
        error={errors.description?.message}
        {...register('description')}
      />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
