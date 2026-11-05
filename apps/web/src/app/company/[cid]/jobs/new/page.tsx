'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { JobForm } from '@/components/hiring/job-form';
import { useCreateJob } from '@/lib/ats';
import { useCompanyRole } from '../../use-membership';

export default function NewJobPage() {
  const { cid } = useCompanyRole();
  const router = useRouter();
  const create = useCreateJob(cid);

  return (
    <div className="grid min-h-full gap-4 p-4 sm:p-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section className="animate-fade-up flex flex-col justify-between rounded-[28px] bg-accent p-6 text-on-accent sm:p-10">
        <Link
          href={`/company/${cid}/jobs`}
          className="inline-flex items-center gap-2 self-start text-sm font-bold"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Back to jobs
        </Link>
        <div className="mt-16">
          <h1 className="font-display text-[clamp(3rem,5.5vw,6.5rem)] leading-[0.95] font-extrabold tracking-tight">
            Post a new job.
          </h1>
          <p className="mt-4 max-w-sm text-lg font-medium">
            It stays a draft until you make it live, so take your time.
          </p>
        </div>
      </section>
      <section
        className="animate-fade-up rounded-[24px] border border-line bg-raised/60 p-5 sm:p-8"
        style={{ animationDelay: '80ms' }}
      >
        <JobForm
          submitLabel="Save draft"
          onCancel={() => router.push(`/company/${cid}/jobs`)}
          onSubmit={async (values) => {
            const job = await create.mutateAsync(values);
            router.replace(`/company/${cid}/jobs/${job.id}`);
          }}
        />
      </section>
    </div>
  );
}
