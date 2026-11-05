'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { CreateJobInput, Job } from '@hireflow/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormError, SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { applyServerErrors } from '@/lib/forms';

const EMPLOYMENT_TYPES = ['Full time', 'Part time', 'Contract', 'Internship'];

const formSchema = z.object({
  title: z.string().trim().min(2, 'Enter the job title').max(200),
  location: z.string().trim().max(200),
  employmentType: z.string(),
  remote: z.boolean(),
  skills: z.string(),
  description: z.string().trim().min(20, 'Please write at least 20 characters').max(20_000),
});
type FormValues = z.infer<typeof formSchema>;

export function JobForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Job;
  submitLabel: string;
  onSubmit: (values: CreateJobInput) => Promise<unknown>;
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
      location: initial?.location ?? '',
      employmentType: initial?.employmentType ?? 'Full time',
      remote: initial?.remote ?? false,
      skills: initial?.skills.join(', ') ?? '',
      description: initial?.description ?? '',
    },
  });

  const submit = handleSubmit(async ({ skills, ...values }) => {
    setFormError(null);
    try {
      await onSubmit({
        ...values,
        skills: skills
          .split(',')
          .map((skill) => skill.trim())
          .filter(Boolean),
      });
    } catch (error) {
      setFormError(applyServerErrors(error, setError));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <FormError>{formError}</FormError>
      <TextField label="Job title" autoFocus error={errors.title?.message} {...register('title')} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Location" error={errors.location?.message} {...register('location')} />
        <SelectField
          label="Type of work"
          error={errors.employmentType?.message}
          {...register('employmentType')}
        >
          {EMPLOYMENT_TYPES.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </SelectField>
      </div>
      <label className="flex items-center gap-2.5 text-[15px] font-medium">
        <input type="checkbox" className="size-4 accent-accent" {...register('remote')} />
        People can work from home
      </label>
      <TextField
        label="Skills"
        hint="Put a comma between skills."
        error={errors.skills?.message}
        {...register('skills')}
      />
      <TextAreaField
        label="About this job"
        rows={9}
        hint="People see this on your careers page."
        error={errors.description?.message}
        {...register('description')}
      />
      <div className="flex justify-end gap-2 pt-1">
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
