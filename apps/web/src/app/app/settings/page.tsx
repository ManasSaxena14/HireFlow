'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateCompanyInput,
  createCompanySchema,
  updateProfileSchema,
} from '@hireflow/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormError, SelectField, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ROLE_LABELS } from '@/lib/ats';
import { applyServerErrors } from '@/lib/forms';

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
    <section className="rounded-[24px] border border-line bg-raised/60 p-6 sm:p-8">
      <h2 className="font-display text-3xl font-extrabold tracking-tight">{title}</h2>
      <p className="mt-1.5 mb-6 text-[15px] leading-relaxed text-muted">{intro}</p>
      {children}
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
        hint="We use this to show reminder times."
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
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {profile.memberships.map((membership) => (
            <li
              key={membership.companyId}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/company/${membership.companyId}/jobs`}
                  className="block truncate text-sm font-medium hover:text-accent"
                >
                  {membership.name}
                </Link>
                <p className="truncate text-xs text-muted">/c/{membership.slug}</p>
              </div>
              <span className="shrink-0 text-xs text-muted">{ROLE_LABELS[membership.role]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[15px] text-muted">You are not in a company yet.</p>
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
      toast('We could not sign you out. Please try again.', 'error');
    }
  };

  return (
    <Button variant="danger" loading={busy} onClick={endAll}>
      Sign out on all devices
    </Button>
  );
}

export default function SettingsPage() {
  const { profile } = useAuth();
  return (
    <div className="flex min-h-full flex-col p-4 sm:p-6">
      <h1 className="font-display mb-6 text-4xl font-extrabold tracking-tight sm:text-5xl">
        Settings
      </h1>
      {!profile?.emailVerifiedAt && (
        <p className="mb-4 rounded-2xl border border-status-screening/40 bg-status-screening/10 px-5 py-4 text-[15px] font-medium">
          Please confirm your email, {profile?.email}.{' '}
          <Link
            href={`/verify-email?email=${encodeURIComponent(profile?.email ?? '')}`}
            className="font-semibold underline underline-offset-4"
          >
            Confirm it now
          </Link>
        </p>
      )}
      <div className="grid flex-1 gap-4 xl:grid-cols-2">
        <Section title="Your profile" intro="Your name and your time zone.">
          <ProfileForm />
        </Section>
        <div className="space-y-4">
          <Section
            title="Companies"
            intro="The companies you belong to, and your role in each one."
          >
            <Companies />
          </Section>
          <Section
            title="Sign out everywhere"
            intro="This signs you out on all your devices, including this one."
          >
            <Sessions />
          </Section>
        </div>
      </div>
    </div>
  );
}
