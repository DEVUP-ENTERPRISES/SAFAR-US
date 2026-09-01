/**
 * The shared surface for every text-entry control.
 *
 * Input, Textarea and Select had drifted into three different looks — the
 * Input was a tall soft-filled pill while textareas and selects were small
 * sharp white boxes, so a single form showed two visual languages. They all
 * read from here now, which is the only way that stays fixed.
 */
import { cn } from '@/lib/utils/cn';

/** Control heights, shared with Button so a control and its button line up. */
export const CONTROL_HEIGHTS = {
  sm: 'h-9', // 36 — dense admin filter rows
  md: 'h-10', // 40 — compact forms
  lg: 'h-12', // 48 — default
  xl: 'h-14', // 56 — hero search only
} as const;

export type ControlSize = keyof typeof CONTROL_HEIGHTS;

/** Horizontal padding tracks height, or tall controls look under-padded. */
export const CONTROL_PADDING: Record<ControlSize, string> = {
  sm: 'px-3 text-sm',
  md: 'px-3.5 text-sm',
  lg: 'px-4 text-base',
  xl: 'px-5 text-base',
};

/** Border, fill, focus ring — everything except size. */
export const CONTROL_SURFACE = cn(
  'w-full rounded-xl border border-input/60 bg-muted/30 font-medium shadow-sm transition-all',
  'placeholder:text-muted-foreground/70',
  'focus-visible:outline-none focus-visible:border-primary/50 focus-visible:bg-background',
  'focus-visible:ring-[4px] focus-visible:ring-primary/10',
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/50',
);

export function controlClasses(size: ControlSize = 'lg') {
  return cn(CONTROL_SURFACE, CONTROL_HEIGHTS[size], CONTROL_PADDING[size]);
}
