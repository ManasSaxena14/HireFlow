'use client';

import type { AuditLogEntry, Page } from '@hireflow/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from './api';

export const useAuditLog = (cid: string, entityType: string) =>
  useInfiniteQuery({
    queryKey: ['ats', cid, 'audit', entityType],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (entityType) params.set('entityType', entityType);
      if (pageParam) params.set('cursor', pageParam);
      return api<Page<AuditLogEntry>>(`/companies/${cid}/audit-logs?${params}`);
    },
    getNextPageParam: (last) => last.nextCursor,
  });
