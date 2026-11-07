'use client';

import type { MatchResumeInput, Resume, ResumeLink, ResumeMatch } from '@hireflow/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

const LIST_KEY = ['resumes', 'list'] as const;
const POLL_MS = 2000;

const stillReading = (resumes: Resume[] | undefined) =>
  resumes?.some((resume) => resume.status === 'pending') ? POLL_MS : false;

export const useResumes = () =>
  useQuery({
    queryKey: LIST_KEY,
    queryFn: () => api<Resume[]>('/resumes'),
    refetchInterval: (query) => stillReading(query.state.data),
  });

export const useResume = (id: string) =>
  useQuery({
    queryKey: ['resumes', 'one', id],
    queryFn: () => api<Resume>(`/resumes/${id}`),
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? POLL_MS : false),
  });

export const useResumeMatches = (id: string) =>
  useQuery({
    queryKey: ['resumes', 'matches', id],
    queryFn: () => api<ResumeMatch[]>(`/resumes/${id}/matches`),
  });

export function useUploadResume() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('resume', file);
      return api<Resume>('/resumes', { method: 'POST', body });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useDeleteResume() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/resumes/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useMatchResume(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: MatchResumeInput) =>
      api<ResumeMatch>(`/resumes/${id}/match`, { method: 'POST', body }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['resumes', 'matches', id] }),
        client.invalidateQueries({ queryKey: LIST_KEY }),
      ]),
  });
}

export const fetchResumeFileLink = (id: string) => api<ResumeLink>(`/resumes/${id}/file`);
