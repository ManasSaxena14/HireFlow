'use client';

import { ArrowRight, BellRing, Check, ChevronDown, MousePointer2, PartyPopper } from 'lucide-react';
import Link from 'next/link';
import { type CSSProperties, type ReactNode, useEffect, useRef } from 'react';
import { Logo } from '@/components/logo';
import { buttonClass } from '@/components/ui/button';
import { NAV_LINKS } from './nav-links';

/** Lets the scene follow the mouse. It sways slowly when the mouse is away. */
function usePointerScene() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const scene = ref.current;
    if (!scene || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Set on each moving layer only, so the browser does not recheck the whole hero.
    const layers = scene.querySelectorAll<HTMLElement>('[data-depth]');
    let targetX = 0;
    let targetY = 0;
    let x = 0;
    let y = 0;
    let frame = 0;
    let pointerInside = false;
    let visible = true;

    const tick = (time: number) => {
      if (!pointerInside) {
        targetX = Math.sin(time / 2600) * 0.35;
        targetY = Math.cos(time / 3400) * 0.25;
      }
      // Moves a small part of the way each frame, which gives the soft follow.
      x += (targetX - x) * 0.04;
      y += (targetY - y) * 0.04;
      for (const layer of layers) {
        layer.style.setProperty('--mx', x.toFixed(4));
        layer.style.setProperty('--my', y.toFixed(4));
      }
      frame = visible ? requestAnimationFrame(tick) : 0;
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const box = scene.getBoundingClientRect();
      targetX = ((event.clientX - box.left) / box.width - 0.5) * 2;
      targetY = ((event.clientY - box.top) / box.height - 0.5) * 2;
      pointerInside = true;
    };
    const onLeave = () => {
      pointerInside = false;
    };

    // Stops the work when the hero has scrolled out of view.
    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible && !frame) frame = requestAnimationFrame(tick);
    });
    observer.observe(scene);

    scene.addEventListener('pointermove', onMove);
    scene.addEventListener('pointerleave', onLeave);
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.removeEventListener('pointermove', onMove);
      scene.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return ref;
}

function Word({ children, delay }: { children: ReactNode; delay: number }) {
  return (
    <span className="-my-[0.12em] inline-block overflow-hidden py-[0.12em] align-bottom">
      <span
        className="animate-word-up inline-block"
        style={{ animationDelay: `${delay}ms` } as CSSProperties}
      >
        {children}
      </span>
    </span>
  );
}

function MiniCard({
  title,
  company,
  color,
  delay,
}: {
  title: string;
  company: string;
  color: string;
  delay?: number;
}) {
  return (
    <div
      className={delay === undefined ? '' : 'animate-pop-in'}
      style={delay === undefined ? undefined : { animationDelay: `${delay}ms` }}
    >
      <div className="rounded-xl border border-line-strong bg-raised p-3 shadow-lg shadow-black/40">
        <div className="flex items-center gap-2.5">
          <span
            className="font-display hidden size-8 shrink-0 place-items-center rounded-lg text-sm font-extrabold text-on-accent sm:grid"
            style={{ background: color }}
          >
            {company[0]}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">{title}</p>
            <p className="truncate text-xs text-muted">{company}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const BOARD_COLUMNS = [
  { label: 'Applied', color: 'var(--color-status-applied)' },
  { label: 'Interview', color: 'var(--color-status-interview)' },
  { label: 'Offer', color: 'var(--color-status-offer)' },
];

const WEEK_BARS = [28, 46, 34, 62, 50, 78, 100];

function WeekStrip() {
  return (
    <div className="mt-3 flex items-center justify-between gap-6 rounded-xl bg-sunken px-4 py-3">
      <div>
        <p className="text-xs font-semibold text-muted">This week</p>
        <p className="font-display mt-0.5 text-xl leading-none font-extrabold">8 applied</p>
      </div>
      <div className="flex h-9 items-end gap-1.5">
        {WEEK_BARS.map((height, index) => (
          <span
            key={index}
            className={`animate-bar-up w-2 origin-bottom rounded-full ${
              index === WEEK_BARS.length - 1 ? 'bg-accent' : 'bg-line-strong'
            }`}
            style={{ height: `${height}%`, animationDelay: `${1500 + index * 70}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function HeroBoard() {
  return (
    <div aria-hidden className="animate-board-in relative w-full [perspective:1600px]">
      <div
        data-depth
        className="depth-board hero-board rounded-[24px] border border-line-strong bg-canvas p-3 sm:p-4"
      >
        <div className="mb-3 flex items-center gap-1.5 px-1">
          <span className="size-2.5 rounded-full bg-accent" />
          <span className="size-2.5 rounded-full bg-status-screening" />
          <span className="size-2.5 rounded-full bg-status-offer" />
          <span className="ml-3 text-xs font-semibold text-muted">My job board</span>
        </div>
        <div className="relative grid grid-cols-3 gap-3">
          {BOARD_COLUMNS.map((column) => (
            <div key={column.label} className="min-h-72 rounded-xl bg-sunken p-2.5">
              <div className="mb-3 h-1 rounded-full" style={{ background: column.color }} />
              <p className="mb-3 px-0.5 text-xs font-bold">{column.label}</p>
            </div>
          ))}
          <div className="absolute inset-x-2.5 top-14 flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-[32px]">
              <MiniCard
                title="Data Analyst"
                company="Tessera"
                color="var(--color-status-applied)"
                delay={1000}
              />
              <MiniCard
                title="UI Designer"
                company="Lumen"
                color="var(--color-status-screening)"
                delay={1090}
              />
              <MiniCard
                title="Team Lead"
                company="Orbit"
                color="var(--color-status-offer)"
                delay={1180}
              />
            </div>
            <div className="grid grid-cols-3 gap-[32px]">
              <MiniCard
                title="QA Engineer"
                company="Meridian"
                color="var(--color-status-rejected)"
                delay={1270}
              />
              <MiniCard title="Backend Dev" company="Quill" color="var(--color-fg)" delay={1360} />
              <MiniCard
                title="Sales Lead"
                company="Vega"
                color="var(--color-status-applied)"
                delay={1450}
              />
            </div>
            <div className="grid grid-cols-3 gap-[32px]">
              <div className="animate-hop relative z-10 w-full">
                <MiniCard title="Web Developer" company="Northwind" color="var(--color-accent)" />
                <MousePointer2 className="animate-press absolute -right-1 -bottom-3 size-6 fill-fg text-sunken drop-shadow-lg" />
              </div>
            </div>
          </div>
        </div>
        <WeekStrip />
      </div>

      <div data-depth className="depth-near absolute -bottom-14 -left-2 sm:-left-8">
        <div className="animate-toast-cycle flex max-w-64 items-center gap-3 rounded-2xl border border-line-strong bg-overlay p-3.5 shadow-2xl shadow-black/60">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-on-accent">
            <BellRing className="animate-ring size-5" />
          </span>
          <p className="text-[13px] leading-snug font-semibold">Time to follow up with Northwind</p>
        </div>
      </div>
      <div data-depth className="depth-near absolute -right-1 -bottom-14 sm:-right-5">
        <div className="animate-offer-cycle flex items-center gap-3 rounded-2xl border border-line-strong bg-overlay p-3.5 shadow-2xl shadow-black/60">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-status-offer text-on-accent">
            <PartyPopper className="size-5" />
          </span>
          <div>
            <p className="text-[13px] leading-snug font-semibold">You got an offer</p>
            <p className="text-xs text-muted">Northwind</p>
          </div>
        </div>
      </div>
      <div data-depth className="depth-far absolute -top-5 -right-1 sm:-right-5">
        <div className="animate-pop-in [animation-delay:1.6s]">
          <div className="animate-float rounded-2xl border border-line-strong bg-overlay px-4 py-3 shadow-2xl shadow-black/60">
            <p className="text-[11px] font-semibold text-muted">Replies</p>
            <p className="count-up font-display text-3xl font-extrabold text-status-offer" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Fixed values, so the page looks the same on the server and in the browser. */
const SPARKS = [
  { left: 11, size: 3, duration: 21, delay: 0 },
  { left: 28, size: 2, duration: 26, delay: -9 },
  { left: 46, size: 3, duration: 23, delay: -15 },
  { left: 63, size: 2, duration: 28, delay: -4 },
  { left: 79, size: 3, duration: 22, delay: -12 },
  { left: 93, size: 2, duration: 27, delay: -19 },
];

function HeroBackground() {
  return (
    <div aria-hidden className="hero-sky pointer-events-none absolute inset-0 overflow-hidden">
      <div className="hero-floor absolute inset-x-0 bottom-0 h-[22%]">
        <div className="hero-floor-grid absolute -inset-x-1/2 top-0 h-[420%]" />
      </div>
      <div className="hero-horizon absolute inset-x-0 bottom-[22%] h-px" />

      {SPARKS.map((spark) => (
        <span
          key={spark.left}
          className="hero-spark absolute bottom-[6%] rounded-full bg-accent"
          style={{
            left: `${spark.left}%`,
            width: spark.size,
            height: spark.size,
            animationDuration: `${spark.duration}s`,
            animationDelay: `${spark.delay}s`,
          }}
        />
      ))}

      <div data-depth className="depth-light absolute top-1/2 left-1/2">
        <div className="orb size-[34rem] -translate-x-1/2 -translate-y-1/2 text-fg/[0.07]" />
      </div>
      <div className="hero-grain absolute inset-0" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-canvas to-transparent" />
    </div>
  );
}

export function Hero() {
  const sceneRef = usePointerScene();

  return (
    <section ref={sceneRef} className="relative flex min-h-dvh flex-col overflow-hidden">
      <HeroBackground />

      <header className="animate-slide-down relative z-10 flex items-center justify-between px-5 py-5 sm:px-[4vw]">
        <Logo className="text-xl" />
        <nav className="flex items-center gap-2">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="hidden rounded-control px-3 py-2 text-sm font-semibold text-muted transition hover:text-fg lg:block"
            >
              {link.label}
            </a>
          ))}
          <Link href="/login" className={buttonClass('ghost')}>
            Sign in
          </Link>
          <Link href="/register" className={buttonClass('primary')}>
            Start free
          </Link>
        </nav>
      </header>

      <div className="relative z-10 grid flex-1 items-center gap-16 px-5 pt-6 pb-24 sm:px-[4vw] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="hero-copy-out">
          <h1 className="font-display text-[clamp(3.4rem,6.3vw,11rem)] leading-[1]  font-extrabold tracking-[-0.035em]">
            <Word delay={150}>Get</Word> <Word delay={230}>the</Word> <Word delay={310}>job.</Word>
            <br />
            <span className="text-accent">
              <Word delay={430}>Hire</Word> <Word delay={510}>the</Word>{' '}
              <span className="relative inline-block">
                <Word delay={590}>best.</Word>
                <svg
                  aria-hidden
                  viewBox="0 0 300 20"
                  preserveAspectRatio="none"
                  className="absolute inset-x-0 -bottom-[0.1em] h-[0.16em] w-full overflow-visible"
                >
                  <path
                    d="M4 14 C 70 4, 150 2, 296 10"
                    pathLength="1"
                    className="animate-draw fill-none stroke-fg"
                    strokeWidth="7"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              </span>
            </span>
          </h1>
          <p className="animate-fade-up mt-8 max-w-xl text-lg leading-relaxed text-muted [animation-delay:0.75s] sm:text-[22px] sm:leading-relaxed">
            HireFlow helps job seekers keep track of every job they apply for. It helps companies
            find the right people. All in one place.
          </p>
          <div className="animate-fade-up mt-9 flex flex-wrap items-center gap-3 [animation-delay:0.9s]">
            <Link href="/register" className={`${buttonClass('primary', 'xl')} shine group`}>
              Start free
              <ArrowRight
                aria-hidden
                className="size-5 transition-transform group-hover:translate-x-1.5"
                strokeWidth={2.5}
              />
            </Link>
            <a href="#how" className={buttonClass('secondary', 'xl')}>
              See how it works
            </a>
          </div>
          <ul className="animate-fade-up mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[15px] font-medium text-muted [animation-delay:1.05s]">
            {['Free to start', 'No card needed', 'Works on your phone'].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check aria-hidden className="size-4 text-status-offer" strokeWidth={3} />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="hero-stage-out">
          <HeroBoard />
        </div>
      </div>

      <a
        href="#how"
        aria-label="Scroll down"
        className="animate-fade-up absolute bottom-5 left-1/2 z-10 hidden -translate-x-1/2 text-muted [animation-delay:2s] hover:text-fg sm:block"
      >
        <ChevronDown aria-hidden className="animate-nudge size-7" />
      </a>
    </section>
  );
}
