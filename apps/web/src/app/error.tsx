'use client';

import { ErrorState } from '@/components/ui/states';

export default function AppError({ reset }: { reset: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <ErrorState message="Something went wrong on this page. Please try again." onRetry={reset} />
    </div>
  );
}
