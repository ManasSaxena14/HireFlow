import {
  ArrowRight,
  ArrowUp,
  BellRing,
  Building2,
  CalendarCheck,
  ChartNoAxesColumn,
  Check,
  Globe,
  KanbanSquare,
  ListChecks,
  Mail,
  MonitorSmartphone,
  MousePointer2,
  Plus,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { Hero } from '@/components/landing/hero';
import { SmoothScroll } from '@/components/landing/smooth-scroll';
import { NAV_LINKS } from '@/components/landing/nav-links';
import { StickyNav } from '@/components/landing/sticky-nav';
import { Logo } from '@/components/logo';
import { buttonClass } from '@/components/ui/button';

const stagger = (index: number) => ({ '--d': `${index * 7}%` }) as CSSProperties;

const STEPS_BAND = ['Saved', 'Applied', 'First round', 'Interview', 'Offer', 'Hired'];

function Band({ reverse, outline }: { reverse?: boolean; outline?: boolean }) {
  const items = [...STEPS_BAND, ...STEPS_BAND, ...STEPS_BAND, ...STEPS_BAND];
  return (
    <div
      className={`flex w-max items-center gap-10 will-change-transform ${reverse ? 'animate-marquee-back' : 'animate-marquee'}`}
    >
      {items.map((word, index) => (
        <span
          key={index}
          className={`font-display flex items-center gap-10 text-4xl font-extrabold tracking-tight whitespace-nowrap sm:text-6xl ${outline ? 'text-outline' : ''}`}
        >
          {word}
          <ArrowRight className="size-8 sm:size-12" strokeWidth={3} />
        </span>
      ))}
    </div>
  );
}

function MarqueeBands() {
  return (
    <div aria-hidden className="relative overflow-hidden py-14 sm:py-20">
      <div className="absolute inset-x-[-5%] top-1/2 -translate-y-1/2 rotate-2 border-y border-line-strong bg-raised py-4 text-muted sm:py-6">
        <Band reverse outline />
      </div>
      <div className="relative -mx-[5%] -rotate-2 bg-accent py-4 text-on-accent shadow-2xl shadow-black/50 sm:py-6">
        <Band />
      </div>
    </div>
  );
}

function SideRow({
  icon,
  children,
  index,
}: {
  icon: ReactNode;
  children: ReactNode;
  index: number;
}) {
  return (
    <li
      style={stagger(index)}
      className="reveal group/row flex items-center gap-4 py-5 transition-[padding] duration-500 hover:pl-3"
    >
      <span className="shrink-0 transition-transform duration-500 group-hover/row:scale-125">
        {icon}
      </span>
      <span className="flex-1">{children}</span>
      <ArrowRight
        aria-hidden
        className="size-5 shrink-0 -translate-x-3 opacity-0 transition duration-500 group-hover/row:translate-x-0 group-hover/row:opacity-100"
      />
    </li>
  );
}

function Sides() {
  return (
    <section className="grid lg:grid-cols-2" aria-label="Who HireFlow is for">
      <div className="relative flex min-h-[90dvh] flex-col justify-between gap-12 overflow-hidden bg-sunken p-8 sm:p-[4vw]">
        <div className="animate-float absolute top-[8%] right-[6%] hidden rotate-3 items-center gap-3 rounded-2xl border border-line-strong bg-raised p-3.5 shadow-2xl shadow-black/60 xl:flex">
          <span className="grid size-10 place-items-center rounded-xl bg-status-applied text-on-accent">
            <CalendarCheck aria-hidden className="size-5" />
          </span>
          <div>
            <p className="text-[13px] font-bold">Interview tomorrow</p>
            <p className="text-xs text-muted">Tessera, 10:30 AM</p>
          </div>
        </div>
        <div className="reveal">
          <span className="inline-grid size-16 place-items-center rounded-2xl bg-accent text-on-accent">
            <UserRound aria-hidden className="size-8" />
          </span>
          <p className="mt-8 text-lg font-bold text-accent">For job seekers</p>
          <h2 className="font-display mt-3 max-w-[14ch] text-[clamp(2.6rem,5vw,6rem)] leading-[0.98] font-extrabold tracking-tight">
            Never lose track of a job again.
          </h2>
        </div>
        <ul className="divide-y divide-line border-y border-line text-lg sm:text-xl">
          <SideRow index={0} icon={<KanbanSquare aria-hidden className="size-6 text-accent" />}>
            See all your jobs on one simple board
          </SideRow>
          <SideRow index={1} icon={<BellRing aria-hidden className="size-6 text-accent" />}>
            Get a reminder when it is time to follow up
          </SideRow>
          <SideRow
            index={2}
            icon={<ChartNoAxesColumn aria-hidden className="size-6 text-accent" />}
          >
            See how many companies reply to you
          </SideRow>
        </ul>
      </div>

      <div className="relative flex min-h-[90dvh] flex-col justify-between gap-12 overflow-hidden bg-accent p-8 text-on-accent sm:p-[4vw]">
        <div aria-hidden className="grid-lines-dark absolute inset-0" />
        <div className="reveal relative">
          <div className="flex items-start justify-between gap-4">
            <span className="inline-grid size-16 place-items-center rounded-2xl bg-on-accent text-accent">
              <Building2 aria-hidden className="size-8" />
            </span>
          </div>
          <p className="mt-8 text-lg font-bold">For companies</p>
          <h2 className="font-display mt-3 max-w-[14ch] text-[clamp(2.6rem,5vw,6rem)] leading-[0.98] font-extrabold tracking-tight">
            Hire together, without the mess.
          </h2>
        </div>
        <ul className="relative divide-y divide-on-accent/25 border-y border-on-accent/25 text-lg font-medium sm:text-xl">
          <SideRow index={0} icon={<ListChecks aria-hidden className="size-6" />}>
            Post jobs and follow every candidate
          </SideRow>
          <SideRow index={1} icon={<Globe aria-hidden className="size-6" />}>
            Share one careers page for all your jobs
          </SideRow>
          <SideRow index={2} icon={<Users aria-hidden className="size-6" />}>
            Give each team member the right access
          </SideRow>
        </ul>
      </div>
    </section>
  );
}

function DemoAddJob() {
  return (
    <div aria-hidden className="flex h-full flex-col justify-center gap-3">
      <div className="rounded-xl border border-line-strong bg-sunken px-3.5 py-3 text-sm font-medium">
        <span className="demo-type">Web Developer</span>
        <span className="demo-caret" />
      </div>
      <div className="demo-press inline-flex w-max items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-bold text-on-accent">
        <Plus className="size-4" strokeWidth={3} />
        Add to board
      </div>
      <div className="demo-appear flex items-center gap-3 rounded-xl border border-line-strong bg-overlay p-3">
        <Check className="size-5 text-status-offer" strokeWidth={3} />
        <span className="text-[13px] font-semibold">Added to your board</span>
      </div>
    </div>
  );
}

function DemoMoveCard() {
  return (
    <div aria-hidden className="relative grid h-full grid-cols-2 gap-3">
      {['Applied', 'Interview'].map((name, index) => (
        <div key={name} className="rounded-xl bg-sunken p-3">
          <div
            className="mb-2.5 h-1 rounded-full"
            style={{
              background: index === 0 ? 'var(--color-status-applied)' : 'var(--color-accent)',
            }}
          />
          <p className="text-xs font-bold">{name}</p>
        </div>
      ))}
      <div className="absolute inset-x-3 top-14 grid grid-cols-2 gap-9">
        <div className="demo-move relative rounded-xl border border-line-strong bg-overlay p-3">
          <p className="text-[13px] font-semibold">Web Developer</p>
          <p className="text-xs text-muted">Northwind</p>
          <MousePointer2 className="absolute -right-1 -bottom-2.5 size-5 fill-fg text-sunken" />
        </div>
      </div>
    </div>
  );
}

function DemoReminder() {
  return (
    <div aria-hidden className="flex h-full flex-col justify-center gap-3">
      <div className="demo-pop-one flex items-center gap-3 rounded-xl border border-line-strong bg-overlay p-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-on-accent">
          <BellRing className="demo-bell size-4" />
        </span>
        <span className="text-[13px] font-semibold">Time to follow up with Northwind</span>
      </div>
      <div className="demo-pop-two flex items-center gap-3 rounded-xl border border-line-strong bg-overlay p-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-status-applied text-on-accent">
          <Mail className="size-4" />
        </span>
        <span className="text-[13px] font-semibold">We also sent you an email</span>
      </div>
    </div>
  );
}

const STEPS = [
  {
    title: 'Add a job',
    text: 'Saw a job you like? Add it to your board in a few seconds.',
    demo: <DemoAddJob />,
  },
  {
    title: 'Move it along',
    text: 'Drag the card when something changes, like a new interview.',
    demo: <DemoMoveCard />,
  },
  {
    title: 'Get reminders',
    text: 'We tell you when to follow up, so you never miss a chance.',
    demo: <DemoReminder />,
  },
];

function HowItWorks() {
  return (
    <section
      id="how"
      className="flex min-h-dvh scroll-mt-16 flex-col justify-center px-5 py-24 sm:px-[4vw]"
    >
      <h2 className="reveal font-display text-[clamp(3rem,7vw,8rem)] leading-none font-extrabold tracking-tight">
        Three simple steps.
      </h2>
      <div aria-hidden className="mt-14 hidden h-1 overflow-hidden rounded-full bg-line lg:block">
        <div className="progress-fill h-full origin-left rounded-full bg-accent" />
      </div>
      <ol className="mt-6 grid gap-4 lg:grid-cols-3">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            style={stagger(index)}
            className="reveal spot card-lift flex flex-col gap-8 rounded-[28px] border border-line bg-raised p-7 hover:border-line-strong sm:p-8"
          >
            <div className="flex items-center gap-4">
              <span className="font-display grid size-14 shrink-0 place-items-center rounded-2xl bg-accent text-3xl font-extrabold text-on-accent">
                {index + 1}
              </span>
              <h3 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                {step.title}
              </h3>
            </div>
            <div className="h-52 overflow-hidden rounded-2xl border border-line bg-canvas p-4">
              {step.demo}
            </div>
            <p className="text-lg leading-relaxed text-muted">{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const REMINDER_FEED = [
  'Follow up with Northwind',
  'Interview at Tessera tomorrow',
  'Send your resume to Lumen',
  'Say thanks to Orbit',
];

function Features() {
  const base = 'reveal spot card-lift rounded-[28px] border p-8';
  const tile = `${base} border-line bg-raised`;
  return (
    <section
      id="features"
      className="grid scroll-mt-20 auto-rows-[minmax(17rem,auto)] gap-4 px-5 pb-24 sm:px-[4vw] lg:grid-cols-4"
    >
      <div className={`${tile} relative flex flex-col overflow-hidden lg:col-span-2 lg:row-span-2`}>
        <h3 className="font-display text-4xl font-extrabold tracking-tight sm:text-6xl">
          Drag. Drop. Done.
        </h3>
        <p className="mt-3 max-w-md text-lg text-muted">
          Your board updates right away. Use it with a mouse, a keyboard or your phone.
        </p>
        <div aria-hidden className="relative mt-10 grid flex-1 grid-cols-3 gap-3">
          {[
            ['Applied', 'var(--color-status-applied)'],
            ['Interview', 'var(--color-accent)'],
            ['Offer', 'var(--color-status-offer)'],
          ].map(([name, color]) => (
            <div key={name} className="min-h-64 rounded-2xl bg-sunken p-3">
              <div className="mb-2.5 h-1 rounded-full" style={{ background: color }} />
              <p className="text-sm font-bold">{name}</p>
            </div>
          ))}
          <div className="absolute inset-x-3 top-16 grid grid-cols-3 gap-9">
            <div className="demo-three relative z-10 rounded-xl border border-line-strong bg-overlay p-3 shadow-xl shadow-black/40">
              <p className="truncate text-[13px] font-semibold">Web Developer</p>
              <p className="truncate text-xs text-muted">Northwind</p>
              <MousePointer2 className="absolute -right-1 -bottom-2.5 size-5 fill-fg text-sunken" />
            </div>
          </div>
        </div>
      </div>

      <div
        className={`${base} relative flex flex-col justify-between overflow-hidden border-transparent bg-accent text-on-accent lg:col-span-2`}
      >
        <div
          aria-hidden
          className="feed-mask absolute inset-y-0 right-6 hidden w-64 overflow-hidden sm:block"
        >
          <div className="animate-feed flex flex-col gap-2">
            {[...REMINDER_FEED, ...REMINDER_FEED].map((text, index) => (
              <p
                key={index}
                className="rounded-xl bg-on-accent px-3.5 py-3 text-[13px] font-semibold text-fg"
              >
                {text}
              </p>
            ))}
          </div>
        </div>
        <BellRing aria-hidden className="size-10" />
        <div className="relative max-w-xs">
          <h3 className="font-display text-4xl font-extrabold tracking-tight">
            Reminders that work
          </h3>
          <p className="mt-2 text-lg font-medium">In the app and in your email. Each one, once.</p>
        </div>
      </div>

      <div className={`${tile} flex flex-col justify-between`}>
        <div aria-hidden className="ring-scroll grid size-28 place-items-center rounded-full">
          <span className="count-scroll font-display grid size-20 place-items-center rounded-full bg-raised text-2xl font-extrabold" />
        </div>
        <h3 className="font-display mt-6 text-3xl font-extrabold tracking-tight">
          Know your numbers
        </h3>
      </div>

      <div className={`${tile} flex flex-col justify-between`}>
        <div aria-hidden className="relative grid size-20 place-items-center">
          <span className="animate-pulse-ring absolute inset-0 rounded-full border-2 border-status-applied" />
          <span className="animate-pulse-ring absolute inset-0 rounded-full border-2 border-status-applied [animation-delay:1.3s]" />
          <ShieldCheck className="size-11 text-status-applied" />
        </div>
        <div className="mt-6">
          <h3 className="font-display text-3xl font-extrabold tracking-tight">Your data is safe</h3>
          <p className="mt-2 text-muted">Only you can see your jobs.</p>
        </div>
      </div>

      <div className={`${tile} flex flex-col justify-between lg:col-span-2`}>
        <ol aria-hidden className="flex items-start">
          {[
            ['Saved', 'var(--color-status-saved)'],
            ['Applied', 'var(--color-status-applied)'],
            ['First round', 'var(--color-status-screening)'],
            ['Interview', 'var(--color-accent)'],
            ['Offer', 'var(--color-status-offer)'],
          ].map(([name, color], index) => (
            <li key={name} className="flex-1">
              <div className="flex items-center">
                <span
                  className="demo-dot size-4 shrink-0 rounded-full"
                  style={{ background: color, animationDelay: `${index * 0.5}s` }}
                />
                {index < 4 && <span className="h-0.5 flex-1 bg-line-strong" />}
              </div>
              <p className="mt-2.5 hidden text-xs font-semibold text-muted sm:block">{name}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6">
          <h3 className="font-display text-3xl font-extrabold tracking-tight">
            See the full story
          </h3>
          <p className="mt-2 text-muted">Every job keeps its own history, notes and reminders.</p>
        </div>
      </div>

      <div className={`${tile} flex items-center justify-between gap-8 lg:col-span-2`}>
        <div>
          <h3 className="font-display text-3xl font-extrabold tracking-tight">
            Works on any screen
          </h3>
          <p className="mt-2 text-muted">Your phone, your laptop or a big monitor.</p>
        </div>
        <MonitorSmartphone
          aria-hidden
          className="animate-float size-24 shrink-0 text-accent"
          strokeWidth={1.25}
        />
      </div>
    </section>
  );
}

const QUESTIONS = [
  {
    q: 'Is HireFlow free?',
    a: 'Yes. You can sign up and use the job board for free.',
  },
  {
    q: 'Who can see my jobs?',
    a: 'Only you. Your board, notes and reminders are private to your account.',
  },
  {
    q: 'When do I get reminders?',
    a: 'We remind you 7 days after you apply for a job. You can also add your own reminders at any time.',
  },
  {
    q: 'Can I use it on my phone?',
    a: 'Yes. The whole site works on phones. Swipe to move across the board, or use the menu on each card to move it.',
  },
  {
    q: 'Can companies use it today?',
    a: 'Yes. Companies can post jobs, share a careers page, follow every candidate, book interviews and work as a team.',
  },
];

function Questions() {
  return (
    <section
      id="questions"
      className="grid scroll-mt-20 gap-10 border-t border-line px-5 py-24 sm:px-[4vw] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]"
    >
      <h2 className="reveal font-display text-[clamp(3rem,6vw,7rem)] leading-none font-extrabold tracking-tight">
        Good questions.
      </h2>
      <div className="divide-y divide-line border-y border-line">
        {QUESTIONS.map((item, index) => (
          <details key={item.q} style={stagger(index)} className="reveal faq group/faq">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-xl font-bold transition-colors hover:text-accent sm:text-2xl [&::-webkit-details-marker]:hidden">
              {item.q}
              <Plus
                aria-hidden
                className="size-6 shrink-0 transition-transform duration-500 group-open/faq:rotate-45"
              />
            </summary>
            <p className="max-w-2xl pb-6 text-lg leading-relaxed text-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCall() {
  return (
    <section className="relative flex min-h-dvh flex-col justify-center overflow-hidden bg-accent px-5 py-24 text-on-accent sm:px-[4vw]">
      <div aria-hidden className="grid-lines-dark absolute inset-0" />
      <div
        aria-hidden
        className="animate-float absolute top-[14%] right-[6%] hidden rotate-3 rounded-2xl bg-on-accent p-4 text-fg shadow-2xl shadow-black/30 lg:block"
      >
        <p className="text-[13px] text-muted">Your board</p>
        <p className="font-display text-3xl font-extrabold">12 jobs</p>
      </div>
      <div
        aria-hidden
        className="animate-float absolute right-[14%] bottom-[14%] hidden -rotate-2 items-center gap-3 rounded-2xl bg-on-accent p-4 text-fg shadow-2xl shadow-black/30 [animation-delay:-3s] lg:flex"
      >
        <Check className="size-7 text-status-offer" strokeWidth={3} />
        <p className="text-[15px] font-bold">You got an offer</p>
      </div>
      <h2 className="font-display relative text-[clamp(4rem,13vw,16rem)] leading-[0.88] font-extrabold tracking-[-0.04em]">
        <span className="reveal block">Your next job</span>
        <span className="reveal block" style={stagger(1)}>
          starts here.
        </span>
      </h2>
      <div className="reveal relative mt-12" style={stagger(2)}>
        <Link href="/register" className={`${buttonClass('dark', 'xl')} shine group`}>
          Create your free account
          <ArrowRight
            aria-hidden
            className="size-5 transition-transform group-hover:translate-x-1.5"
            strokeWidth={2.5}
          />
        </Link>
      </div>
    </section>
  );
}

const JOURNEY = [
  { name: 'Saved', color: 'var(--color-status-saved)' },
  { name: 'Applied', color: 'var(--color-status-applied)' },
  { name: 'First round', color: 'var(--color-status-screening)' },
  { name: 'Interview', color: 'var(--color-accent)' },
  { name: 'Offer', color: 'var(--color-status-offer)' },
];

function JourneyLine() {
  return (
    <div aria-hidden className="reveal relative mx-1 pt-1 pb-8">
      <div className="absolute inset-x-0 top-[9px] h-0.5 bg-line-strong" />
      <div className="journey-fill absolute inset-x-0 top-[9px] h-0.5 origin-left bg-accent" />
      <ol className="relative flex justify-between">
        {JOURNEY.map((stop, index) => (
          <li key={stop.name} className="relative size-4">
            <span
              className="block size-4 rounded-full ring-4 ring-sunken"
              style={{ background: stop.color }}
            />
            <span
              className={`absolute top-6 text-xs font-semibold whitespace-nowrap text-muted sm:text-[13px] ${
                index === 0
                  ? 'left-0'
                  : index === JOURNEY.length - 1
                    ? 'right-0'
                    : 'left-1/2 -translate-x-1/2'
              }`}
            >
              {stop.name}
            </span>
          </li>
        ))}
      </ol>
      <div className="journey-mover absolute inset-x-0 top-0">
        <span className="absolute top-[-3px] -left-3 size-6 rounded-full border-[3px] border-fg bg-accent shadow-[0_0_24px_6px_rgb(255_75_50/0.55)]" />
      </div>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  const inner = (
    <>
      <ArrowRight
        aria-hidden
        className="size-4 -translate-x-2 text-accent opacity-0 transition duration-500 group-hover/link:translate-x-0 group-hover/link:opacity-100"
        strokeWidth={2.5}
      />
      <span className="-ml-4 transition-transform duration-500 group-hover/link:translate-x-5">
        {children}
      </span>
    </>
  );
  const style =
    'group/link inline-flex items-center gap-0 text-[15px] font-medium text-muted transition-colors hover:text-fg';
  return href.startsWith('#') ? (
    <a href={href} className={style}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={style}>
      {inner}
    </Link>
  );
}

const SOON = ['Interview practice', 'Hiring numbers'];

function Footer() {
  const word = 'HireFlow'.split('');
  return (
    <footer className="relative z-10 -mt-10 overflow-hidden rounded-t-[40px] bg-sunken shadow-[0_-30px_60px_-20px_rgb(0_0_0/0.45)]">
      <div className="px-5 pt-14 sm:px-[4vw] sm:pt-20">
        <div className="grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="reveal col-span-2 lg:col-span-1">
            <Logo className="text-2xl" />
            <p className="font-display mt-6 max-w-md text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">
              Two-sided hiring platform.
            </p>
            <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-muted">
              For people looking for a job, and for the teams looking for them.
            </p>
          </div>

          <nav aria-label="Explore" className="reveal" style={stagger(1)}>
            <h2 className="text-sm font-bold">Explore</h2>
            <ul className="mt-4 space-y-3">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <FooterLink href={link.href}>{link.label}</FooterLink>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Your account" className="reveal" style={stagger(2)}>
            <h2 className="text-sm font-bold">Your account</h2>
            <ul className="mt-4 space-y-3">
              <li>
                <FooterLink href="/register">Create account</FooterLink>
              </li>
              <li>
                <FooterLink href="/login">Sign in</FooterLink>
              </li>
              <li>
                <FooterLink href="/forgot-password">Forgot password</FooterLink>
              </li>
            </ul>
          </nav>

          <div className="reveal" style={stagger(3)}>
            <h2 className="flex items-center gap-2 text-sm font-bold">
              Coming soon
              <span className="animate-soon size-2 rounded-full bg-accent" />
            </h2>
            <ul className="mt-4 space-y-3 text-[15px] text-subtle">
              {SOON.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-16 sm:mt-20">
          <JourneyLine />
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-sm text-muted">
          <p>© {new Date().getFullYear()} HireFlow</p>
          <a
            href="#top"
            className="group/top inline-flex items-center gap-2.5 font-semibold transition-colors hover:text-fg"
          >
            Back to top
            <span className="grid size-9 place-items-center rounded-full border border-line-strong transition duration-500 group-hover/top:-translate-y-1 group-hover/top:border-accent group-hover/top:bg-accent group-hover/top:text-on-accent">
              <ArrowUp aria-hidden className="size-4" strokeWidth={2.5} />
            </span>
          </a>
        </div>
      </div>

      <div aria-hidden className="wordmark spot mt-6 select-none">
        <p className="font-display flex justify-center text-[23vw] leading-[0.82] font-extrabold tracking-[-0.05em] text-raised">
          {word.map((letter, index) => (
            <span key={index} className="reveal inline-block" style={stagger(index * 0.6)}>
              {letter}
            </span>
          ))}
        </p>
        <p className="wordmark-light font-display absolute inset-0 flex justify-center text-[23vw] leading-[0.82] font-extrabold tracking-[-0.05em]">
          {word.map((letter, index) => (
            <span key={index} className="inline-block">
              {letter}
            </span>
          ))}
        </p>
      </div>
    </footer>
  );
}

export default function HomePage() {
  return (
    <main id="top">
      <SmoothScroll />
      <div
        aria-hidden
        className="scroll-bar fixed inset-x-0 top-0 z-50 h-[3px] origin-left bg-accent"
      />
      <StickyNav />
      <Hero />
      <MarqueeBands />
      <Sides />
      <HowItWorks />
      <Features />
      <Questions />
      <FinalCall />
      <Footer />
    </main>
  );
}
