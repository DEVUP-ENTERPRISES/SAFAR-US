'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * The row-list language used across the host app (Turo-style): an UPPERCASE
 * section label, then divider-separated rows with a right-aligned action —
 * either a CAPS text link, a chevron, or a value.
 *
 * These exist so every host screen is laid out from the same vocabulary
 * instead of each page inventing its own.
 */

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('px-1 pb-2 pt-6 text-xs font-semibold uppercase tracking-widest text-muted-foreground', className)}>
      {children}
    </p>
  );
}

/** A group of rows with hairline dividers, on a card surface. */
export function RowGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-border bg-card', className)}>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

/**
 * One row. Provide `action` (a CAPS link), `value` (right-aligned text), or
 * `href`/`onClick` (adds a chevron).
 */
export function Row({
  icon,
  title,
  subtitle,
  value,
  action,
  href,
  onClick,
  danger,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  action?: { label: string; onClick?: () => void; href?: string; disabled?: boolean };
  href?: string;
  onClick?: () => void;
  danger?: boolean;
  className?: string;
}) {
  const clickable = !!href || !!onClick;

  const inner = (
    <div
      className={cn(
        'flex items-center gap-4 px-4 py-4 transition-colors',
        clickable && 'cursor-pointer hover:bg-accent/50',
        className,
      )}
    >
      {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}

      <div className="min-w-0 flex-1">
        <p className={cn('font-medium leading-snug', danger && 'text-destructive')}>{title}</p>
        {subtitle && <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{subtitle}</p>}
      </div>

      {value != null && <span className="shrink-0 text-end font-semibold tabular-nums">{value}</span>}

      {action &&
        (action.href ? (
          <Link
            href={action.href}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 text-xs font-bold uppercase tracking-wide text-primary hover:underline"
          >
            {action.label}
          </Link>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              action.onClick?.();
            }}
            disabled={action.disabled}
            className={cn(
              'shrink-0 text-xs font-bold uppercase tracking-wide text-primary hover:underline',
              action.disabled && 'cursor-not-allowed text-muted-foreground no-underline hover:no-underline',
            )}
          >
            {action.label}
          </button>
        ))}

      {clickable && !action && <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />}
    </div>
  );

  if (href) return <Link href={href}>{inner}</Link>;
  if (onClick) return <div onClick={onClick}>{inner}</div>;
  return inner;
}

/**
 * The sticky bottom action sheet — Turo's signature "Start check-in" / "End
 * trip" panel. Always reachable, so the next action is never hunted for.
 *
 * Collapsible all the way down: the whole panel slides away and leaves one slim
 * bar with its title, so it never sits over the page like a wall. Open, it is
 * capped to the screen and scrolls inside itself, so a tall form still fits on
 * a phone and the page underneath stays reachable.
 */
export function ActionSheet({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="sticky bottom-0 z-30 -mx-4 mt-8 border-t border-border bg-card/95 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.5)] backdrop-blur sm:-mx-6 sm:px-6">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Collapse' : `Expand ${title}`}
        className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 py-3 text-muted-foreground hover:text-foreground"
      >
        <span className={cn('text-sm font-bold', open ? 'text-muted-foreground' : 'text-foreground')}>
          {open ? 'Hide' : title}
        </span>
        <ChevronDown className={cn('h-5 w-5 transition-transform duration-300', !open && 'rotate-180')} />
      </button>
      <div
        className={cn('grid transition-[grid-template-rows] duration-300 ease-out', open ? 'visible' : 'invisible')}
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mx-auto max-h-[calc(100dvh-9rem)] max-w-2xl overflow-y-auto overscroll-contain pb-4 text-center">
            <h2 className="display text-2xl">{title}</h2>
            {description && <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>}
            <div className="mt-5 flex flex-col gap-2 text-left">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Trip timing pill: green = starting, red = ending, muted = ended. */
export function StatusPill({ tone, children }: { tone: 'start' | 'end' | 'done' | 'live'; children: ReactNode }) {
  const tones: Record<string, string> = {
    start: 'bg-success/15 text-success dark:bg-success/20 dark:text-emerald-400',
    end: 'bg-destructive/15 text-destructive dark:bg-[#451a1a] dark:text-[#ff6b6b]',
    live: 'bg-primary/15 text-primary',
    done: 'text-muted-foreground',
  };
  return (
    <span className={cn('inline-flex rounded-[6px] px-2.5 py-1 text-[13px] font-bold tracking-wide', tones[tone])}>
      {children}
    </span>
  );
}

/** Segmented tabs (BOOKED | HISTORY | CALENDAR). */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string }[];
  value: T;
  onChange: (t: T) => void;
}) {
  return (
    <div className="flex border-b border-border">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'relative flex-1 px-4 py-3.5 text-[12px] font-bold uppercase tracking-[0.1em] transition-colors',
            value === t.key ? 'text-primary' : 'text-muted-foreground/60 hover:text-foreground',
          )}
        >
          {t.label}
          {value === t.key && (
            <span className="absolute inset-x-0 bottom-0 h-[3px] bg-primary" />
          )}
        </button>
      ))}
    </div>
  );
}
