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
 * rejected - the second click always lands after the first because clicking
 * earlier simply restarts the range.
 */

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
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
  compact = false,
  earliest,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  compact?: boolean;
  earliest?: Date;
}) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [offset, setOffset] = useState(0);
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
    if (a === b) { setAnchor(key); return; }
    onChange(a, b);
    setAnchor(null);
    setHover(null);
  };

  return (
    <div className={cn('w-full select-none', compact ? 'max-w-full' : 'sm:w-[36rem]')}>

      {/* ── Month navigation header ── */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOffset((o) => Math.max(0, o - 1))}
          disabled={offset === 0}
          aria-label="Previous month"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-card transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Month labels sit between the two arrows - one per visible month */}
        <div className={cn('flex flex-1 items-center', !compact && 'sm:gap-0')}>
          {months.map((mo, mi) => (
            <p
              key={mi}
              className={cn(
                'flex-1 text-center text-sm font-bold tracking-tight text-foreground',
                mi === 1 && (compact ? 'hidden' : 'hidden sm:block'),
              )}
            >
              {mo.label}
            </p>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setOffset((o) => Math.min(11, o + 1))}
          aria-label="Next month"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-card transition-colors hover:bg-muted"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* ── Calendar grid(s) ── */}
      <div className={cn('grid gap-6', !compact && 'sm:grid-cols-2')}>
        {months.map((mo, mi) => (
          <div key={mi} className={cn(mi === 1 && (compact ? 'hidden' : 'hidden sm:block'))}>

            {/* Day-of-week headers */}
            <div className="mb-1 grid grid-cols-7">
              {DOW.map((d, i) => (
                <div key={i} className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-y-0.5">
              {Array.from({ length: mo.pad }).map((_, i) => <div key={`p${i}`} />)}
              {Array.from({ length: mo.days }).map((_, i) => {
                const date = new Date(mo.y, mo.m, i + 1);
                const key = iso(date);
                const past = date < today || (!!earliest && date.getTime() + 86_400_000 <= earliest.getTime());
                const isStart = key === lo;
                const isEnd = key === hi;
                const inRange = !!lo && !!hi && key > lo && key < hi;
                const isToday = iso(date) === iso(today);

                return (
                  <button
                    key={key}
                    type="button"
                    disabled={past}
                    onClick={() => pick(key)}
                    onMouseEnter={() => anchor && setHover(key)}
                    aria-label={date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                    aria-pressed={isStart || isEnd}
                    className={cn(
                      'relative h-10 w-full text-sm transition-colors',
                      past && 'cursor-not-allowed opacity-25',
                      /* range band - drawn on the full cell width */
                      inRange && 'bg-primary/10',
                      isStart && !!hi && 'rounded-s-full bg-primary/10',
                      isEnd && !!lo && 'rounded-e-full bg-primary/10',
                      !past && !inRange && !isStart && !isEnd && 'hover:rounded-full hover:bg-muted',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute inset-0 m-auto grid h-9 w-9 place-items-center rounded-full text-sm font-medium',
                        /* start / end circles */
                        (isStart || isEnd) && 'bg-primary font-bold text-primary-foreground shadow-md shadow-primary/30',
                        /* today indicator when not selected */
                        isToday && !isStart && !isEnd && 'ring-1 ring-primary/50 font-semibold text-primary',
                        /* default day */
                        !isStart && !isEnd && !inRange && !past && 'text-foreground',
                        inRange && !isStart && !isEnd && 'text-foreground/80',
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

      {/* ── Status hint ── */}
      <p className={cn(
        'mt-3 border-t border-border pt-2.5 text-xs font-medium',
        anchor ? 'text-primary' : 'text-muted-foreground',
      )}>
        {anchor
          ? '↩ Now pick your return day'
          : from && to
            ? `${nights(from, to)} night${nights(from, to) === 1 ? '' : 's'} · ${fmt(from)} – ${fmt(to)}`
            : 'Select your pick-up day'}
      </p>
    </div>
  );
}

function nights(a: string, b: string): number {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000));
}

function fmt(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
