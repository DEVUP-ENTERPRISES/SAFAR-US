'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { DateRangePicker } from '@/features/search/date-range-picker';

/**
 * Trip start and end on the booking panel.
 *
 * These were two `<input type="datetime-local">`, which the OS draws — so the
 * most important control in the product rendered as "dd-mm-yyyy --:--" in a
 * system widget that looks different in every browser and cannot be styled at
 * all. The search bar was rebuilt off native controls for exactly this reason;
 * the panel that actually takes the money was missed.
 *
 * Two separate fields also make the guest hold the range in their head, so
 * picking a return before the pickup is possible and only caught on submit.
 * One calendar makes that unreachable rather than rejected.
 */

const TIMES = ['08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '16:00', '18:00', '20:00'];

/** `YYYY-MM-DDTHH:mm` — split and rejoined without touching the timezone. */
const dateOf = (v: string) => (v ? v.slice(0, 10) : '');
const timeOf = (v: string) => (v && v.length >= 16 ? v.slice(11, 16) : '10:00');
const join = (d: string, t: string) => (d ? `${d}T${t}` : '');

export function TripDatesField({
  start,
  end,
  onChange,
}: {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const fmt = (v: string) =>
    v
      ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : 'Add date';

  const setDates = (from: string, to: string) =>
    onChange(join(from, timeOf(start)), join(to, timeOf(end)));

  return (
    <div ref={wrap} className="relative">
      <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
        {(['start', 'end'] as const).map((which) => {
          const v = which === 'start' ? start : end;
          return (
            <button
              key={which}
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className={cn(
                'p-3 text-start transition-colors hover:bg-muted/50',
                open && 'bg-muted/50',
              )}
            >
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Trip {which}
              </span>
              <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {fmt(v)}
                {v && <span className="numeric text-muted-foreground">{timeOf(v)}</span>}
              </span>
            </button>
          );
        })}
      </div>

      {open && (
        // Anchored to the panel rather than the field, so it cannot spill off
        // the side of a phone. The panel itself is only 400px on desktop.
        <div className="absolute inset-x-0 top-full z-40 mt-2 rounded-2xl border border-border bg-card p-4 shadow-2xl">
          <DateRangePicker compact from={dateOf(start)} to={dateOf(end)} onChange={setDates} />

          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-3">
            <TimeField
              label="Pick-up"
              value={timeOf(start)}
              onChange={(t) => onChange(join(dateOf(start), t), end)}
            />
            <TimeField
              label="Return"
              value={timeOf(end)}
              onChange={(t) => onChange(start, join(dateOf(end), t))}
            />
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-4 w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110 active:scale-[0.98]"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {TIMES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={cn(
              'numeric rounded-lg px-2 py-1 text-xs font-medium transition-colors',
              value === t ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70',
            )}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
