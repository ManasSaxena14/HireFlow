import { clsx } from 'clsx';

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={clsx('inline-flex items-center gap-2 font-semibold tracking-tight', className)}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-[1.25em]">
        <rect x="3" y="3" width="4.5" height="18" rx="1" fill="currentColor" />
        <rect x="16.5" y="3" width="4.5" height="18" rx="1" fill="currentColor" />
        <path d="M7.5 15.5 C11 15.5 13 8.5 16.5 8.5" stroke="#ff4b32" strokeWidth="3" fill="none" />
      </svg>
      HireFlow
    </span>
  );
}
