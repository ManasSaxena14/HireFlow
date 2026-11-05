import type { ReactNode } from 'react';
import { Button } from './button';

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-4 rounded-panel border border-line bg-raised p-8"
    >
      <p className="text-[15px] text-muted">{message}</p>
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
  className,
  icon,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative flex flex-col items-center justify-center overflow-hidden rounded-[24px] border border-dashed border-line-strong px-6 py-20 text-center ${className ?? ''}`}
    >
      <div aria-hidden className="grid-lines fade-edges absolute inset-0" />
      <div className="relative">
        {icon && (
          <span className="glow-button mb-6 inline-grid size-20 place-items-center rounded-3xl bg-accent text-on-accent">
            {icon}
          </span>
        )}
        <h2 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h2>
        {children && <p className="mx-auto mt-3 max-w-md text-lg text-muted">{children}</p>}
        {action && <div className="mt-8 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}

export const Skeleton = ({ className }: { className?: string }) => (
  <div aria-hidden className={`skeleton rounded-control ${className ?? ''}`} />
);
