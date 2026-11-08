'use client';

import type { FunnelReport, SourcesReport, TimeToHireReport } from '@hireflow/shared';
import { useQuery } from '@tanstack/react-query';
import { livePoll, POLL } from './live';
import { api } from './api';

export interface AnalyticsFilters {
  from: string;
  to: string;
  jobId: string;
}

const query = (filters: AnalyticsFilters) => {
  const params = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.jobId) params.set('jobId', filters.jobId);
  return params.toString();
};

const useReport = <T>(cid: string, name: string, filters: AnalyticsFilters) =>
  useQuery({
    queryKey: ['ats', cid, 'analytics', name, filters],
    queryFn: () => api<T>(`/companies/${cid}/analytics/${name}?${query(filters)}`),
    placeholderData: (previous) => previous,
    refetchInterval: livePoll(POLL.numbers),
  });

export const useFunnel = (cid: string, filters: AnalyticsFilters) =>
  useReport<FunnelReport>(cid, 'funnel', filters);
export const useTimeToHire = (cid: string, filters: AnalyticsFilters) =>
  useReport<TimeToHireReport>(cid, 'time-to-hire', filters);
export const useSources = (cid: string, filters: AnalyticsFilters) =>
  useReport<SourcesReport>(cid, 'sources', filters);
