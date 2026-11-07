'use client';

import type {
  CreateAlertInput,
  FeedJob,
  FeedJobDetail,
  JobAlert,
  Page,
  TrackedApplication,
} from '@hireflow/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface FeedFilters {
  q: string;
  location: string;
  remote: boolean;
}

const PAGE_SIZE = 20;

export const useFeedJobs = (filters: FeedFilters) =>
  useInfiniteQuery({
    queryKey: ['feed', 'jobs', filters],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (filters.q) params.set('q', filters.q);
      if (filters.location) params.set('location', filters.location);
      if (filters.remote) params.set('remote', 'true');
      if (pageParam) params.set('cursor', pageParam);
      return api<Page<FeedJob>>(`/feed/jobs?${params}`);
    },
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: (previous) => previous,
  });

export const useFeedJob = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: ['feed', 'job', id],
    queryFn: () => api<FeedJobDetail>(`/feed/jobs/${id}`),
    enabled,
  });

export function useSaveFeedJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<TrackedApplication>(`/feed/jobs/${id}/save`, { method: 'POST' }),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['feed', 'jobs'] }),
        client.invalidateQueries({ queryKey: ['tracker'] }),
      ]),
  });
}

const ALERTS_KEY = ['feed', 'alerts'] as const;

export const useAlerts = () =>
  useQuery({ queryKey: ALERTS_KEY, queryFn: () => api<JobAlert[]>('/alerts') });

export function useCreateAlert() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAlertInput) => api<JobAlert>('/alerts', { method: 'POST', body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ALERTS_KEY }),
  });
}

export function useUpdateAlert() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<CreateAlertInput> & { id: string; active?: boolean }) =>
      api<JobAlert>(`/alerts/${id}`, { method: 'PATCH', body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ALERTS_KEY }),
  });
}

export function useDeleteAlert() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/alerts/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ALERTS_KEY }),
  });
}
