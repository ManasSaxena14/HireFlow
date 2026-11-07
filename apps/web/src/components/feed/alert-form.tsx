'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { CreateAlertInput, JobAlert } from '@hireflow/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormError, SelectField, TextField } from '@/components/ui/field';
import { applyServerErrors } from '@/lib/forms';

const toList = (value: string) =>
  value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

const formSchema = z.object({
  name: z.string().trim().min(1, 'Give this alert a name').max(80),
  keywords: z
    .string()
    .refine((value) => toList(value).length > 0, 'Enter at least one keyword')
    .refine((value) => toList(value).length <= 20, 'Use 20 keywords or fewer')
    .refine((value) => toList(value).every((word) => word.length <= 60), 'A keyword is too long'),
  locations: z
    .string()
    .refine((value) => toList(value).length <= 10, 'Use 10 places or fewer')
    .refine(
      (value) => toList(value).every((word) => word.length <= 60),
      'A place name is too long',
    ),
  remoteOnly: z.boolean(),
  frequency: z.enum(['instant', 'daily']),
});
type FormValues = z.infer<typeof formSchema>;

export function AlertForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: JobAlert;
  submitLabel: string;
  onSubmit: (values: CreateAlertInput) => Promise<unknown>;
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
      name: initial?.name ?? '',
      keywords: initial?.keywords.join(', ') ?? '',
      locations: initial?.locations.join(', ') ?? '',
      remoteOnly: initial?.remoteOnly ?? false,
      frequency: initial?.frequency ?? 'daily',
    },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit({
        name: values.name,
        keywords: toList(values.keywords),
        locations: toList(values.locations),
        remoteOnly: values.remoteOnly,
        frequency: values.frequency,
      });
    } catch (error) {
      setFormError(applyServerErrors(error, setError));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4 p-6">
      <FormError>{formError}</FormError>
      <TextField
        label="Alert name"
        placeholder="Backend jobs"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        label="Keywords"
        placeholder="backend, node, postgres"
        hint="Put commas between them. A job needs just one of these in its title or description."
        error={errors.keywords?.message}
        {...register('keywords')}
      />
      <TextField
        label="Places (you can leave this empty)"
        placeholder="London, India"
        hint="Put commas between them. Empty means any place."
        error={errors.locations?.message}
        {...register('locations')}
      />
      <SelectField
        label="When should we email you?"
        error={errors.frequency?.message}
        {...register('frequency')}
      >
        <option value="daily">Once a day, at 8 am your time</option>
        <option value="instant">As soon as we find a job</option>
      </SelectField>
      <label className="flex cursor-pointer items-center gap-2.5 text-[15px] font-semibold">
        <input
          type="checkbox"
          className="size-4 accent-[var(--color-accent)]"
          {...register('remoteOnly')}
        />
        Only remote jobs
      </label>
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
