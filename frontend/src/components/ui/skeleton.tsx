import { cn } from '@/lib/utils/cn';

/**
 * Shimmering placeholder for loading states.
 *
 * The sweep was `via-white/10` over `bg-muted`, which is 93% lightness in the
 * light theme — white at ten percent over near-white is invisible, so on the
 * default theme this animated nothing at all and the skeleton read as a dead
 * grey block. It now sweeps with the foreground colour at low alpha, which has
 * contrast against the track in BOTH themes rather than only the dark one.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-md bg-muted', className)}
      aria-hidden="true"
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-foreground/[0.07] to-transparent" />
    </div>
  );
}
