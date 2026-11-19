'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { useDisclosures } from './api';
import type { DisclosureId } from './disclosures';

export function DisclosureNote({ ids, onDark = false, className }: { ids: DisclosureId[]; onDark?: boolean; className?: string }) {
  const { sections } = useDisclosures();
  const notes = ids.map((id) => sections.find((s) => s.id === id)?.note).filter(Boolean);
  return (
    <p className={cn('text-xs leading-relaxed', onDark ? 'text-white/75' : 'text-muted-foreground', className)}>
      {notes.join(' ')}{' '}
      <Link
        href={`/legal/disclosures#${ids[0]}`}
        className={cn('font-semibold underline underline-offset-2', onDark ? 'text-white hover:text-white/90' : 'text-foreground hover:text-primary')}
      >
        Full disclosure
      </Link>
    </p>
  );
}
