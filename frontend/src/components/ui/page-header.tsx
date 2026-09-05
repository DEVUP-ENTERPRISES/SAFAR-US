import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Consistent page header for every dashboard/panel page. Gives each screen the
 * same confident title hierarchy instead of ad-hoc <h1> tags per page.
 *
 * The title now actually uses the display FACE. It was set with `font-black
 * tracking-tight`, which only changes the weight and spacing of the BODY font
 * — so the display family loaded on every page and never appeared on any of
 * the thirty-four screens that use this header. The type pairing existed on
 * paper only.
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
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        )}
        {/* balance stops a two-line title breaking with one orphaned word. */}
        <h1 className="display text-4xl text-foreground [text-wrap:balance] sm:text-[2.75rem]">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
