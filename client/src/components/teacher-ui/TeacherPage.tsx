import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface TeacherPageProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  width?: 'full' | 'readable';
  className?: string;
}

export function TeacherPage({
  title,
  description,
  actions,
  children,
  width = 'full',
  className,
}: TeacherPageProps) {
  return (
    <div
      data-teacher-page
      className={cn(
        'teacher-page space-y-6 md:space-y-8',
        width === 'readable' && 'max-w-5xl',
        className,
      )}
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-[-0.025em] text-app-text md:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="max-w-3xl text-sm leading-6 text-app-text-secondary md:text-[15px]">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div
            data-teacher-page-actions
            className="flex shrink-0 flex-wrap items-center gap-2"
          >
            {actions}
          </div>
        ) : null}
      </header>
      {children}
    </div>
  );
}

interface TeacherSectionProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function TeacherSection({
  title,
  description,
  actions,
  children,
  className,
}: TeacherSectionProps) {
  return (
    <section className={cn('space-y-3', className)}>
      {title || description || actions ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="text-lg font-semibold text-app-text">{title}</h2> : null}
            {description ? (
              <p className="mt-1 text-sm leading-6 text-app-text-secondary">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
