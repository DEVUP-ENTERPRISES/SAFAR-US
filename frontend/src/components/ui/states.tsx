import type { ReactNode } from 'react';
import { Inbox, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * Reusable empty state.
 *
 * An empty screen is the first thing a new host or guest sees on most of these
 * forty pages, so it is a first impression rather than an edge case. The dashed
 * box read as a missing component; this reads as a considered resting state —
 * the icon sits in a soft well, the title carries the display face, and the
 * action is given room instead of being tacked underneath.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/40 px-6 py-16 text-center',
        className,
      )}
    >
      {/* Concentric rings rather than a bare glyph: it gives the icon a centre
          of gravity on an otherwise empty field. */}
      <div className="relative grid h-16 w-16 place-items-center">
        <span className="absolute inset-0 rounded-full bg-muted/60" />
        <span className="absolute inset-[18%] rounded-full bg-muted" />
        <span className="relative text-muted-foreground">
          {icon ?? <Inbox className="h-6 w-6" />}
        </span>
      </div>

      <p className="display mt-5 text-xl text-foreground">{title}</p>
      {description && (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** Reusable error state. */
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-2xl border border-destructive/25 bg-destructive/5 px-6 py-16 text-center"
    >
      <div className="relative grid h-16 w-16 place-items-center">
        <span className="absolute inset-0 rounded-full bg-destructive/10" />
        <AlertTriangle className="relative h-6 w-6 text-destructive" />
      </div>
      <p className="mt-5 max-w-sm text-sm font-medium leading-relaxed text-destructive">{message}</p>
      {retry && (
        <button
          onClick={retry}
          className="mt-5 rounded-full border border-destructive/30 px-4 py-2 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
        >
          Try again
        </button>
      )}
    </div>
  );
}
