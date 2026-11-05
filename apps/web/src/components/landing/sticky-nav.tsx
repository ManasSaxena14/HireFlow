'use client';

import { clsx } from 'clsx';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/logo';
import { buttonClass } from '@/components/ui/button';
import { NAV_LINKS } from './nav-links';

/** A small floating menu that slides in after you scroll past the hero. */
export function StickyNav() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const update = () => setShow(window.scrollY > window.innerHeight * 0.85);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <div
      inert={!show}
      className={clsx(
        'fixed inset-x-0 top-4 z-40 flex justify-center px-4 transition duration-500',
        show ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-24 opacity-0',
      )}
    >
      <nav
        aria-label="Page"
        className="flex items-center gap-1 rounded-2xl border border-line-strong bg-raised/95 p-2 shadow-2xl shadow-black/50"
      >
        <a href="#top" className="mr-2 px-2 text-base">
          <Logo />
        </a>
        {NAV_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-muted transition hover:bg-overlay hover:text-fg md:block"
          >
            {link.label}
          </a>
        ))}
        <Link href="/register" className={`${buttonClass('primary', 'sm')} ml-2`}>
          Start free
        </Link>
      </nav>
    </div>
  );
}
