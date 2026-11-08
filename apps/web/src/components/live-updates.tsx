'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { AppNotification } from '@hireflow/shared';
import { useNotifications } from '@/lib/tracker';
import { useToast } from './ui/toast';

/**
 * Notices a new notification and refreshes everything it could have changed, so a move by a
 * company shows on the job board within moments, without anyone pressing reload. The people
 * who run hiring and the people applying use the same check.
 */
export function LiveUpdates() {
  const { data } = useNotifications();
  const client = useQueryClient();
  const toast = useToast();
  // undefined means the first load, which is not news.
  const seen = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!data) return;
    const newest = data.items[0]?.id ?? null;
    if (seen.current === undefined) {
      seen.current = newest;
      return;
    }
    if (newest === seen.current) return;

    const fresh: AppNotification[] = [];
    for (const item of data.items) {
      if (item.id === seen.current) break;
      fresh.push(item);
    }
    seen.current = newest;

    // A person who books an interview does not need a pop-up about it. These are for news.
    const isNews = (item: AppNotification) =>
      Boolean(item.payload.message) &&
      !item.readAt &&
      (item.type !== 'interview' || Boolean(item.payload.link?.startsWith('/app/')));
    for (const item of fresh.filter(isNews).slice(0, 3).reverse()) {
      toast(item.payload.message as string);
    }

    void client.invalidateQueries({ queryKey: ['tracker'] });
    void client.invalidateQueries({ queryKey: ['my-interviews'] });
    void client.invalidateQueries({ queryKey: ['ats'] });
  }, [data, client, toast]);

  return null;
}
