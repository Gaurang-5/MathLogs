import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, LoaderCircle, TriangleAlert } from 'lucide-react';
import { cn } from '../../utils/cn';

type FeedbackKind = 'loading' | 'empty' | 'success' | 'warning' | 'error';

interface TeacherFeedbackProps {
  kind: FeedbackKind;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

const kindStyles: Record<FeedbackKind, string> = {
  loading: 'border-app-border bg-app-surface-opaque text-app-text-secondary',
  empty: 'border-app-border bg-app-surface-opaque text-app-text-secondary',
  success: 'border-success/20 bg-success/10 text-app-text',
  warning: 'border-warning/30 bg-warning/10 text-app-text',
  error: 'border-danger/20 bg-danger/10 text-app-text',
};

function FeedbackIcon({ kind }: { kind: FeedbackKind }) {
  const className = 'mt-0.5 size-5 shrink-0';
  if (kind === 'loading') return <LoaderCircle aria-hidden className={cn(className, 'animate-spin')} />;
  if (kind === 'success') return <CheckCircle2 aria-hidden className={cn(className, 'text-success')} />;
  if (kind === 'warning') return <TriangleAlert aria-hidden className={cn(className, 'text-amber-600')} />;
  if (kind === 'error') return <AlertCircle aria-hidden className={cn(className, 'text-danger')} />;
  return <Info aria-hidden className={className} />;
}

export function TeacherFeedback({
  kind,
  title,
  description,
  action,
  className,
}: TeacherFeedbackProps) {
  const urgent = kind === 'error' || kind === 'warning';

  return (
    <div
      role={urgent ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-[var(--teacher-radius-card)] border p-4',
        kindStyles[kind],
        className,
      )}
    >
      <FeedbackIcon kind={kind} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-app-text">{title}</p>
        {description ? <p className="mt-1 text-sm leading-6 text-app-text-secondary">{description}</p> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}
