import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { DISCLOSURE, type DisclosureId } from './disclosures';

export function DisclosureNote({ ids, onDark = false, className }: { ids: DisclosureId[]; onDark?: boolean; className?: string }) {
  return (
    <p className={cn('text-xs leading-relaxed', onDark ? 'text-white/75' : 'text-muted-foreground', className)}>
      {ids.map((id) => DISCLOSURE[id].note).join(' ')}{' '}
      <Link
        href={`/legal/disclosures#${ids[0]}`}
        className={cn('font-semibold underline underline-offset-2', onDark ? 'text-white hover:text-white/90' : 'text-foreground hover:text-primary')}
      >
        Full disclosure
      </Link>
    </p>
  );
}
