import { clsx } from 'clsx';
import type {
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { useId } from 'react';

const CONTROL =
  'w-full rounded-control border bg-sunken px-3.5 text-[15px] text-fg placeholder:text-subtle transition-all focus:outline-none focus:border-accent focus:ring-3 focus:ring-accent/25 aria-invalid:border-danger disabled:opacity-60';

interface FieldShellProps {
  label: string;
  error?: string;
  hint?: string;
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
    className: string;
  }) => ReactNode;
}

function FieldShell({ label, error, hint, children }: FieldShellProps) {
  const id = useId();
  const noteId = `${id}-note`;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-fg">
        {label}
      </label>
      {children({
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': error || hint ? noteId : undefined,
        className: clsx(CONTROL, error ? 'border-danger' : 'border-line-strong'),
      })}
      {(error || hint) && (
        <p id={noteId} className={clsx('mt-1.5 text-[13px]', error ? 'text-danger' : 'text-muted')}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  ref?: Ref<HTMLInputElement>;
}

export function TextField({ label, error, hint, className, ref, ...rest }: TextFieldProps) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {(props) => (
        <input
          ref={ref}
          {...rest}
          {...props}
          className={clsx(props.className, 'h-12', className)}
        />
      )}
    </FieldShell>
  );
}

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
  ref?: Ref<HTMLTextAreaElement>;
}

export function TextAreaField({ label, error, hint, className, ref, ...rest }: TextAreaFieldProps) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {(props) => (
        <textarea
          ref={ref}
          rows={3}
          {...rest}
          {...props}
          className={clsx(props.className, 'py-3 leading-relaxed', className)}
        />
      )}
    </FieldShell>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  ref?: Ref<HTMLSelectElement>;
}

export function SelectField({
  label,
  error,
  hint,
  className,
  children,
  ref,
  ...rest
}: SelectFieldProps) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {(props) => (
        <select ref={ref} {...rest} {...props} className={clsx(props.className, 'h-12', className)}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-control bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
    >
      {children}
    </p>
  );
}
