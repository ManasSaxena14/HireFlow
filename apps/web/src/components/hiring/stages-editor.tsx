'use client';

import { type PipelineStage, STAGE_KINDS, type StageKind } from '@hireflow/shared';
import { ArrowDown, ArrowUp, Mail, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FormError, SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { KIND_COLORS, KIND_LABELS, type StageDraft, useSaveStages } from '@/lib/ats';
import { errorMessage } from '@/lib/forms';

type Row = StageDraft & { key: string; emailOpen: boolean };

const toRow = (stage: PipelineStage): Row => ({
  key: stage.id,
  id: stage.id,
  name: stage.name,
  kind: stage.kind,
  emailSubject: stage.emailSubject,
  emailBody: stage.emailBody,
  emailOpen: Boolean(stage.emailSubject),
});

export function StagesEditor({
  cid,
  jobId,
  stages,
  onDone,
}: {
  cid: string;
  jobId: string;
  stages: PipelineStage[];
  onDone: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => stages.map(toRow));
  const [nextKey, setNextKey] = useState(1);
  const save = useSaveStages(cid, jobId);

  const change = (key: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const shift = (index: number, by: number) =>
    setRows((current) => {
      const next = [...current];
      const [row] = next.splice(index, 1);
      if (row) next.splice(index + by, 0, row);
      return next;
    });

  const add = () => {
    setRows((current) => {
      // New steps go before the last two, which are normally Hired and Not selected.
      const at = Math.max(1, current.length - 2);
      const row: Row = {
        key: `new-${nextKey}`,
        name: '',
        kind: 'interview',
        emailSubject: null,
        emailBody: null,
        emailOpen: false,
      };
      return [...current.slice(0, at), row, ...current.slice(at)];
    });
    setNextKey((key) => key + 1);
  };

  const submit = () =>
    save.mutate(
      rows.map(({ key: _key, emailOpen, ...row }) => ({
        ...row,
        emailSubject: emailOpen ? row.emailSubject : null,
        emailBody: emailOpen ? row.emailBody : null,
      })),
      { onSuccess: onDone },
    );

  return (
    <div className="space-y-4 p-6">
      <p className="text-[15px] leading-relaxed text-muted">
        These are the columns on the board. You can also send an email when a person reaches a step.
      </p>
      {save.isError && <FormError>{errorMessage(save.error)}</FormError>}
      <ol className="space-y-3">
        {rows.map((row, index) => (
          <li
            key={row.key}
            data-testid="stage-row"
            className="rounded-2xl border border-line bg-raised/60 p-4"
            style={{ borderLeft: `4px solid ${KIND_COLORS[row.kind]}` }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Name"
                value={row.name}
                onChange={(event) => change(row.key, { name: event.target.value })}
              />
              <SelectField
                label="Type"
                value={row.kind}
                onChange={(event) => change(row.key, { kind: event.target.value as StageKind })}
              >
                {STAGE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {KIND_LABELS[kind]}
                  </option>
                ))}
              </SelectField>
            </div>
            {row.emailOpen && (
              <div className="mt-3 space-y-3">
                <TextField
                  label="Email subject"
                  value={row.emailSubject ?? ''}
                  onChange={(event) => change(row.key, { emailSubject: event.target.value })}
                />
                <TextAreaField
                  label="Email message"
                  hint="You can use {{name}}, {{job}} and {{company}}."
                  rows={4}
                  value={row.emailBody ?? ''}
                  onChange={(event) => change(row.key, { emailBody: event.target.value })}
                />
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Move ${row.name || 'step'} up`}
                disabled={index === 0}
                onClick={() => shift(index, -1)}
              >
                <ArrowUp aria-hidden className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Move ${row.name || 'step'} down`}
                disabled={index === rows.length - 1}
                onClick={() => shift(index, 1)}
              >
                <ArrowDown aria-hidden className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={row.emailOpen}
                onClick={() => change(row.key, { emailOpen: !row.emailOpen })}
              >
                <Mail aria-hidden className="size-4" />
                {row.emailOpen ? 'No email' : 'Add email'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                aria-label={`Remove ${row.name || 'step'}`}
                onClick={() =>
                  setRows((current) => current.filter((other) => other.key !== row.key))
                }
              >
                <Trash2 aria-hidden className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <Button variant="secondary" onClick={add}>
          <Plus aria-hidden className="size-4" />
          Add a step
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={submit}>
            Save steps
          </Button>
        </div>
      </div>
    </div>
  );
}
