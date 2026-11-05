'use client';

import { clsx } from 'clsx';
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
    <div className="mx-auto max-w-2xl px-5 py-8">
      <header className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        {Boolean(data?.unreadCount) && (
          <Button variant="secondary" size="sm" onClick={() => markAll.mutate()}>
            Mark all as read
          </Button>
        )}
      </header>

      {isPending ? (
        <Skeleton className="h-32" />
      ) : isError ? (
        <ErrorState message="Notifications could not be loaded." onRetry={() => refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState title="Nothing here yet">
          Reminders appear here when they are due, and we email them to you as well.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-panel border border-line">
          {data.items.map((notification) => {
            const applicationId = notification.payload.trackedApplicationId;
            const content = (
              <>
                <span
                  aria-hidden
                  className={clsx(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    notification.readAt ? 'bg-transparent' : 'bg-accent',
                  )}
                />
                <span className="min-w-0">
                  <span className="block text-sm">{notification.payload.message}</span>
                  <span className="mt-0.5 block font-mono text-[11px] text-subtle">
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
              <li key={notification.id}>
                {applicationId ? (
                  <Link
                    href={`/app/tracker/${applicationId}`}
                    onClick={markAsRead}
                    className="flex gap-3 px-4 py-3 hover:bg-raised"
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={markAsRead}
                    className="flex w-full gap-3 px-4 py-3 text-left hover:bg-raised"
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
