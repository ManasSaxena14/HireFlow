'use client';

import { clsx } from 'clsx';
import { X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** "sheet" slides from the right; "center" is a regular modal. */
  variant?: 'center' | 'sheet';
  children: ReactNode;
  actions?: ReactNode;
}

/** Built on the native dialog element, which provides focus trapping and Escape. */
export function Dialog({
  open,
  onClose,
  title,
  variant = 'center',
  children,
  actions,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={clsx(
        'border-line-strong bg-canvas text-fg backdrop:bg-black/60',
        variant === 'center'
          ? 'm-auto max-h-[90dvh] w-[calc(100vw-2rem)] max-w-xl rounded-panel border'
          : 'my-0 mr-0 ml-auto h-dvh max-h-dvh w-full max-w-xl border-l',
      )}
    >
      {open && (
        <div className="flex h-full max-h-[inherit] flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
            <h2 className="truncate text-[15px] font-semibold">{title}</h2>
            <div className="flex items-center gap-1">
              {actions}
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="grid size-8 place-items-center rounded-control text-muted hover:bg-raised hover:text-fg"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
      )}
    </dialog>
  );
}
