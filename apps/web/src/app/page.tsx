import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/logo';
import { buttonClass } from '@/components/ui/button';

interface PreviewCard {
  title: string;
  company: string;
  note: string;
  hot?: boolean;
}

const PREVIEW: { status: string; cards: PreviewCard[] }[] = [
  {
    status: 'Applied',
    cards: [
      { title: 'Platform Engineer', company: 'Northwind', note: 'Follow up in 6 days' },
      { title: 'Backend Developer', company: 'Halcyon Labs', note: 'Applied Tuesday' },
    ],
  },
  {
    status: 'Screening',
    cards: [{ title: 'Full Stack Engineer', company: 'Meridian', note: 'Recruiter call Friday' }],
  },
  {
    status: 'Interview',
    cards: [
      { title: 'Software Engineer II', company: 'Tessera', note: 'System design round', hot: true },
    ],
  },
  { status: 'Offer', cards: [] },
];

const SIDES = [
  {
    label: 'For candidates',
    heading: 'Stop losing track of where you applied.',
    points: [
      'One board for every application, with its full history',
      'Follow-up reminders that arrive when they are due',
      'Response rate and funnel numbers from your own search',
    ],
    status: 'Available now',
  },
  {
    label: 'For hiring teams',
    heading: 'Run a pipeline your whole panel can follow.',
    points: [
      'Careers page, stages and scorecards in one workspace',
      'Scheduling that refuses to double-book anyone',
      'Roles that keep each interviewer to their own candidates',
    ],
    status: 'In development',
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <header className="flex h-18 items-center justify-between">
        <Logo className="text-lg" />
        <nav className="flex items-center gap-2">
          <Link href="/login" className={buttonClass('ghost')}>
            Sign in
          </Link>
          <Link href="/register" className={buttonClass('primary')}>
            Get started
          </Link>
        </nav>
      </header>

      <main>
        <section className="pt-16 pb-14 sm:pt-24">
          <p className="font-mono text-xs tracking-widest text-muted uppercase">
            Two-sided hiring platform
          </p>
          <h1 className="mt-5 max-w-4xl text-[42px] leading-[1.05] font-semibold tracking-[-0.02em] sm:text-[68px]">
            Hiring, run properly from both sides of the table.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            HireFlow gives job seekers a clear record of their search and gives teams a pipeline
            they can trust.
          </p>
          <Link href="/register" className={`${buttonClass('primary', 'lg')} mt-9`}>
            Start tracking applications
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </section>

        <section
          aria-label="Example of the application board"
          className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0"
        >
          <div className="grid min-w-[760px] grid-cols-4 gap-px overflow-hidden rounded-panel border border-line bg-line">
            {PREVIEW.map((column) => (
              <div key={column.status} className="min-h-64 bg-sunken p-3">
                <p className="flex items-center justify-between px-1 pb-3 text-[13px] font-medium">
                  {column.status}
                  <span className="font-mono text-xs text-subtle">{column.cards.length}</span>
                </p>
                <div className="space-y-2">
                  {column.cards.map((card) => (
                    <div
                      key={card.title}
                      className="rounded-control border border-line bg-raised p-3"
                    >
                      <p className="text-sm font-medium">{card.title}</p>
                      <p className="mt-0.5 text-[13px] text-muted">{card.company}</p>
                      <p
                        className={`mt-3 font-mono text-[11px] ${card.hot ? 'text-accent' : 'text-subtle'}`}
                      >
                        {card.note}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-px py-20 md:grid-cols-2 md:gap-16">
          {SIDES.map((side) => (
            <div key={side.label} className="border-t border-line-strong py-8">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-sm font-medium text-muted">{side.label}</h2>
                <span className="font-mono text-[11px] tracking-wide text-subtle uppercase">
                  {side.status}
                </span>
              </div>
              <p className="mt-4 text-[28px] leading-tight font-semibold tracking-tight">
                {side.heading}
              </p>
              <ul className="mt-6 space-y-3 text-[15px] text-muted">
                {side.points.map((point) => (
                  <li key={point} className="flex gap-3">
                    <span aria-hidden className="mt-2.5 h-px w-3 shrink-0 bg-accent" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </main>

      <footer className="flex items-center justify-between border-t border-line py-8 text-[13px] text-subtle">
        <Logo className="text-muted" />
        <span>Two-sided hiring platform</span>
      </footer>
    </div>
  );
}
