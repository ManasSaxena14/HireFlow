'use client';

import { clsx } from 'clsx';
import { Bell, KanbanSquare, LogOut, Menu, Settings, type LucideIcon, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNotifications } from '@/lib/tracker';
import { Logo } from './logo';

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/app/tracker', label: 'Applications', icon: KanbanSquare },
  { href: '/app/notifications', label: 'Notifications', icon: Bell },
  { href: '/app/settings', label: 'Settings', icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: notifications } = useNotifications();
  const unread = notifications?.unreadCount ?? 0;
  return (
    <ul className="space-y-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={clsx(
                'flex h-9 items-center gap-2.5 rounded-control px-2.5 text-sm transition-colors',
                active
                  ? 'bg-overlay font-medium text-fg'
                  : 'text-muted hover:bg-raised hover:text-fg',
              )}
            >
              <Icon aria-hidden className={clsx('size-4', active && 'text-accent')} />
              {label}
              {href === '/app/notifications' && unread > 0 && (
                <span className="ml-auto rounded-full bg-accent px-1.5 font-mono text-[11px] font-medium text-on-accent">
                  {unread}
                  <span className="sr-only"> unread</span>
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function UserBlock() {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  return (
    <div className="flex items-center gap-2 border-t border-line pt-3">
      <div className="min-w-0 flex-1 px-1">
        <p className="truncate text-[13px] font-medium">{profile?.fullName}</p>
        <p className="truncate text-xs text-muted">{profile?.email}</p>
      </div>
      <button
        type="button"
        aria-label="Sign out"
        title="Sign out"
        onClick={() => signOut().then(() => router.replace('/login'))}
        className="grid size-8 shrink-0 place-items-center rounded-control text-muted hover:bg-raised hover:text-fg"
      >
        <LogOut aria-hidden className="size-4" />
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [menuOpen]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-sunken p-3 lg:flex">
        <Link href="/app" className="mb-5 px-2 pt-1.5 text-base">
          <Logo />
        </Link>
        <nav aria-label="Main" className="flex-1">
          <NavLinks />
        </nav>
        <UserBlock />
      </aside>

      <header className="sticky top-0 z-30 flex h-13 items-center justify-between border-b border-line bg-sunken px-4 lg:hidden">
        <Link href="/app" className="text-base">
          <Logo />
        </Link>
        <button
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="grid size-9 place-items-center rounded-control text-muted hover:text-fg"
        >
          {menuOpen ? (
            <X aria-hidden className="size-5" />
          ) : (
            <Menu aria-hidden className="size-5" />
          )}
        </button>
      </header>

      {menuOpen && (
        <div className="fixed inset-x-0 top-13 bottom-0 z-30 flex flex-col bg-sunken p-3 lg:hidden">
          <nav aria-label="Main" className="flex-1">
            <NavLinks onNavigate={() => setMenuOpen(false)} />
          </nav>
          <UserBlock />
        </div>
      )}

      <main className="min-w-0">{children}</main>
    </div>
  );
}
