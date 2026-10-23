'use client';

import { GitCompare } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useCompareStore } from '../compare-store';

export function CompareButton({ vehicleId, className }: { vehicleId: string; className?: string }) {
  const { ids, toggle } = useCompareStore();
  const active = ids.includes(vehicleId);
  return (
    <button
      type="button"
      aria-label={active ? 'Remove from compare' : 'Add to compare'}
      aria-pressed={active}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(vehicleId); }}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:border-primary/40 hover:text-primary',
        className,
      )}
    >
      <GitCompare className="h-3.5 w-3.5" />
      {active ? 'Comparing' : 'Compare'}
    </button>
  );
}
