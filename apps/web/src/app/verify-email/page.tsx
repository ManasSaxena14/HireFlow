'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type VerifyEmailInput, verifyEmailSchema } from '@hireflow/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { AuthFrame, TextLink } from '@/components/auth-frame';
import { Button } from '@/components/ui/button';
import { FormError, TextField } from '@/components/ui/field';
import { useAuth } from '@/lib/auth';
import { applyServerErrors, errorMessage } from '@/lib/forms';

function VerifyEmail() {
  const router = useRouter();
  const { confirmEmail, sendCode } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<VerifyEmailInput>({
    resolver: zodResolver(verifyEmailSchema),
    defaultValues: { email: useSearchParams().get('email') ?? '', code: '' },
  });

  const onSubmit = handleSubmit(async ({ email, code }) => {
    setFormError(null);
    try {
      if (await confirmEmail(email, code)) router.replace('/app');
      else setDone(true);
    } catch (error) {
      setFormError(applyServerErrors(error, setError));
    }
  });

  const resend = async () => {
    if (!(await trigger('email'))) return;
    setSending(true);
    setFormError(null);
    try {
      await sendCode(getValues('email'));
      setNote('We sent a new code. It works for 15 minutes.');
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <AuthFrame
        title="Email confirmed!"
        intro="Thank you. You can now sign in."
        footer={<TextLink href="/login">Go to sign in</TextLink>}
      >
        {null}
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Confirm your email"
      intro="We emailed you a 6 digit code. It works for 15 minutes."
      footer={<TextLink href="/login">Back to sign in</TextLink>}
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormError>{formError}</FormError>
        {note && (
          <p role="status" className="text-[15px] text-muted">
            {note}
          </p>
        )}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          error={errors.code?.message}
          {...register('code')}
        />
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          Confirm email
        </Button>
        <Button type="button" variant="secondary" loading={sending} onClick={resend}>
          Send me a new code
        </Button>
      </form>
    </AuthFrame>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
