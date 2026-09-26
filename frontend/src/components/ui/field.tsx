'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  /** Marks the field with a red asterisk. */
  required?: boolean;
  /** Highlights the field as one the person still has to fill in. */
  invalid?: boolean;
  children: ReactNode;
  className?: string;
}

/** Accessible form field: label + control + error, wired for screen readers. */
export function Field({ label, htmlFor, error, hint, required, invalid, children, className }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', invalid && '[&_input]:border-destructive [&_input]:bg-destructive/5 [&_input]:ring-1 [&_input]:ring-destructive/40', className)}>
      <label htmlFor={htmlFor} className={cn('text-sm font-medium', invalid ? 'text-destructive' : 'text-foreground')}>
        {label}
        {required && <span className="ms-0.5 text-destructive" aria-hidden>*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
