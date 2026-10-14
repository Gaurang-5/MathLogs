import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '../../utils/cn';

type TeacherButtonVariant = 'primary' | 'secondary' | 'quiet' | 'destructive';
type TeacherButtonSize = 'sm' | 'md' | 'lg';

interface TeacherButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: TeacherButtonVariant;
  size?: TeacherButtonSize;
  icon?: ReactNode;
  iconOnlyLabel?: string;
  loading?: boolean;
}

const variantClasses: Record<TeacherButtonVariant, string> = {
  primary: 'border border-app-text bg-app-text text-app-bg shadow-sm hover:opacity-90',
  secondary: 'border border-app-border bg-app-surface-opaque text-app-text shadow-sm hover:bg-black/5',
  quiet: 'border border-transparent bg-transparent text-app-text-secondary hover:bg-black/5 hover:text-app-text',
  destructive: 'border border-danger/20 bg-danger/10 text-danger hover:bg-danger/15',
};

const sizeClasses: Record<TeacherButtonSize, string> = {
  sm: 'min-h-11 gap-1.5 rounded-xl px-3 text-sm',
  md: 'min-h-11 gap-2 rounded-[var(--teacher-radius-control)] px-4 text-sm',
  lg: 'min-h-12 gap-2 rounded-2xl px-5 text-[15px]',
};

export function TeacherButton({
  variant = 'primary',
  size = 'md',
  icon,
  iconOnlyLabel,
  loading = false,
  disabled,
  type = 'button',
  className,
  children,
  ...props
}: TeacherButtonProps) {
  const iconOnly = Boolean(iconOnlyLabel);

  return (
    <button
      type={type}
      aria-label={iconOnlyLabel}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        'teacher-interactive inline-flex min-w-11 items-center justify-center font-semibold',
        variantClasses[variant],
        sizeClasses[size],
        iconOnly && 'w-11 px-0',
        className,
      )}
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : icon}
      {iconOnly ? <span className="sr-only">{iconOnlyLabel}</span> : children}
    </button>
  );
}
