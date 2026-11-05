'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateCompanyInput,
  createCompanySchema,
  updateProfileSchema,
} from '@hireflow/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormError, SelectField, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { applyServerErrors } from '@/lib/forms';

const ROLE_LABELS = {
  admin: 'Admin',
  recruiter: 'Recruiter',
  hiring_manager: 'Hiring manager',
  interviewer: 'Interviewer',
} as const;

const profileSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter your name').max(120),
  timezone: z.string(),
});
type ProfileValues = z.infer<typeof profileSchema>;

function Section({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-x-12 gap-y-5 border-t border-line py-8 md:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">{intro}</p>
      </div>
      <div className="max-w-md">{children}</div>
    </section>
  );
}

function ProfileForm() {
  const { profile, reloadProfile } = useAuth();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: profile?.fullName, timezone: profile?.timezone },
  });
  const zones = Intl.supportedValuesOf('timeZone');

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api('/me', { method: 'PATCH', body: updateProfileSchema.parse(values) });
      await reloadProfile();
      toast('Profile saved');
    } catch (error) {
      setFormError(applyServerErrors(error, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormError>{formError}</FormError>
      <TextField label="Full name" error={errors.fullName?.message} {...register('fullName')} />
      <TextField label="Email" value={profile?.email ?? ''} disabled readOnly />
      <SelectField
        label="Time zone"
        hint="Used for reminder times."
        error={errors.timezone?.message}
        {...register('timezone')}
      >
        {!zones.includes(profile?.timezone ?? '') && (
          <option value={profile?.timezone}>{profile?.timezone}</option>
        )}
        {zones.map((zone) => (
          <option key={zone} value={zone}>
            {zone.replaceAll('_', ' ')}
          </option>
        ))}
      </SelectField>
      <Button type="submit" loading={isSubmitting}>
        Save changes
      </Button>
    </form>
  );
}

function Companies() {
  const { profile, reloadProfile } = useAuth();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateCompanyInput>({ resolver: zodResolver(createCompanySchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api('/companies', { method: 'POST', body: values });
      await reloadProfile();
      reset();
      toast('Company created');
    } catch (error) {
      setFormError(applyServerErrors(error, setError));
    }
  });

  return (
    <div className="space-y-6">
      {profile?.memberships.length ? (
        <ul className="divide-y divide-line rounded-panel border border-line">
          {profile.memberships.map((membership) => (
            <li
              key={membership.companyId}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{membership.name}</p>
                <p className="truncate font-mono text-xs text-muted">/c/{membership.slug}</p>
              </div>
              <span className="shrink-0 text-xs text-muted">{ROLE_LABELS[membership.role]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">You are not part of a company yet.</p>
      )}
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError>{formError}</FormError>
        <TextField label="New company name" error={errors.name?.message} {...register('name')} />
        <Button type="submit" variant="secondary" loading={isSubmitting}>
          Create company
        </Button>
      </form>
    </div>
  );
}

function Sessions() {
  const { signOutEverywhere } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const endAll = async () => {
    setBusy(true);
    try {
      await signOutEverywhere();
      router.replace('/login');
    } catch {
      setBusy(false);
      toast('Could not sign out. Please try again.', 'error');
    }
  };

  return (
    <Button variant="danger" loading={busy} onClick={endAll}>
      Sign out of all devices
    </Button>
  );
}

export default function SettingsPage() {
  const { profile } = useAuth();
  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight">Settings</h1>
      {!profile?.emailVerifiedAt && (
        <p className="mb-8 rounded-control border border-line-strong bg-raised px-4 py-3 text-[13px] text-muted">
          Your email is not confirmed yet. Use the link we sent to {profile?.email}.
        </p>
      )}
      <Section title="Profile" intro="How you appear to the teams you work with.">
        <ProfileForm />
      </Section>
      <Section title="Companies" intro="Workspaces you belong to, and the role you hold in each.">
        <Companies />
      </Section>
      <Section title="Sessions" intro="Ends every session, including this one.">
        <Sessions />
      </Section>
    </div>
  );
}
