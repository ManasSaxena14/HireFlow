'use client';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

export function CancelInterviewDialog({
  name,
  open,
  busy,
  onCancel,
  onConfirm,
}: {
  name: string;
  open: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} title="Cancel this interview?">
      <div className="space-y-5 p-6">
        <p className="text-[15px] text-muted">
          We will email {name} and the interviewer, and stop the reminders. This cannot be undone,
          but you can book a new interview later.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Keep it
          </Button>
          <Button variant="danger" loading={busy} onClick={onConfirm}>
            Cancel interview
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
