'use client';

import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { CONTROL_HEIGHTS, CONTROL_PADDING, CONTROL_SURFACE, type ControlSize } from './control';

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: ControlSize;
}

/**
 * Eighteen selects were hand-styled across six different looks — h-10 and h-9,
 * rounded-md and rounded-lg and rounded-full, border-input and border-border —
 * and none of them matched the Input beside them.
 *
 * The native arrow is suppressed and redrawn, because the OS-supplied one is a
 * different shape and colour on every platform and is the single thing that
 * makes a form look unfinished on Windows. The chevron is positioned with
 * `end-*` so it crosses to the left under dir="rtl" along with the text.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, size = 'lg', children, ...props }, ref) => (
    <div className="relative w-full">
      <select
        ref={ref}
        className={cn(
          CONTROL_SURFACE,
          CONTROL_HEIGHTS[size],
          CONTROL_PADDING[size],
          // Room for the chevron, on whichever side the writing mode puts it.
          'cursor-pointer appearance-none pe-10',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute end-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  ),
);
Select.displayName = 'Select';
