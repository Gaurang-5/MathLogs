import {
  type ComponentPropsWithoutRef,
  type ElementType,
  type ReactNode,
} from 'react';
import { cn } from '../../utils/cn';

type SurfaceTone = 'default' | 'quiet' | 'material' | 'strong';

type TeacherSurfaceProps<T extends ElementType> = {
  as?: T;
  tone?: SurfaceTone;
  interactive?: boolean;
  children: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className'>;

const toneClasses: Record<SurfaceTone, string> = {
  default: 'border border-app-border bg-app-surface-opaque shadow-sm',
  quiet: 'border border-app-border bg-black/[0.025]',
  material: 'teacher-material shadow-md',
  strong: 'border border-app-border bg-app-surface-opaque shadow-lg',
};

export function TeacherSurface<T extends ElementType = 'div'>({
  as,
  tone = 'default',
  interactive = false,
  className,
  children,
  ...props
}: TeacherSurfaceProps<T>) {
  const Component = as ?? 'div';

  return (
    <Component
      className={cn(
        'rounded-[var(--teacher-radius-card)]',
        toneClasses[tone],
        interactive && 'teacher-interactive cursor-pointer',
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
