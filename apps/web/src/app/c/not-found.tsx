import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';

export default function CareersNotFound() {
  return (
    <div className="flex min-h-dvh items-center p-4 sm:p-6">
      <EmptyState
        className="w-full"
        title="This page is not here"
        action={
          <Link href="/" className={buttonClass('primary', 'lg')}>
            Go to HireFlow
          </Link>
        }
      >
        The job may be closed, or the link may be wrong.
      </EmptyState>
    </div>
  );
}
