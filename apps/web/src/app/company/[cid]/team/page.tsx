'use client';

import { MEMBERSHIP_ROLES, type MembershipRole } from '@hireflow/shared';
import { Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FormError, SelectField, TextField } from '@/components/ui/field';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { ROLE_LABELS, useAddMember, useChangeRole, useMembers, useRemoveMember } from '@/lib/ats';
import { avatarColor } from '@/lib/format';
import { errorMessage } from '@/lib/forms';
import { useCompanyRole } from '../use-membership';

const ROLE_NOTES: Record<MembershipRole, string> = {
  admin: 'Runs everything, including the team.',
  recruiter: 'Runs all jobs and all candidates.',
  hiring_manager: 'Runs their own jobs and moves candidates.',
  interviewer: 'Sees only the people given to them.',
};

export default function TeamPage() {
  const { cid, role } = useCompanyRole();
  const isAdmin = role === 'admin';
  const members = useMembers(cid, isAdmin);
  const add = useAddMember(cid);
  const change = useChangeRole(cid);
  const remove = useRemoveMember(cid);
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [newRole, setNewRole] = useState<MembershipRole>('interviewer');

  if (!isAdmin) {
    return (
      <div className="p-4 sm:p-6">
        <ErrorState message="Only an admin can manage the team." />
      </div>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    add.mutate(
      { email, role: newRole },
      {
        onSuccess: () => {
          setEmail('');
          toast('Team member added');
        },
      },
    );
  };
  const onError = (error: unknown) => toast(errorMessage(error), 'error');

  return (
    <div className="grid items-start gap-4 p-4 sm:p-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section className="animate-fade-up rounded-[24px] border border-line bg-raised/60 p-5 sm:p-8">
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Team</h1>
        {members.isPending ? (
          <Skeleton className="mt-6 h-40" />
        ) : members.isError ? (
          <div className="mt-6">
            <ErrorState message="We could not load your team." onRetry={() => members.refetch()} />
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-line" data-testid="team">
            {members.data.map((member) => (
              <li key={member.userId} className="flex flex-wrap items-center gap-3 py-3.5">
                <span
                  aria-hidden
                  className="font-display grid size-11 shrink-0 place-items-center rounded-xl text-lg font-extrabold text-on-accent"
                  style={{ background: avatarColor(member.fullName) }}
                >
                  {member.fullName.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-40 flex-1">
                  <p className="truncate text-[15px] font-bold">{member.fullName}</p>
                  <p className="truncate text-[13px] text-muted">{member.email}</p>
                </div>
                <label>
                  <span className="sr-only">Role of {member.fullName}</span>
                  <select
                    value={member.role}
                    onChange={(event) =>
                      change.mutate(
                        { userId: member.userId, role: event.target.value as MembershipRole },
                        { onError },
                      )
                    }
                    className="h-10 rounded-control border border-line-strong bg-sunken px-3 text-sm font-semibold"
                  >
                    {MEMBERSHIP_ROLES.map((option) => (
                      <option key={option} value={option}>
                        {ROLE_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  aria-label={`Remove ${member.fullName}`}
                  onClick={() => remove.mutate(member.userId, { onError })}
                  className="grid size-10 place-items-center rounded-control text-muted hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="space-y-4">
        <section
          className="animate-fade-up rounded-[24px] border border-line bg-raised/60 p-5 sm:p-8"
          style={{ animationDelay: '80ms' }}
        >
          <h2 className="font-display text-3xl font-extrabold tracking-tight">Add a person</h2>
          <p className="mt-1.5 mb-5 text-[15px] text-muted">
            They need a HireFlow account with this email first.
          </p>
          <form onSubmit={submit} noValidate className="space-y-4">
            {add.isError && <FormError>{errorMessage(add.error)}</FormError>}
            <TextField
              label="Their email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <SelectField
              label="Role"
              value={newRole}
              onChange={(event) => setNewRole(event.target.value as MembershipRole)}
            >
              {MEMBERSHIP_ROLES.map((option) => (
                <option key={option} value={option}>
                  {ROLE_LABELS[option]}
                </option>
              ))}
            </SelectField>
            <Button type="submit" loading={add.isPending}>
              Add to team
            </Button>
          </form>
        </section>
        <section
          className="animate-fade-up rounded-[24px] border border-line bg-raised/60 p-5 sm:p-8"
          style={{ animationDelay: '160ms' }}
        >
          <h2 className="font-display mb-4 text-3xl font-extrabold tracking-tight">
            Who can do what
          </h2>
          <dl className="space-y-3">
            {MEMBERSHIP_ROLES.map((option) => (
              <div key={option}>
                <dt className="text-[15px] font-bold">{ROLE_LABELS[option]}</dt>
                <dd className="text-[15px] text-muted">{ROLE_NOTES[option]}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
