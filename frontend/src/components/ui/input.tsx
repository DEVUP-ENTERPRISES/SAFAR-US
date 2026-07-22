'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-12 sm:h-14 w-full rounded-xl border border-input/60 bg-muted/30 px-4 py-3 text-base font-medium shadow-sm transition-all',
        'placeholder:text-muted-foreground/70',
        'focus-visible:outline-none focus-visible:border-primary/50 focus-visible:bg-background focus-visible:ring-[4px] focus-visible:ring-primary/10',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
