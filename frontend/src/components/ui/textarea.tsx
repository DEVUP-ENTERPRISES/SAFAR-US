'use client';

import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';
import { CONTROL_SURFACE } from './control';

/**
 * There was no Textarea primitive, so nine of them were hand-rolled as
 * `rounded-md border-input bg-background px-3 py-2 text-sm` — a different
 * radius, fill, padding and type size from the Input directly above them in
 * the same form.
 *
 * Height comes from `rows`, so this takes the surface without a size scale;
 * padding matches Input at `lg` so the two stack cleanly.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(CONTROL_SURFACE, 'resize-y px-4 py-3 text-base leading-relaxed', className)}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
