'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ApplicationDetails } from '@/components/tracker/application-details';

export default function ApplicationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  return (
    <div className="mx-auto max-w-2xl py-6">
      <Link
        href="/app/tracker"
        className="mx-5 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        All applications
      </Link>
      <div className="mt-3">
        <ApplicationDetails id={id} onArchived={() => router.replace('/app/tracker')} />
      </div>
    </div>
  );
}
