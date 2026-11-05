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
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/" className="self-start text-lg">
          <Logo />
        </Link>
        <div className="my-auto w-full max-w-sm py-12 lg:ml-[max(0px,calc(50%-12rem))]">
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight">{title}</h1>
          {intro && <p className="mt-2 text-[15px] leading-relaxed text-muted">{intro}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-sm text-muted">{footer}</div>}
        </div>
      </div>

      <aside className="hidden flex-col justify-end border-l border-line bg-sunken p-14 lg:flex">
        <p className="font-mono text-xs tracking-widest text-muted uppercase">
          Two-sided hiring platform
        </p>
        <p className="mt-5 max-w-lg text-[40px] leading-[1.12] font-semibold tracking-tight">
          Every application accounted for, <span className="text-accent">from either side</span> of
          the table.
        </p>
      </aside>
    </main>
  );
}

export const TextLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link
    href={href}
    className="font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-accent"
  >
    {children}
  </Link>
);
