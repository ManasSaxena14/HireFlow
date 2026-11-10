'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ForgotPasswordInput, forgotPasswordSchema } from '@hireflow/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { AuthFrame, TextLink } from '@/components/auth-frame';
import { Button } from '@/components/ui/button';
import { FormError, TextField } from '@/components/ui/field';
import { authClient, callAuth } from '@/lib/auth-client';
import { applyServerErrors } from '@/lib/forms';

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await callAuth(() =>
        authClient.requestPasswordReset({
          email: values.email,
          redirectTo: `${window.location.origin}/reset-password`,
        }),
      );
      setSentTo(values.email);
    } catch (error) {
      setFormError(applyServerErrors(error, setError));
    }
  });

  if (sentTo) {
    return (
      <AuthFrame
        title="Check your email"
        intro={`If ${sentTo} has an account, we sent a link to it. The link works for 15 minutes.`}
        footer={<TextLink href="/login">Back to sign in</TextLink>}
      >
        {null}
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Forgot your password?"
      intro="Enter your email. We will send you a link to set a new password."
      footer={<TextLink href="/login">Back to sign in</TextLink>}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormError>{formError}</FormError>
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          Send me a link
        </Button>
      </form>
    </AuthFrame>
  );
}
