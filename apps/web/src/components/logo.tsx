import { clsx } from 'clsx';

/** `onAccent` swaps the colours for use on a coral background. */
export function Logo({ className, onAccent }: { className?: string; onAccent?: boolean }) {
  return (
    <span
      className={clsx(
        'font-display inline-flex items-center gap-2.5 font-extrabold tracking-tight',
        className,
      )}
    >
      <span
        aria-hidden
        className={clsx(
          'grid size-[1.7em] place-items-center rounded-[0.45em]',
          onAccent ? 'bg-on-accent' : 'bg-accent',
        )}
      >
        <svg viewBox="0 0 24 24" className="size-[1.15em]">
          <rect
            x="3"
            y="3"
            width="5"
            height="18"
            rx="1.5"
            fill={onAccent ? '#ff4b32' : '#131518'}
          />
          <rect
            x="16"
            y="3"
            width="5"
            height="18"
            rx="1.5"
            fill={onAccent ? '#ff4b32' : '#131518'}
          />
          <path
            d="M8 15.5 C11.5 15.5 12.5 8.5 16 8.5"
            stroke="#f6f7f8"
            strokeWidth="3"
            fill="none"
          />
        </svg>
      </span>
      HireFlow
    </span>
  );
}
