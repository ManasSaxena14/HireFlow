'use client';

import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { TextAreaField } from '@/components/ui/field';

/** A person cannot be moved to "not selected" without a reason. This asks for it. */
export function RejectDialog({
  name,
  open,
  busy,
  onCancel,
  onConfirm,
}: {
  name: string;
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const clean = reason.trim();
    if (!clean) {
      setError('Please write a reason.');
      return;
    }
    setReason('');
    setError(undefined);
    onConfirm(clean);
  };

  return (
    <Dialog open={open} onClose={onCancel} title={`Not selecting ${name}`}>
      <form onSubmit={submit} noValidate className="space-y-4 p-6">
        <TextAreaField
          label="Why not?"
          hint="Only your team sees this."
          autoFocus
          rows={3}
          value={reason}
          error={error}
          onChange={(event) => setReason(event.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" loading={busy}>
            Confirm
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
