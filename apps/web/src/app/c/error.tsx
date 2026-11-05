'use client';

import { ErrorState } from '@/components/ui/states';

export default function CareersError({ reset }: { reset: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <ErrorState message="We could not load this page. Please try again." onRetry={reset} />
    </div>
  );
}
