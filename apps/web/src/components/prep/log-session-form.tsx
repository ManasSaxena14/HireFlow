'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PRACTICE_KINDS } from '@hireflow/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormError, SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { applyServerErrors } from '@/lib/forms';
import { KIND_LABELS, useLogSession } from '@/lib/prep';

const formSchema = z.object({
  topic: z.string().trim().min(1, 'Enter what you practised').max(100),
  kind: z.enum(PRACTICE_KINDS),
  durationMin: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === '' || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 600),
      'Use whole minutes from 1 to 600',
    ),
  difficulty: z.string(),
  outcome: z.string(),
  notes: z.string().trim().max(2000),
});
type FormValues = z.infer<typeof formSchema>;

const EMPTY: FormValues = {
  topic: '',
  kind: 'dsa',
  durationMin: '',
  difficulty: '',
  outcome: '',
  notes: '',
};

export function LogSessionForm() {
  const logSession = useLogSession();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: EMPTY });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await logSession.mutateAsync({
        topic: values.topic,
        kind: values.kind,
        durationMin: values.durationMin ? Number(values.durationMin) : null,
        difficulty: values.difficulty ? Number(values.difficulty) : null,
        outcome: values.outcome ? (values.outcome as 'solved' | 'partial' | 'failed') : null,
        notes: values.notes,
      });
      reset({ ...EMPTY, kind: values.kind });
      toast(
        saved.reviewAdded
          ? `Saved. We will ask you about ${saved.topic} again tomorrow.`
          : 'Practice saved',
      );
    } catch (error) {
      setFormError(applyServerErrors(error, setError));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <FormError>{formError}</FormError>
      <TextField
        label="What did you practise?"
        placeholder="Binary search, caching, a story about a hard project"
        error={errors.topic?.message}
        {...register('topic')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Type" {...register('kind')}>
          {PRACTICE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Minutes"
          inputMode="numeric"
          placeholder="30"
          error={errors.durationMin?.message}
          {...register('durationMin')}
        />
        <SelectField label="How hard was it?" {...register('difficulty')}>
          <option value="">Skip</option>
          <option value="1">1, very easy</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5, very hard</option>
        </SelectField>
        <SelectField label="How did it go?" {...register('outcome')}>
          <option value="">Skip</option>
          <option value="solved">I got it</option>
          <option value="partial">Partly</option>
          <option value="failed">I got stuck</option>
        </SelectField>
      </div>
      <TextAreaField
        label="Notes (you can leave this empty)"
        error={errors.notes?.message}
        {...register('notes')}
      />
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Save practice
      </Button>
    </form>
  );
}
