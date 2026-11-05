'use client';

import type { MembershipRole } from '@hireflow/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, refreshSession, type SessionPayload, setAccessToken } from './api';

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  timezone: string;
  emailVerifiedAt: string | null;
  memberships: { companyId: string; name: string; slug: string; role: MembershipRole }[];
}

type Status = 'idle' | 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: Status;
  profile: Profile | null;
  restore: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
  reloadProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('idle');
  const [profile, setProfile] = useState<Profile | null>(null);
  const restoring = useRef<Promise<void> | null>(null);

  const reloadProfile = useCallback(async () => {
    setProfile(await api<Profile>('/me'));
    setStatus('authenticated');
  }, []);

  const restore = useCallback(() => {
    restoring.current ??= (async () => {
      setStatus('loading');
      try {
        const session = await refreshSession();
        if (session) await reloadProfile();
        else setStatus('anonymous');
      } catch {
        setStatus('anonymous');
      } finally {
        restoring.current = null;
      }
    })();
    return restoring.current;
  }, [reloadProfile]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const session = await api<SessionPayload>('/auth/login', {
        method: 'POST',
        body: { email, password },
        auth: false,
      });
      setAccessToken(session.accessToken);
      await reloadProfile();
    },
    [reloadProfile],
  );

  const clear = useCallback(() => {
    setAccessToken(null);
    setProfile(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    clear();
  }, [clear]);

  const signOutEverywhere = useCallback(async () => {
    await api('/auth/logout-all', { method: 'POST' });
    clear();
  }, [clear]);

  const value = useMemo(
    () => ({ status, profile, restore, signIn, signOut, signOutEverywhere, reloadProfile }),
    [status, profile, restore, signIn, signOut, signOutEverywhere, reloadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
