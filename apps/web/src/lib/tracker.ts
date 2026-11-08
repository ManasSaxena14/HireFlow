'use client';

import type {
  AppNotification,
  ApplicationDetail,
  ApplicationEvent,
  ApplicationNote,
  CreateApplicationInput,
  NotificationPage,
  Page,
  TrackedApplication,
  TrackerStats,
  TrackerStatus,
} from '@hireflow/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { livePoll, POLL } from './live';
import { api, ApiError } from './api';

export const STATUS_LABELS: Record<TrackerStatus, string> = {
  saved: 'Saved',
  applied: 'Applied',
  screening: 'First round',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Dropped',
};

export const STATUS_COLORS: Record<TrackerStatus, string> = {
  saved: 'var(--color-status-saved)',
  applied: 'var(--color-status-applied)',
  screening: 'var(--color-status-screening)',
  interview: 'var(--color-status-interview)',
  offer: 'var(--color-status-offer)',
  rejected: 'var(--color-status-rejected)',
  withdrawn: 'var(--color-status-withdrawn)',
};

export interface BoardFilters {
  q: string;
  tag: string;
  archived: boolean;
}

const keys = {
  all: ['tracker'] as const,
  board: (filters: BoardFilters) => ['tracker', 'board', filters] as const,
  detail: (id: string) => ['tracker', 'detail', id] as const,
  events: (id: string) => ['tracker', 'events', id] as const,
  notes: (id: string) => ['tracker', 'notes', id] as const,
  stats: ['tracker', 'stats'] as const,
};

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

async function fetchBoard(filters: BoardFilters): Promise<TrackedApplication[]> {
  const items: TrackedApplication[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (filters.q) params.set('q', filters.q);
    if (filters.tag) params.set('tag', filters.tag);
    if (filters.archived) params.set('archived', 'true');
    if (cursor) params.set('cursor', cursor);
    const result: Page<TrackedApplication> = await api(`/tracker/applications?${params}`);
    items.push(...result.items);
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  return items;
}

export const useBoard = (filters: BoardFilters) =>
  useQuery({
    queryKey: keys.board(filters),
    queryFn: () => fetchBoard(filters),
    placeholderData: (previous) => previous,
    refetchInterval: livePoll(POLL.board),
  });

export const useStats = () =>
  useQuery({
    queryKey: keys.stats,
    queryFn: () => api<TrackerStats>('/tracker/stats'),
    refetchInterval: livePoll(POLL.list),
  });

export const useApplication = (id: string) =>
  useQuery({
    queryKey: keys.detail(id),
    queryFn: () => api<ApplicationDetail>(`/tracker/applications/${id}`),
    refetchInterval: livePoll(POLL.board),
  });

export const useEvents = (id: string) =>
  useQuery({
    queryKey: keys.events(id),
    queryFn: () => api<ApplicationEvent[]>(`/tracker/applications/${id}/events`),
    refetchInterval: livePoll(POLL.board),
  });

export const useNotes = (id: string) =>
  useQuery({
    queryKey: keys.notes(id),
    queryFn: () => api<ApplicationNote[]>(`/tracker/applications/${id}/notes`),
  });

export function useCreateApplication() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateApplicationInput) =>
      api<TrackedApplication>('/tracker/applications', { method: 'POST', body }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useUpdateApplication(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<TrackedApplication>(`/tracker/applications/${id}`, { method: 'PATCH', body }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useArchiveApplication() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/tracker/applications/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
  });
}

/** Moves the card on screen right away, and puts it back if the server says no. */
export function useMoveApplication() {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, toStatus, note }: { id: string; toStatus: TrackerStatus; note?: string }) =>
      api<TrackedApplication>(`/tracker/applications/${id}/move`, {
        method: 'POST',
        body: { toStatus, note },
      }),
    onMutate: async ({ id, toStatus }) => {
      await client.cancelQueries({ queryKey: ['tracker', 'board'] });
      const boards = client.getQueriesData<TrackedApplication[]>({
        queryKey: ['tracker', 'board'],
      });
      for (const [key, items] of boards) {
        client.setQueryData(
          key,
          items?.map((item) => (item.id === id ? { ...item, status: toStatus } : item)),
        );
      }
      return { boards };
    },
    onError: (error, _variables, context) => {
      for (const [key, items] of context?.boards ?? []) client.setQueryData(key, items);
      toast(error instanceof ApiError ? error.message : 'Could not move this card.', 'error');
    },
    onSettled: () => client.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useAddNote(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api<ApplicationNote>(`/tracker/applications/${id}/notes`, {
        method: 'POST',
        body: { body },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.notes(id) }),
  });
}

export function useAddReminder(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { remindAt: string; message: string }) =>
      api(`/tracker/applications/${id}/reminders`, { method: 'POST', body }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.detail(id) }),
  });
}

export const useNotifications = () =>
  useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<NotificationPage>('/notifications?limit=50'),
    refetchInterval: livePoll(POLL.board),
  });

export function useMarkNotificationRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (notification: AppNotification) =>
      api(`/notifications/${notification.id}/read`, { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
