'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ApplicationDetails } from '@/components/tracker/application-details';

export default function ApplicationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  return (
    <div className="p-4 sm:p-6">
      <Link
        href="/app/tracker"
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-fg"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Back to my board
      </Link>
      <div className="mt-4">
        <ApplicationDetails
          id={id}
          layout="page"
          onArchived={() => router.replace('/app/tracker')}
        />
      </div>
    </div>
  );
}
