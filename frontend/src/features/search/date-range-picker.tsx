'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * A two-month range calendar.
 *
 * Native <input type="date"> was rendering "dd-mm-yyyy" with an OS picker that
 * looks different in every browser and cannot be styled at all. Worse for a
 * rental: two separate date fields make the user hold the range in their head,
 * so picking a return before the pickup is possible and only caught on submit.
 *
 * One calendar, two clicks, and an invalid range is unreachable rather than
 * rejected — the second click always lands after the first because clicking
 * earlier simply restarts the range.
 */

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  return { pad: first.getDay(), days, label: first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
}

export function DateRangePicker({
  from,
  to,
  onChange,
  /**
   * One month instead of two.
   *
   * The two-month layout is 34rem wide, which is fine in the search bar's
   * popover and 8rem wider than the 400px booking panel it also has to live
   * in. Rather than let it overflow there, the caller says which it has room
   * for.
   */
  compact = false,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  compact?: boolean;
}) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [offset, setOffset] = useState(0);
  // While picking, `anchor` is the first click and the range is provisional.
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const base = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const months = [0, 1].map((i) => {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    return { y: d.getFullYear(), m: d.getMonth(), ...monthGrid(d.getFullYear(), d.getMonth()) };
  });

  const provisional = anchor && hover ? [anchor, hover].sort() : null;
  const lo = provisional ? provisional[0] : from;
  const hi = provisional ? provisional[1] : to;

  const pick = (key: string) => {
    if (!anchor) { setAnchor(key); return; }
    const [a, b] = [anchor, key].sort();
    // Two clicks on the same day would be a zero-night trip.
    if (a === b) { setAnchor(key); return; }
    onChange(a, b);
    setAnchor(null);
    setHover(null);
  };

  return (
    <div className={cn('w-full', compact ? 'max-w-full' : 'sm:w-[34rem]')}>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOffset((o) => Math.max(0, o - 1))}
          disabled={offset === 0}
          aria-label="Previous month"
          className="grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-muted disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setOffset((o) => Math.min(11, o + 1))}
          aria-label="Next month"
          className="grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-muted"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className={cn('grid gap-6', !compact && 'sm:grid-cols-2')}>
        {months.map((mo, mi) => (
          // The second month is hidden on small screens rather than squeezed —
          // a cramped calendar is worse than one month at a time.
          <div key={mi} className={cn(mi === 1 && (compact ? 'hidden' : 'hidden sm:block'))}>
            <p className="mb-2 text-center text-sm font-semibold">{mo.label}</p>
            <div className="grid grid-cols-7 gap-y-1">
              {DOW.map((d, i) => (
                <div key={i} className="pb-1 text-center text-[10px] font-bold uppercase text-muted-foreground">
                  {d}
                </div>
              ))}
              {Array.from({ length: mo.pad }).map((_, i) => <div key={`p${i}`} />)}
              {Array.from({ length: mo.days }).map((_, i) => {
                const date = new Date(mo.y, mo.m, i + 1);
                const key = iso(date);
                const past = date < today;
                const isStart = key === lo;
                const isEnd = key === hi;
                const inside = !!lo && !!hi && key > lo && key < hi;

                return (
                  <button
                    key={key}
                    type="button"
                    disabled={past}
                    onClick={() => pick(key)}
                    onMouseEnter={() => anchor && setHover(key)}
                    className={cn(
                      'relative h-9 text-sm transition-colors',
                      past && 'cursor-not-allowed text-muted-foreground/30',
                      // The band is drawn on the cell, not the circle, so a
                      // selected range reads as one continuous run.
                      inside && 'bg-primary/10',
                      isStart && !!hi && 'rounded-s-full bg-primary/10',
                      isEnd && !!lo && 'rounded-e-full bg-primary/10',
                      !past && !inside && !isStart && !isEnd && 'hover:bg-muted rounded-full',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute inset-0 m-auto grid h-9 w-9 place-items-center rounded-full',
                        (isStart || isEnd) && 'bg-primary font-bold text-primary-foreground',
                      )}
                    >
                      {i + 1}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 border-t border-border pt-2.5 text-xs text-muted-foreground">
        {anchor ? 'Now pick your return day' : from && to ? `${nights(from, to)} nights selected` : 'Pick your pick-up day'}
      </p>
    </div>
  );
}

function nights(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000));
}
