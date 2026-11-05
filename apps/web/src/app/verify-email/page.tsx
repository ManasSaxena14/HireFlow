'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { AuthFrame, TextLink } from '@/components/auth-frame';
import { api } from '@/lib/api';

function VerifyEmail() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<'working' | 'done' | 'failed'>(token ? 'working' : 'failed');
  // Tokens are single use, so this must not fire twice under Strict Mode.
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    api('/auth/verify-email', { method: 'POST', body: { token }, auth: false })
      .then(() => setState('done'))
      .catch(() => setState('failed'));
  }, [token]);

  if (state === 'working') return <AuthFrame title="Confirming your email…">{null}</AuthFrame>;
  if (state === 'done') {
    return (
      <AuthFrame
        title="Email confirmed"
        intro="Thanks. Reminders will now reach you at this address."
        footer={<TextLink href="/app">Open HireFlow</TextLink>}
      >
        {null}
      </AuthFrame>
    );
  }
  return (
    <AuthFrame
      title="This link no longer works"
      intro="It may have expired or already been used."
      footer={<TextLink href="/login">Back to sign in</TextLink>}
    >
      {null}
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
