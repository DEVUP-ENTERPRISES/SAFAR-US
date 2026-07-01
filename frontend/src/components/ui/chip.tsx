'use client';

import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

/** Selectable filter pill. */
export function Chip({
  active,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-soft'
          : 'border-border bg-background text-foreground hover:border-primary/50 hover:bg-accent',
        className,
      )}
      {...props}
    />
  );
}
