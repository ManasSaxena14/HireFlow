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
import { authClient, callAuth } from '@/lib/auth-client';
import { applyServerErrors } from '@/lib/forms';

const formSchema = resetPasswordSchema.pick({ password: true });
type FormValues = z.infer<typeof formSchema>;

function ResetForm() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  // Neon Auth sends people here with an error instead of a token when the link is too old.
  const broken = !token || params.has('error');
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
      await callAuth(() => authClient.resetPassword({ newPassword: password, token }));
      setDone(true);
    } catch (error) {
      setFormError(applyServerErrors(error, setError));
    }
  });

  if (done) {
    return (
      <AuthFrame
        title="Password changed"
        intro="You can now sign in with your new password."
        footer={<TextLink href="/login">Go to sign in</TextLink>}
      >
        {null}
      </AuthFrame>
    );
  }

  if (broken) {
    return (
      <AuthFrame
        title="This link does not work"
        intro="It may be too old, or you may have used it already."
        footer={<TextLink href="/forgot-password">Get a new link</TextLink>}
      >
        {null}
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Set a new password"
      footer={<TextLink href="/forgot-password">Get a new link</TextLink>}
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
          Save new password
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
