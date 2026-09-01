'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';
import { controlClasses, type ControlSize } from './control';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: ControlSize;
}

/**
 * Default is `lg` (48px), which is also Button's `lg` — so an input and the
 * button beside it are the same height without either side guessing.
 *
 * This used to be `h-12 sm:h-14`, which silently grew to 56px on desktop and
 * left every adjacent 40px button floating out of alignment.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, size = 'lg', ...props }, ref) => (
    <input ref={ref} className={cn(controlClasses(size), className)} {...props} />
  ),
);
Input.displayName = 'Input';
