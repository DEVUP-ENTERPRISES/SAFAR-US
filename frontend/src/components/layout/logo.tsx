import { cn } from '@/lib/utils/cn';

/**
 * The CATO emblem.
 *
 * A full-colour mark (road, plane, car, tyre) on a transparent background, so
 * it sits on any surface — the light navbar, the dark auth panel, an email —
 * without a coloured tile behind it. It carries its own identity; wrapping it
 * in a gradient chip, as the old placeholder mark needed, would fight it.
 *
 * One asset, referenced everywhere, so the brand can never drift between pages.
 */
export function Logo({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logos/cato-logo-256.png"
      alt="CATO"
      width={256}
      height={256}
      className={cn('object-contain', className)}
    />
  );
}
