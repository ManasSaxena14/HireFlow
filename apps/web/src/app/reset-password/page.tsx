'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema } from '@hireflow/shared';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthFrame, TextLink } from '@/components/auth-frame';
import { Button } from '@/components/ui/button';
import { FormError, TextField } from '@/components/ui/field';
import { api } from '@/lib/api';
import { applyServerErrors } from '@/lib/forms';

const formSchema = resetPasswordSchema.pick({ password: true });
type FormValues = z.infer<typeof formSchema>;

function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: { token, password },
        auth: false,
      });
      setDone(true);
    } catch (error) {
      setFormError(applyServerErrors(error, setError));
    }
  });

  if (done) {
    return (
      <AuthFrame
        title="Password updated"
        intro="All other sessions were signed out. You can sign in with your new password."
        footer={<TextLink href="/login">Go to sign in</TextLink>}
      >
        {null}
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Choose a new password"
      footer={<TextLink href="/forgot-password">Request a new link</TextLink>}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormError>{formError}</FormError>
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="At least 10 characters."
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          Update password
        </Button>
      </form>
    </AuthFrame>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
