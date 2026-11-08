'use client';

import type {
  CreatePracticeSessionInput,
  Page,
  PracticeKind,
  PracticeSession,
  PrepStats,
  ReviewItem,
} from '@hireflow/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export const KIND_LABELS: Record<PracticeKind, string> = {
  dsa: 'Coding problems',
  system_design: 'System design',
  behavioral: 'Behaviour questions',
  mock: 'Mock interview',
  other: 'Other',
};

/** SM-2 grades 0 to 5, in plain words. */
export const GRADES = [
  { quality: 0, label: 'No idea' },
  { quality: 1, label: 'Wrong' },
  { quality: 2, label: 'Almost' },
  { quality: 3, label: 'Hard' },
  { quality: 4, label: 'Good' },
  { quality: 5, label: 'Easy' },
] as const;

const ALL = ['prep'] as const;

export const usePrepStats = () =>
  useQuery({ queryKey: ['prep', 'stats'], queryFn: () => api<PrepStats>('/prep/stats') });

export const useReviews = () =>
  useQuery({ queryKey: ['prep', 'reviews'], queryFn: () => api<ReviewItem[]>('/prep/reviews') });

export const useSessions = () =>
  useInfiniteQuery({
    queryKey: ['prep', 'sessions'],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '20' });
      if (pageParam) params.set('cursor', pageParam);
      return api<Page<PracticeSession>>(`/prep/sessions?${params}`);
    },
    getNextPageParam: (last) => last.nextCursor,
  });

function usePrepMutation<Input, Output>(fn: (input: Input) => Promise<Output>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => client.invalidateQueries({ queryKey: ALL }),
  });
}

export const useLogSession = () =>
  usePrepMutation((body: CreatePracticeSessionInput) =>
    api<PracticeSession & { reviewAdded: boolean }>('/prep/sessions', { method: 'POST', body }),
  );

export const useDeleteSession = () =>
  usePrepMutation((id: string) => api(`/prep/sessions/${id}`, { method: 'DELETE' }));

export const useGradeReview = () =>
  usePrepMutation(({ id, quality }: { id: string; quality: number }) =>
    api<ReviewItem>(`/prep/reviews/${id}/grade`, { method: 'POST', body: { quality } }),
  );

export const useDeleteReview = () =>
  usePrepMutation((id: string) => api(`/prep/reviews/${id}`, { method: 'DELETE' }));
