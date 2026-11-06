'use client';

import { clsx } from 'clsx';
import { BellRing } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { timeAgo } from '@/lib/format';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/lib/tracker';

export default function NotificationsPage() {
  const { data, isPending, isError, refetch } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  return (
    <div className="flex min-h-full flex-col p-4 sm:p-6">
      <header className="mb-6 flex items-center justify-between gap-3">
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          Notifications
        </h1>
        {Boolean(data?.unreadCount) && (
          <Button variant="secondary" size="sm" onClick={() => markAll.mutate()}>
            Mark all as read
          </Button>
        )}
      </header>

      {isPending ? (
        <Skeleton className="h-32" />
      ) : isError ? (
        <ErrorState message="We could not load your notifications." onRetry={() => refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState
          className="flex-1"
          title="Nothing here yet"
          icon={<BellRing aria-hidden className="size-9" />}
        >
          Your reminders will show here when it is time. We will also email them to you.
        </EmptyState>
      ) : (
        <ul className="grid gap-2.5">
          {data.items.map((notification) => {
            const applicationId = notification.payload.trackedApplicationId;
            const href =
              notification.payload.link ?? (applicationId ? `/app/tracker/${applicationId}` : null);
            const content = (
              <>
                <span
                  aria-hidden
                  className={clsx(
                    'mt-2 size-2.5 shrink-0 rounded-full',
                    notification.readAt ? 'bg-transparent' : 'bg-accent',
                  )}
                />
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium">
                    {notification.payload.message}
                  </span>
                  <span className="mt-1 block text-xs text-subtle">
                    {timeAgo(notification.createdAt)}
                    {!notification.readAt && <span className="sr-only"> (unread)</span>}
                  </span>
                </span>
              </>
            );
            const markAsRead = () => {
              if (!notification.readAt) markRead.mutate(notification);
            };
            return (
              <li key={notification.id} className="animate-card-in">
                {href ? (
                  <Link
                    href={href}
                    onClick={markAsRead}
                    className="card-lift flex gap-4 rounded-2xl border border-line bg-raised p-4 hover:border-accent"
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={markAsRead}
                    className="card-lift flex w-full gap-4 rounded-2xl border border-line bg-raised p-4 text-left hover:border-accent"
                  >
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
