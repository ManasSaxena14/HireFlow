'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { AuthFrame, TextLink } from '@/components/auth-frame';
import { api } from '@/lib/api';

function VerifyEmail() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<'working' | 'done' | 'failed'>(token ? 'working' : 'failed');
  // A token works only once, so this must not run twice in Strict Mode.
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    api('/auth/verify-email', { method: 'POST', body: { token }, auth: false })
      .then(() => setState('done'))
      .catch(() => setState('failed'));
  }, [token]);

  if (state === 'working') return <AuthFrame title="Checking your link…">{null}</AuthFrame>;
  if (state === 'done') {
    return (
      <AuthFrame
        title="Email confirmed!"
        intro="Thank you. We will send your reminders to this email."
        footer={<TextLink href="/app">Open HireFlow</TextLink>}
      >
        {null}
      </AuthFrame>
    );
  }
  return (
    <AuthFrame
      title="This link does not work"
      intro="It may be too old, or you may have used it already."
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
