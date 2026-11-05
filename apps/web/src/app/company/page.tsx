'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type CreateCompanyInput, createCompanySchema } from '@hireflow/shared';
import { ArrowRight, Building2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { FormError, TextField } from '@/components/ui/field';
import { api } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/ats';
import { useAuth } from '@/lib/auth';
import { applyServerErrors } from '@/lib/forms';

function CreateCompany() {
  const { reloadProfile } = useAuth();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateCompanyInput>({ resolver: zodResolver(createCompanySchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const company = await api<{ id: string }>('/companies', { method: 'POST', body: values });
      await reloadProfile();
      router.push(`/company/${company.id}/jobs`);
    } catch (error) {
      setFormError(applyServerErrors(error, setError));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormError>{formError}</FormError>
      <TextField label="Company name" error={errors.name?.message} {...register('name')} />
      <Button type="submit" size="lg" loading={isSubmitting}>
        Create company
      </Button>
    </form>
  );
}

function CompanyChooser() {
  const { profile } = useAuth();
  const router = useRouter();
  const choosing = useSearchParams().has('choose');
  const memberships = profile?.memberships ?? [];
  const only = memberships.length === 1 && !choosing ? memberships[0] : undefined;

  useEffect(() => {
    if (only) router.replace(`/company/${only.companyId}/jobs`);
  }, [only, router]);
  if (only) return null;

  return (
    <div className="grid min-h-full gap-4 p-4 sm:p-6 xl:grid-cols-2">
      <section className="relative flex animate-fade-up flex-col justify-between overflow-hidden rounded-[28px] bg-accent p-6 text-on-accent sm:p-10">
        <span className="inline-grid size-16 place-items-center rounded-2xl bg-on-accent text-accent">
          <Building2 aria-hidden className="size-8" />
        </span>
        <div className="mt-16">
          <h1 className="font-display text-[clamp(3rem,6vw,7rem)] leading-[0.95] font-extrabold tracking-tight">
            Hire with your team.
          </h1>
          <p className="mt-4 max-w-md text-lg font-medium">
            Post a job, share one careers page and follow every person from start to finish.
          </p>
        </div>
      </section>
      <div className="space-y-4">
        {memberships.length > 0 && (
          <section
            className="animate-fade-up rounded-[24px] border border-line bg-raised/60 p-6 sm:p-8"
            style={{ animationDelay: '80ms' }}
          >
            <h2 className="font-display mb-5 text-3xl font-extrabold tracking-tight">
              Your companies
            </h2>
            <ul className="space-y-2">
              {memberships.map((membership) => (
                <li key={membership.companyId}>
                  <Link
                    href={`/company/${membership.companyId}/jobs`}
                    className="group card-lift flex items-center justify-between gap-4 rounded-2xl border border-line bg-raised p-4 hover:border-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-lg font-bold">{membership.name}</span>
                      <span className="text-[13px] text-muted">{ROLE_LABELS[membership.role]}</span>
                    </span>
                    <ArrowRight
                      aria-hidden
                      className="size-5 shrink-0 text-muted transition group-hover:translate-x-1 group-hover:text-accent"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section
          className="animate-fade-up rounded-[24px] border border-line bg-raised/60 p-6 sm:p-8"
          style={{ animationDelay: '160ms' }}
        >
          <h2 className="font-display text-3xl font-extrabold tracking-tight">
            {memberships.length > 0 ? 'Add another company' : 'Start with your company'}
          </h2>
          <p className="mt-1.5 mb-6 text-[15px] text-muted">
            You will be the admin. You can add your team after this.
          </p>
          <CreateCompany />
        </section>
      </div>
    </div>
  );
}

export default function CompanyPage() {
  return (
    <Suspense>
      <CompanyChooser />
    </Suspense>
  );
}
