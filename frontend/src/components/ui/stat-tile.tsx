import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type Tone = 'default' | 'primary' | 'success' | 'warning' | 'destructive';

const TONES: Record<Tone, string> = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  destructive: 'bg-destructive/10 text-destructive',
};

/**
 * The metric card used across every dashboard (admin, host, corporate).
 * One component → one visual language for every number on the platform.
 * When `href` is set the tile becomes a queue shortcut (hover reveals the arrow).
 */
export function StatTile({
  label,
  value,
  sub,
  icon,
  href,
  tone = 'default',
  emphasis,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon?: ReactNode;
  href?: string;
  tone?: Tone;
  /** Highlights the tile — use for action queues that need attention. */
  emphasis?: boolean;
  className?: string;
}) {
  const body = (
    <div
      className={cn(
        'group relative h-full overflow-hidden rounded-[2rem] border bg-card p-6 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.06)] transition-all duration-300',
        href && 'cursor-pointer hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_12px_48px_-12px_rgba(0,0,0,0.12)]',
        emphasis ? 'border-primary/40 ring-1 ring-primary/40' : 'border-border/60',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {icon && (
          <span className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-full', TONES[tone])}>
            {icon}
          </span>
        )}
        {href && (
          <ArrowUpRight className="h-5 w-5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </div>

      <p className="mt-5 text-[15px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1.5 truncate text-3xl font-black tracking-tighter text-foreground">{value}</p>
      {sub && <p className="mt-2 truncate text-sm font-medium text-muted-foreground/70">{sub}</p>}
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}
