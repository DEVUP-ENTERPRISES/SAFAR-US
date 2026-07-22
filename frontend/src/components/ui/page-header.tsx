import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Consistent page header for every dashboard/panel page. Gives each screen the
 * same confident title hierarchy instead of ad-hoc <h1> tags per page.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4 pb-2', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 text-sm font-bold uppercase tracking-widest text-primary">{eyebrow}</p>
        )}
        <h1 className="text-4xl sm:text-[2.75rem] font-black tracking-tight leading-tight text-foreground">{title}</h1>
        {description && (
          <p className="mt-2.5 max-w-2xl text-[17px] font-medium text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
