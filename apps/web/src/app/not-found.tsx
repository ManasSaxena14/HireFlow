import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';

export default function NotFound() {
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
        The link may be wrong, or the page may have moved.
      </EmptyState>
    </div>
  );
}
