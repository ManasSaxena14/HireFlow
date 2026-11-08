'use client';

import type {
  ApplicationInterviews,
  Availability,
  CreateInterviewInput,
  CreateOfferInput,
  Interview,
  InterviewOffer,
  MyInterview,
  Page,
  PublicOffer,
  PutAvailabilityInput,
  Slot,
} from '@hireflow/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { livePoll, POLL } from './live';
import { api, apiText } from './api';
import { useCompanyMutation } from './ats';

const availabilityKey = (cid: string) => ['ats', cid, 'availability'] as const;
const PAGE_SIZE = 30;

export const useAvailability = (cid: string) =>
  useQuery({
    queryKey: availabilityKey(cid),
    queryFn: () => api<Availability>(`/me/availability?companyId=${cid}`),
  });

export const useSaveAvailability = (cid: string) =>
  useCompanyMutation(cid, (body: PutAvailabilityInput) =>
    api<Availability>(`/me/availability?companyId=${cid}`, { method: 'PUT', body }),
  );

export interface SlotSearch {
  applicationId: string;
  interviewerIds: string[];
  durationMin: number;
  from: string;
  to: string;
  ignoreInterviewId?: string;
}

export const useSuggestedSlots = (cid: string, search: SlotSearch, enabled: boolean) =>
  useQuery({
    queryKey: ['ats', cid, 'slots', search],
    queryFn: () =>
      api<{ slots: Slot[] }>(`/companies/${cid}/interviews/suggest-slots`, {
        method: 'POST',
        body: search,
      }),
    enabled,
    staleTime: 0,
  });

export const useCompanyInterviews = (cid: string, scope: 'upcoming' | 'past') =>
  useInfiniteQuery({
    queryKey: ['ats', cid, 'interviews', scope],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ scope, limit: String(PAGE_SIZE) });
      if (pageParam) params.set('cursor', pageParam);
      return api<Page<Interview>>(`/companies/${cid}/interviews?${params}`);
    },
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: livePoll(POLL.list),
  });

export const useApplicationInterviews = (cid: string, applicationId: string) =>
  useQuery({
    queryKey: ['ats', cid, 'candidate-interviews', applicationId],
    queryFn: () =>
      api<ApplicationInterviews>(`/companies/${cid}/applications/${applicationId}/interviews`),
    refetchInterval: livePoll(POLL.board),
  });

export const useMyInterviews = () =>
  useQuery({
    queryKey: ['my-interviews'],
    queryFn: () => api<MyInterview[]>('/me/interviews'),
    staleTime: 0,
    refetchInterval: livePoll(POLL.list),
  });

export const useBookInterview = (cid: string) =>
  useCompanyMutation(cid, (body: CreateInterviewInput) =>
    api<Interview>(`/companies/${cid}/interviews`, { method: 'POST', body }),
  );

export const useRescheduleInterview = (cid: string) =>
  useCompanyMutation(cid, ({ id, start }: { id: string; start: string }) =>
    api<Interview>(`/companies/${cid}/interviews/${id}/reschedule`, {
      method: 'POST',
      body: { start },
    }),
  );

export const useCancelInterview = (cid: string) =>
  useCompanyMutation(cid, (id: string) =>
    api<Interview>(`/companies/${cid}/interviews/${id}/cancel`, { method: 'POST' }),
  );

export const useCreateOffer = (cid: string) =>
  useCompanyMutation(cid, (body: CreateOfferInput) =>
    api<InterviewOffer>(`/companies/${cid}/interview-offers`, { method: 'POST', body }),
  );

export const useWithdrawOffer = (cid: string) =>
  useCompanyMutation(cid, (id: string) =>
    api<void>(`/companies/${cid}/interview-offers/${id}/withdraw`, { method: 'POST' }),
  );

const offerPath = (token: string) => `/interview-offers/${encodeURIComponent(token)}`;

export const usePublicOffer = (token: string) =>
  useQuery({
    queryKey: ['offer', token],
    queryFn: () => api<PublicOffer>(offerPath(token), { auth: false }),
    retry: false,
  });

export function useBookOffer(token: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (start: string) =>
      api<PublicOffer>(`${offerPath(token)}/book`, {
        method: 'POST',
        auth: false,
        body: { start, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      }),
    onSuccess: (offer) => client.setQueryData(['offer', token], offer),
    // Someone else may have just taken this time, so show what is left.
    onError: () => client.invalidateQueries({ queryKey: ['offer', token] }),
  });
}

export async function downloadCalendarFile(id: string) {
  const text = await apiText(`/interviews/${id}/ics`);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
  link.download = 'interview.ics';
  link.click();
  URL.revokeObjectURL(link.href);
}
