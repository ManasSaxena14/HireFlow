import type { PublicJobList } from '@hireflow/shared';
import { ArrowRight, Home, MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Logo } from '@/components/logo';
import { fetchPublic } from '@/lib/careers';

type Props = { params: Promise<{ slug: string }> };

const loadJobs = (slug: string) =>
  fetchPublic<PublicJobList>(`/companies/${encodeURIComponent(slug)}/jobs?limit=100`);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadJobs((await params).slug);
  return { title: data ? `Jobs at ${data.company.name}` : 'Careers' };
}

export default async function CareersPage({ params }: Props) {
  const { slug } = await params;
  const data = await loadJobs(slug);
  if (!data) notFound();
  const { company, items } = data;

  return (
    <>
      <section className="relative flex min-h-[62dvh] flex-col justify-between overflow-hidden bg-accent px-5 py-6 text-on-accent sm:px-[4vw] sm:py-8">
        <p className="animate-fade-up text-[15px] font-bold">Careers</p>
        <div className="mt-20">
          <h1 className="font-display animate-fade-up text-[clamp(3.4rem,11vw,13rem)] leading-[0.9] font-extrabold tracking-tight">
            {company.name}
          </h1>
          <p
            className="animate-fade-up mt-6 text-xl font-semibold sm:text-2xl"
            style={{ animationDelay: '200ms' }}
          >
            {items.length === 0
              ? 'No open jobs right now.'
              : items.length === 1
                ? '1 open job. It could be yours.'
                : `${items.length} open jobs. One could be yours.`}
          </p>
        </div>
      </section>

      <main className="flex-1 px-5 py-10 sm:px-[4vw] sm:py-16">
        {items.length === 0 ? (
          <p className="font-display text-3xl font-extrabold tracking-tight text-muted sm:text-5xl">
            Please check back soon.
          </p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {items.map((job, index) => (
              <li
                key={job.slug}
                className="animate-fade-up"
                style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
              >
                <Link
                  href={`/c/${company.slug}/jobs/${job.slug}`}
                  className="group flex flex-wrap items-center gap-x-8 gap-y-2 py-6 transition-[padding] hover:pl-3 sm:py-8"
                >
                  <h2 className="font-display min-w-0 flex-1 basis-96 text-3xl leading-tight font-extrabold tracking-tight transition group-hover:text-accent sm:text-5xl">
                    {job.title}
                  </h2>
                  <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[15px] text-muted">
                    {job.location && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin aria-hidden className="size-4" />
                        {job.location}
                      </span>
                    )}
                    {job.remote && (
                      <span className="inline-flex items-center gap-1.5">
                        <Home aria-hidden className="size-4" />
                        From home
                      </span>
                    )}
                    {job.employmentType && <span>{job.employmentType}</span>}
                  </p>
                  <span className="grid size-12 shrink-0 place-items-center rounded-full border border-line-strong transition group-hover:border-accent group-hover:bg-accent group-hover:text-on-accent">
                    <ArrowRight aria-hidden className="size-5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <footer className="flex items-center justify-between gap-4 border-t border-line px-5 py-6 text-sm text-muted sm:px-[4vw]">
        <span>Hiring on</span>
        <Link href="/" className="text-lg">
          <Logo />
        </Link>
      </footer>
    </>
  );
}
