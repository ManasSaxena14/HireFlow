import { clsx } from 'clsx';
import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover font-semibold',
  secondary: 'bg-raised text-fg border border-line-strong hover:bg-overlay font-medium',
  ghost: 'text-muted hover:text-fg hover:bg-raised font-medium',
  danger: 'text-danger border border-line-strong hover:bg-danger-soft font-medium',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9.5 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-[15px] gap-2',
};

export const buttonClass = (variant: Variant = 'primary', size: Size = 'md') =>
  clsx(
    'inline-flex shrink-0 items-center justify-center rounded-control whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none',
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
