'use client';

import { clsx } from 'clsx';
import { X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

const CLOSE_MS = 240;

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** "sheet" opens from the right. "center" is a normal pop-up. */
  variant?: 'center' | 'sheet';
  children: ReactNode;
  actions?: ReactNode;
}

/** Uses the browser's own dialog element, which handles focus and the Escape key. */
export function Dialog({
  open,
  onClose,
  title,
  variant = 'center',
  children,
  actions,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // Keeps the content on screen while the closing animation plays.
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      setRendered(true);
      setClosing(false);
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (!dialog.open) return;
    setClosing(true);
    const timer = setTimeout(() => {
      dialog.close();
      setClosing(false);
      setRendered(false);
    }, CLOSE_MS);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <dialog
      ref={ref}
      data-closing={closing ? '' : undefined}
      aria-label={title}
      onCancel={(event) => {
        // Escape should play the same closing animation as the close button.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={clsx(
        'border-line-strong bg-canvas text-fg shadow-2xl shadow-black backdrop:bg-black/70 backdrop:backdrop-blur-sm',
        variant === 'center'
          ? 'm-auto max-h-[92dvh] w-[calc(100vw-2rem)] max-w-2xl rounded-panel border'
          : 'sheet my-0 mr-0 ml-auto h-dvh max-h-dvh w-full max-w-2xl border-l',
      )}
    >
      {rendered && (
        <div className="flex h-full max-h-[inherit] flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
            <h2 className="font-display truncate text-xl font-extrabold tracking-tight">{title}</h2>
            <div className="flex items-center gap-1">
              {actions}
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="grid size-9 place-items-center rounded-control text-muted hover:bg-raised hover:text-fg"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
      )}
    </dialog>
  );
}
