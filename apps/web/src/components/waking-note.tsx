'use client';

import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { onServerWaking, wakeServer } from '@/lib/api';

/**
 * Wakes the server when any page opens, and shows a small note if a request has to wait
 * for it. On a free host the server sleeps when nobody uses it, and waking takes a moment.
 */
export function WakingNote() {
  const [waking, setWaking] = useState(false);

  useEffect(() => {
    wakeServer();
    return onServerWaking(setWaking);
  }, []);

  if (!waking) return null;
  return (
    <div
      role="status"
      className="animate-fade-up fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line-strong bg-raised px-4 py-3 text-sm shadow-lg"
    >
      <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin text-accent" />
      <span>
        <span className="font-semibold">Starting the server.</span>{' '}
        <span className="text-muted">It was resting, and waking can take up to a minute.</span>
      </span>
    </div>
  );
}
