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
import { api, setTokenSource } from './api';
import { authClient, callAuth, forgetSessionToken, sessionToken } from './auth-client';

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  timezone: string;
  emailVerifiedAt: string | null;
  memberships: { companyId: string; name: string; slug: string; role: MembershipRole }[];
}

type Status = 'idle' | 'loading' | 'authenticated' | 'anonymous';

export interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
}

interface AuthContextValue {
  status: Status;
  profile: Profile | null;
  restore: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  /** Returns 'confirm' when Neon Auth wants the email confirmed before the first sign-in. */
  signUp: (input: SignUpInput) => Promise<'signed-in' | 'confirm'>;
  /** Checks the code from the email. Returns true if the person is now signed in. */
  confirmEmail: (email: string, code: string) => Promise<boolean>;
  sendCode: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
  reloadProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('idle');
  const [profile, setProfile] = useState<Profile | null>(null);
  const restoring = useRef<Promise<void> | null>(null);

  const reloadProfile = useCallback(async () => {
    setProfile(await api<Profile>('/me'));
    setStatus('authenticated');
  }, []);

  /** Called once Neon Auth has a session. The first request makes the HireFlow account. */
  const enter = useCallback(
    async (setTimezone: boolean) => {
      // A token kept from someone who was signed in before must never be sent for this person.
      forgetSessionToken();
      setTokenSource(sessionToken);
      if (setTimezone) {
        await api('/me', { method: 'PATCH', body: { timezone: browserTimezone() } }).catch(
          () => undefined,
        );
      }
      await reloadProfile();
    },
    [reloadProfile],
  );

  const restore = useCallback(() => {
    restoring.current ??= (async () => {
      setStatus('loading');
      try {
        if (await sessionToken()) await enter(false);
        else setStatus('anonymous');
      } catch {
        setTokenSource(null);
        setStatus('anonymous');
      } finally {
        restoring.current = null;
      }
    })();
    return restoring.current;
  }, [enter]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      await callAuth(() => authClient.signIn.email({ email, password }));
      await enter(false);
    },
    [enter],
  );

  const signUp = useCallback(
    async ({ email, password, fullName }: SignUpInput) => {
      const data = await callAuth(() =>
        authClient.signUp.email({ email, password, name: fullName }),
      );
      if (!data?.token) return 'confirm' as const;
      await enter(true);
      return 'signed-in' as const;
    },
    [enter],
  );

  const sendCode = useCallback(async (email: string) => {
    await callAuth(() =>
      authClient.emailOtp.sendVerificationOtp({ email, type: 'email-verification' }),
    );
  }, []);

  const confirmEmail = useCallback(
    async (email: string, code: string) => {
      await callAuth(() => authClient.emailOtp.verifyEmail({ email, otp: code }));
      // A new token carries the confirmed email, and the API updates the account from it.
      if (!(await sessionToken(true))) return false;
      await enter(profile === null);
      return true;
    },
    [enter, profile],
  );

  const clear = useCallback(() => {
    forgetSessionToken();
    setTokenSource(null);
    setProfile(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  const signOut = useCallback(async () => {
    await authClient.signOut().catch(() => undefined);
    clear();
  }, [clear]);

  const signOutEverywhere = useCallback(async () => {
    await callAuth(() => authClient.revokeSessions());
    await authClient.signOut().catch(() => undefined);
    clear();
  }, [clear]);

  const value = useMemo(
    () => ({
      status,
      profile,
      restore,
      signIn,
      signUp,
      confirmEmail,
      sendCode,
      signOut,
      signOutEverywhere,
      reloadProfile,
    }),
    [
      status,
      profile,
      restore,
      signIn,
      signUp,
      confirmEmail,
      sendCode,
      signOut,
      signOutEverywhere,
      reloadProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
