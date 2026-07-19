'use client';

import { useRouter } from 'next/navigation';
import { GitCompare, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCompareStore } from '../compare-store';

/** Floating tray that appears when 1+ cars are queued for comparison. */
export function CompareBar() {
  const router = useRouter();
  const { ids, clear } = useCompareStore();
  if (ids.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2.5 shadow-lift">
        <GitCompare className="h-5 w-5 text-primary" />
        <span className="text-sm font-medium">{ids.length} car{ids.length > 1 ? 's' : ''} to compare</span>
        <Button size="sm" disabled={ids.length < 2} onClick={() => router.push(`/compare?ids=${ids.join(',')}`)}>
          Compare
        </Button>
        <button onClick={clear} aria-label="Clear compare" className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
