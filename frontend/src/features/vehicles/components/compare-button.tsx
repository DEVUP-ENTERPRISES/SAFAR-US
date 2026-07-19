'use client';

import { GitCompare } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useCompareStore } from '../compare-store';

export function CompareButton({ vehicleId }: { vehicleId: string }) {
  const { ids, toggle } = useCompareStore();
  const active = ids.includes(vehicleId);
  return (
    <button
      type="button"
      aria-label={active ? 'Remove from compare' : 'Add to compare'}
      aria-pressed={active}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(vehicleId); }}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full shadow-soft backdrop-blur transition-transform hover:scale-110 active:scale-95',
        active ? 'bg-primary text-primary-foreground' : 'bg-background/90 text-foreground',
      )}
    >
      <GitCompare className="h-4 w-4" />
    </button>
  );
}
