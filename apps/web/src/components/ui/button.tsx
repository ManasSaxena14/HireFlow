import { clsx } from 'clsx';
import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
type Size = 'sm' | 'md' | 'lg' | 'xl';

const VARIANTS: Record<Variant, string> = {
  primary:
    'glow-button bg-accent text-on-accent hover:bg-accent-hover font-bold hover:-translate-y-0.5',
  secondary: 'bg-raised text-fg border border-line-strong hover:bg-overlay font-semibold',
  ghost: 'text-muted hover:text-fg hover:bg-raised font-semibold',
  danger: 'text-danger border border-line-strong hover:bg-danger-soft font-semibold',
  dark: 'bg-sunken text-fg hover:bg-canvas font-bold hover:-translate-y-0.5',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[13px] gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-13 px-7 text-base gap-2',
  xl: 'h-16 px-10 text-lg gap-3',
};

export const buttonClass = (variant: Variant = 'primary', size: Size = 'md') =>
  clsx(
    'inline-flex shrink-0 items-center justify-center rounded-control whitespace-nowrap transition disabled:opacity-50 disabled:pointer-events-none',
    VARIANTS[variant],
    SIZES[size],
  );

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  variant,
  size,
  loading,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={clsx(buttonClass(variant, size), className)}
      {...rest}
    >
      {loading && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
      {children}
    </button>
  );
}
