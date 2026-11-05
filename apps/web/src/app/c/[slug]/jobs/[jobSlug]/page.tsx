import type { PublicJobDetail } from '@hireflow/shared';
import { ArrowLeft, Clock, Home, MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApplyForm } from '@/components/hiring/apply-form';
import { Logo } from '@/components/logo';
import { fetchPublic } from '@/lib/careers';

type Props = { params: Promise<{ slug: string; jobSlug: string }> };

const loadJob = (slug: string, jobSlug: string) =>
  fetchPublic<PublicJobDetail>(
    `/companies/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(jobSlug)}`,
  );

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, jobSlug } = await params;
  const data = await loadJob(slug, jobSlug);
  return { title: data ? `${data.job.title} at ${data.company.name}` : 'Job' };
}

export default async function PublicJobPage({ params }: Props) {
  const { slug, jobSlug } = await params;
  const data = await loadJob(slug, jobSlug);
  if (!data) notFound();
  const { company, job } = data;

  return (
    <>
      <header className="bg-accent px-5 pt-6 pb-10 text-on-accent sm:px-[4vw] sm:pb-14">
        <Link
          href={`/c/${company.slug}`}
          className="inline-flex items-center gap-2 text-[15px] font-bold"
        >
          <ArrowLeft aria-hidden className="size-4" />
          All jobs at {company.name}
        </Link>
        <h1 className="font-display animate-fade-up mt-14 text-[clamp(3rem,8vw,9rem)] leading-[0.95] font-extrabold tracking-tight">
          {job.title}
        </h1>
        <ul className="mt-6 flex flex-wrap gap-2 text-[15px] font-semibold">
          {job.location && (
            <li className="inline-flex items-center gap-1.5 rounded-full bg-on-accent px-4 py-2 text-fg">
              <MapPin aria-hidden className="size-4" />
              {job.location}
            </li>
          )}
          {job.remote && (
            <li className="inline-flex items-center gap-1.5 rounded-full bg-on-accent px-4 py-2 text-fg">
              <Home aria-hidden className="size-4" />
              From home
            </li>
          )}
          {job.employmentType && (
            <li className="inline-flex items-center gap-1.5 rounded-full bg-on-accent px-4 py-2 text-fg">
              <Clock aria-hidden className="size-4" />
              {job.employmentType}
            </li>
          )}
        </ul>
      </header>

      <main className="grid flex-1 items-start gap-8 px-5 py-10 sm:px-[4vw] sm:py-14 lg:grid-cols-[minmax(0,3fr)_minmax(24rem,2fr)]">
        <article className="animate-fade-up">
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            About this job
          </h2>
          <p className="mt-5 max-w-[70ch] text-lg leading-relaxed whitespace-pre-wrap text-muted">
            {job.description}
          </p>
          {job.skills.length > 0 && (
            <>
              <h2 className="font-display mt-10 text-3xl font-extrabold tracking-tight sm:text-4xl">
                Skills
              </h2>
              <ul className="mt-5 flex flex-wrap gap-2">
                {job.skills.map((skill) => (
                  <li
                    key={skill}
                    className="rounded-full border border-line-strong px-4 py-2 text-[15px] font-medium"
                  >
                    {skill}
                  </li>
                ))}
              </ul>
            </>
          )}
        </article>
        <aside
          className="animate-fade-up rounded-[24px] border border-line bg-raised p-5 sm:p-7 lg:sticky lg:top-6"
          style={{ animationDelay: '120ms' }}
        >
          <h2 className="font-display mb-5 text-3xl font-extrabold tracking-tight">Apply now</h2>
          <ApplyForm
            companySlug={company.slug}
            jobSlug={job.slug}
            jobTitle={job.title}
            companyName={company.name}
          />
        </aside>
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
