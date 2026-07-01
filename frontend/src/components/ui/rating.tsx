import { Star } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export function Rating({
  value,
  count,
  size = 'sm',
  className,
}: {
  value: number;
  count?: number;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const dim = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  if (!value) return <span className={cn('text-sm text-muted-foreground', className)}>New</span>;
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <Star className={cn(dim, 'fill-amber-400 text-amber-400')} />
      <span className="text-sm font-medium">{value.toFixed(1)}</span>
      {count !== undefined && count > 0 && (
        <span className="text-sm text-muted-foreground">({count})</span>
      )}
    </span>
  );
}
