'use client';

import type {
  AtsApplication,
  AtsApplicationDetail,
  CompanyMember,
  CreateJobInput,
  Job,
  JobDetail,
  MembershipRole,
  Page,
  PipelineStage,
  Recommendation,
  ResumeLink,
  StageKind,
} from '@hireflow/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { livePoll, POLL } from './live';
import { api, ApiError } from './api';

export const ROLE_LABELS: Record<MembershipRole, string> = {
  admin: 'Admin',
  recruiter: 'Recruiter',
  hiring_manager: 'Hiring manager',
  interviewer: 'Interviewer',
};

export const KIND_LABELS: Record<StageKind, string> = {
  applied: 'New people',
  screening: 'First call',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Not selected',
};

export const KIND_COLORS: Record<StageKind, string> = {
  applied: 'var(--color-status-applied)',
  screening: 'var(--color-status-screening)',
  interview: 'var(--color-status-interview)',
  offer: 'var(--color-status-offer)',
  hired: 'var(--color-success)',
  rejected: 'var(--color-status-rejected)',
};

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  strong_no: 'Strong no',
  no: 'No',
  yes: 'Yes',
  strong_yes: 'Strong yes',
};

export const canRunHiring = (role: MembershipRole) => role !== 'interviewer';

const keys = {
  company: (cid: string) => ['ats', cid] as const,
  jobs: (cid: string) => ['ats', cid, 'jobs'] as const,
  job: (cid: string, id: string) => ['ats', cid, 'job', id] as const,
  board: (cid: string, jobId: string) => ['ats', cid, 'board', jobId] as const,
  candidate: (cid: string, id: string) => ['ats', cid, 'candidate', id] as const,
  members: (cid: string) => ['ats', cid, 'members'] as const,
};

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

export const useJobs = (cid: string) =>
  useQuery({
    queryKey: keys.jobs(cid),
    queryFn: () => api<Page<Job>>(`/companies/${cid}/jobs?limit=${PAGE_SIZE}`),
    refetchInterval: livePoll(POLL.list),
  });

export const useJob = (cid: string, id: string) =>
  useQuery({
    queryKey: keys.job(cid, id),
    queryFn: () => api<JobDetail>(`/companies/${cid}/jobs/${id}`),
    refetchInterval: livePoll(POLL.list),
  });

async function fetchBoard(cid: string, jobId: string, q: string): Promise<AtsApplication[]> {
  const items: AtsApplication[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ jobId, limit: String(PAGE_SIZE) });
    if (q) params.set('q', q);
    if (cursor) params.set('cursor', cursor);
    const result: Page<AtsApplication> = await api(`/companies/${cid}/applications?${params}`);
    items.push(...result.items);
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  return items;
}

export const usePipeline = (cid: string, jobId: string, q: string) =>
  useQuery({
    queryKey: [...keys.board(cid, jobId), q],
    queryFn: () => fetchBoard(cid, jobId, q),
    placeholderData: (previous) => previous,
    refetchInterval: livePoll(POLL.fast),
  });

export const useCandidate = (cid: string, id: string) =>
  useQuery({
    queryKey: keys.candidate(cid, id),
    queryFn: () => api<AtsApplicationDetail>(`/companies/${cid}/applications/${id}`),
    refetchInterval: livePoll(POLL.fast),
  });

export const useMembers = (cid: string, enabled = true) =>
  useQuery({
    queryKey: keys.members(cid),
    queryFn: () => api<CompanyMember[]>(`/companies/${cid}/members`),
    enabled,
  });

export function useCompanyMutation<Input, Output = unknown>(
  cid: string,
  mutationFn: (input: Input) => Promise<Output>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.company(cid) }),
  });
}

export const useCreateJob = (cid: string) =>
  useCompanyMutation(cid, (body: CreateJobInput) =>
    api<JobDetail>(`/companies/${cid}/jobs`, { method: 'POST', body }),
  );

export const useUpdateJob = (cid: string, id: string) =>
  useCompanyMutation(cid, (body: CreateJobInput) =>
    api<JobDetail>(`/companies/${cid}/jobs/${id}`, { method: 'PATCH', body }),
  );

export const useJobStatus = (cid: string, id: string) =>
  useCompanyMutation(cid, (action: 'publish' | 'close') =>
    api<JobDetail>(`/companies/${cid}/jobs/${id}/${action}`, { method: 'POST' }),
  );

export interface StageDraft {
  id?: string;
  name: string;
  kind: StageKind;
  emailSubject: string | null;
  emailBody: string | null;
}

export const useSaveStages = (cid: string, id: string) =>
  useCompanyMutation(cid, (stages: StageDraft[]) =>
    api<PipelineStage[]>(`/companies/${cid}/jobs/${id}/stages`, {
      method: 'PUT',
      body: { stages },
    }),
  );

/** Moves the card on screen right away, and puts it back if the server says no. */
export function useMoveCandidate(cid: string) {
  const client = useQueryClient();
  const toast = useToast();
  const boards = ['ats', cid, 'board'];
  return useMutation({
    mutationFn: ({ id, toStageId, reason }: { id: string; toStageId: string; reason?: string }) =>
      api<AtsApplicationDetail>(`/companies/${cid}/applications/${id}/move`, {
        method: 'POST',
        body: { toStageId, reason },
      }),
    onMutate: async ({ id, toStageId }) => {
      await client.cancelQueries({ queryKey: boards });
      const previous = client.getQueriesData<AtsApplication[]>({ queryKey: boards });
      for (const [key, items] of previous) {
        client.setQueryData(
          key,
          items?.map((item) => (item.id === id ? { ...item, stageId: toStageId } : item)),
        );
      }
      return { previous };
    },
    onError: (error, _variables, context) => {
      for (const [key, items] of context?.previous ?? []) client.setQueryData(key, items);
      toast(error instanceof ApiError ? error.message : 'Could not move this person.', 'error');
    },
    onSettled: () => client.invalidateQueries({ queryKey: keys.company(cid) }),
  });
}

export const useAddComment = (cid: string, id: string) =>
  useCompanyMutation(cid, (body: string) =>
    api(`/companies/${cid}/applications/${id}/comments`, { method: 'POST', body: { body } }),
  );

export const useAddScorecard = (cid: string, id: string) =>
  useCompanyMutation(
    cid,
    (body: { rating: number; recommendation: Recommendation; comments: string }) =>
      api(`/companies/${cid}/applications/${id}/scorecards`, { method: 'POST', body }),
  );

export const useAssign = (cid: string, id: string) =>
  useCompanyMutation(cid, (userId: string) =>
    api(`/companies/${cid}/applications/${id}/assignees`, { method: 'POST', body: { userId } }),
  );

export const useUnassign = (cid: string, id: string) =>
  useCompanyMutation(cid, (userId: string) =>
    api(`/companies/${cid}/applications/${id}/assignees/${userId}`, { method: 'DELETE' }),
  );

export const useDeleteCandidate = (cid: string) =>
  useCompanyMutation(cid, (candidateId: string) =>
    api(`/companies/${cid}/candidates/${candidateId}`, { method: 'DELETE' }),
  );

export const fetchResumeLink = (cid: string, id: string) =>
  api<ResumeLink>(`/companies/${cid}/applications/${id}/resume`);

export const useAddMember = (cid: string) =>
  useCompanyMutation(cid, (body: { email: string; role: MembershipRole }) =>
    api(`/companies/${cid}/members`, { method: 'POST', body }),
  );

export const useChangeRole = (cid: string) =>
  useCompanyMutation(cid, ({ userId, role }: { userId: string; role: MembershipRole }) =>
    api(`/companies/${cid}/members/${userId}`, { method: 'PATCH', body: { role } }),
  );

export const useRemoveMember = (cid: string) =>
  useCompanyMutation(cid, (userId: string) =>
    api(`/companies/${cid}/members/${userId}`, { method: 'DELETE' }),
  );
