'use client';

import { LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { AppShell } from './app-shell';

/** Sends people who are not signed in to the login page. */
export function ProtectedArea({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status, restore } = useAuth();

  useEffect(() => {
    if (status === 'idle') void restore();
    if (status === 'anonymous') router.replace('/login');
  }, [status, restore, router]);

  if (status !== 'authenticated') {
    return (
      <div className="grid min-h-dvh place-items-center" role="status" aria-label="Loading">
        <LoaderCircle aria-hidden className="size-5 animate-spin text-muted" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
