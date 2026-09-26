'use client';

import { useEffect, useState } from 'react';
import { Sun, Heart, Route, Sparkles, Mountain, Compass, Palmtree, type LucideIcon } from 'lucide-react';
import { usePlatformConfig } from '@/features/platform/config';
import { cn } from '@/lib/utils/cn';

const ICONS: LucideIcon[] = [Sun, Heart, Route, Sparkles, Mountain, Compass, Palmtree];
const ROTATE_MS = 4500;

/** Lines that keep people dreaming about the next trip; one at a time, on a loop above the calendar. Text comes from admin. */
export function TripQuotes({ className }: { className?: string }) {
  const { data } = usePlatformConfig();
  const quotes = data?.content?.bookingQuotes ?? [];
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (quotes.length < 2 || paused) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI((n) => (n + 1) % quotes.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [quotes.length, paused]);

  if (quotes.length === 0) return null;
  const idx = i % quotes.length;
  const Icon = ICONS[idx % ICONS.length];

  return (
    <div
      className={cn('relative mt-3 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/15 via-primary/5 to-amber-400/10 px-4 py-3.5', className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-live="polite"
    >
      <span aria-hidden className="pointer-events-none absolute -end-2 -top-4 select-none text-7xl font-black leading-none text-primary/10">”</span>
      <div key={idx} className="flex items-start gap-3 animate-slide-up">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <p className="min-h-[2.75rem] pe-6 text-[15px] font-semibold leading-snug text-foreground">{quotes[idx]}</p>
      </div>
      {quotes.length > 1 && (
        <div className="mt-2.5 flex items-center justify-center gap-1.5" role="tablist" aria-label="Messages">
          {quotes.map((_, n) => (
            <button
              key={n}
              type="button"
              role="tab"
              aria-selected={n === idx}
              aria-label={`Message ${n + 1}`}
              onClick={() => setI(n)}
              className={cn('h-1.5 rounded-full transition-all', n === idx ? 'w-5 bg-primary' : 'w-1.5 bg-primary/30 hover:bg-primary/50')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
