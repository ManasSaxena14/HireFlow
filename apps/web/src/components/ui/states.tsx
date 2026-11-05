import type { ReactNode } from 'react';
import { Button } from './button';

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-panel border border-line p-6"
    >
      <p className="text-sm text-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-panel border border-dashed border-line-strong px-6 py-14 text-center">
      <p className="text-[15px] font-medium">{title}</p>
      {children && <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export const Skeleton = ({ className }: { className?: string }) => (
  <div aria-hidden className={`animate-pulse rounded-control bg-raised ${className ?? ''}`} />
);
