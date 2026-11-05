import { BellRing, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from './logo';

export function AuthFrame({
  title,
  intro,
  children,
  footer,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative flex flex-col overflow-hidden px-6 py-7 sm:px-12">
        <div
          aria-hidden
          className="orb animate-drift pointer-events-none absolute -bottom-1/3 -left-1/4 size-[44rem] text-accent/20"
        />
        <Link href="/" className="relative self-start text-xl">
          <Logo />
        </Link>
        <div className="animate-rise relative m-auto w-full max-w-md py-12">
          <h1 className="font-display text-5xl leading-none font-extrabold tracking-tight sm:text-6xl">
            {title}
          </h1>
          {intro && <p className="mt-4 text-lg leading-relaxed text-muted">{intro}</p>}
          <div className="mt-9">{children}</div>
          {footer && <div className="mt-7 text-[15px] text-muted">{footer}</div>}
        </div>
      </div>

      <aside className="relative hidden flex-col justify-between overflow-hidden bg-accent p-[4vw] text-on-accent lg:flex">
        <div aria-hidden className="grid-lines absolute inset-0 opacity-60" />
        <p className="font-display relative text-[clamp(4rem,7.5vw,9rem)] leading-[0.92] font-extrabold tracking-[-0.03em]">
          Every job.
          <br />
          Every step.
          <br />
          One board.
        </p>
        <div aria-hidden className="relative mt-10 flex flex-wrap items-end gap-4 text-fg">
          <div className="animate-float flex items-center gap-3 rounded-2xl bg-on-accent p-4 shadow-2xl shadow-black/30">
            <CheckCircle2 className="size-8 text-status-offer" />
            <div>
              <p className="text-[15px] font-bold">You got an offer</p>
              <p className="text-[13px] text-muted">Northwind</p>
            </div>
          </div>
          <div className="animate-float flex items-center gap-3 rounded-2xl bg-on-accent p-4 shadow-2xl shadow-black/30 [animation-delay:-3s]">
            <BellRing className="size-8 text-accent" />
            <div>
              <p className="text-[15px] font-bold">Time to follow up</p>
              <p className="text-[13px] text-muted">Tessera, in 2 days</p>
            </div>
          </div>
        </div>
      </aside>
    </main>
  );
}

export const TextLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link
    href={href}
    className="font-semibold text-fg underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
  >
    {children}
  </Link>
);
