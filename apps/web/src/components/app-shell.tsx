'use client';

import { clsx } from 'clsx';
import {
  Bell,
  BellPlus,
  CalendarDays,
  Building2,
  Dumbbell,
  FileText,
  KanbanSquare,
  LogOut,
  type LucideIcon,
  Menu,
  Search,
  Settings,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNotifications } from '@/lib/tracker';
import { Logo } from './logo';

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/app/tracker', label: 'Job board', icon: KanbanSquare },
  { href: '/app/feed', label: 'Find jobs', icon: Search },
  { href: '/app/alerts', label: 'Job alerts', icon: BellPlus },
  { href: '/app/resumes', label: 'Resumes', icon: FileText },
  { href: '/app/prep', label: 'Practice', icon: Dumbbell },
  { href: '/app/interviews', label: 'Interviews', icon: CalendarDays },
  { href: '/company', label: 'Hiring', icon: Building2 },
  { href: '/app/notifications', label: 'Notifications', icon: Bell },
  { href: '/app/settings', label: 'Settings', icon: Settings },
];

const NAV_ITEM_STEP = 54;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: notifications } = useNotifications();
  const unread = notifications?.unreadCount ?? 0;
  const activeIndex = NAV.findIndex(({ href }) => pathname.startsWith(href));
  return (
    <ul className="relative space-y-1.5">
      {activeIndex >= 0 && (
        <li
          aria-hidden
          className="glow-button absolute inset-x-0 top-0 h-12 rounded-xl bg-accent duration-500"
          style={{ transform: `translateY(${activeIndex * NAV_ITEM_STEP}px)` }}
        />
      )}
      {NAV.map(({ href, label, icon: Icon }, index) => {
        const active = index === activeIndex;
        return (
          <li key={href} className="relative">
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={clsx(
                'flex h-12 items-center gap-3 rounded-xl px-3.5 text-[15px] font-semibold transition',
                active ? 'text-on-accent' : 'text-muted hover:bg-raised hover:text-fg',
              )}
            >
              <Icon
                aria-hidden
                className={clsx(
                  'size-5',
                  href === '/app/notifications' && unread > 0 && 'animate-ring',
                )}
              />
              {label}
              {href === '/app/notifications' && unread > 0 && (
                <span
                  key={unread}
                  className={clsx(
                    'animate-pop ml-auto rounded-full px-2 py-0.5 text-xs font-bold',
                    active ? 'bg-on-accent text-fg' : 'bg-accent text-on-accent',
                  )}
                >
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
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-raised p-2.5">
      <span
        aria-hidden
        className="font-display grid size-10 shrink-0 place-items-center rounded-xl bg-overlay text-lg font-extrabold text-accent"
      >
        {profile?.fullName.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{profile?.fullName}</p>
        <p className="truncate text-xs text-muted">{profile?.email}</p>
      </div>
      <button
        type="button"
        aria-label="Sign out"
        title="Sign out"
        onClick={() => signOut().then(() => router.replace('/login'))}
        className="grid size-9 shrink-0 place-items-center rounded-control text-muted hover:bg-overlay hover:text-fg"
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
    <div className="min-h-dvh lg:grid lg:h-dvh lg:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="hidden h-dvh flex-col border-r border-line bg-sunken p-4 lg:flex">
        <Link href="/app" className="mb-8 px-2 pt-2 text-2xl">
          <Logo />
        </Link>
        <nav aria-label="Main" className="flex-1">
          <NavLinks />
        </nav>
        <UserBlock />
      </aside>

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-sunken px-4 lg:hidden">
        <Link href="/app" className="text-lg">
          <Logo />
        </Link>
        <button
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="grid size-10 place-items-center rounded-control text-muted hover:text-fg"
        >
          {menuOpen ? (
            <X aria-hidden className="size-6" />
          ) : (
            <Menu aria-hidden className="size-6" />
          )}
        </button>
      </header>

      {menuOpen && (
        <div className="fixed inset-x-0 top-16 bottom-0 z-30 flex flex-col bg-sunken p-4 lg:hidden">
          <nav aria-label="Main" className="flex-1">
            <NavLinks onNavigate={() => setMenuOpen(false)} />
          </nav>
          <UserBlock />
        </div>
      )}

      <main className="relative min-w-0 overflow-x-hidden lg:h-dvh lg:overflow-y-auto">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="orb animate-drift absolute -top-64 -right-32 size-[44rem] text-accent/15" />
        </div>
        <div className="relative lg:h-full">{children}</div>
      </main>
    </div>
  );
}
