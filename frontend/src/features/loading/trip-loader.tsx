'use client';

import { useEffect, useState } from 'react';
import { Car, MapPin, KeyRound, PlaneTakeoff } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * The branded "loading ride" — a little car driving down a moving road with
 * cycling status copy, for the moments a wait is real (search, checkout).
 *
 * It ROTATES: each time one mounts it picks the next variant in sequence (a
 * different icon + a different set of lines), so a second search doesn't look
 * like the first. That's the "different every time" — kept as a small, curated
 * set so it stays on-brand rather than random.
 */
const VARIANTS = [
  { icon: Car, lines: ['Finding cars near you…', 'Checking live availability…', 'Almost there…'] },
  { icon: MapPin, lines: ['Mapping your route…', 'Plotting the fastest way…', 'One moment…'] },
  { icon: KeyRound, lines: ['Warming up the engine…', 'Getting your keys ready…', 'Nearly set…'] },
  { icon: PlaneTakeoff, lines: ['Lining up your ride…', 'Prepping curbside delivery…', 'Hang tight…'] },
] as const;

// Module-level so it advances across mounts: one time A, next time B, …
let rotation = 0;

export function TripLoader({
  label,
  overlay,
  className,
}: {
  /** Force a specific first line; otherwise the variant's lines cycle. */
  label?: string;
  /** Full-screen scrim (for a blocking action like confirming a booking). */
  overlay?: boolean;
  className?: string;
}) {
  const [variant] = useState(() => VARIANTS[rotation++ % VARIANTS.length]);
  const [i, setI] = useState(0);
  const Icon = variant.icon;

  useEffect(() => {
    if (label) return;
    const t = setInterval(() => setI((n) => (n + 1) % variant.lines.length), 1300);
    return () => clearInterval(t);
  }, [label, variant]);

  const scene = (
    <div className={cn('flex flex-col items-center gap-5 py-12 text-center', className)}>
      <div className="relative h-14 w-48">
        <Icon className="absolute left-1/2 top-0 h-9 w-9 -translate-x-1/2 animate-drive text-primary" />
        {/* The road, rushing past. */}
        <div className="absolute inset-x-0 bottom-1 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="absolute inset-0 animate-road opacity-60"
            style={{
              backgroundImage: 'repeating-linear-gradient(90deg, hsl(var(--primary)) 0 14px, transparent 14px 28px)',
              backgroundSize: '28px 100%',
            }}
          />
        </div>
        {/* soft glow trailing the car */}
        <div className="pointer-events-none absolute left-1/2 top-1 h-8 w-8 -translate-x-1/2 rounded-full bg-primary/20 blur-xl" />
      </div>
      <p key={label ?? i} className="animate-fade-in text-sm font-semibold text-foreground">
        {label ?? variant.lines[i]}
      </p>
    </div>
  );

  if (!overlay) return scene;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-background/80 backdrop-blur-sm">
      <div className="animate-scale-in rounded-3xl border border-border bg-card px-6 shadow-2xl">{scene}</div>
    </div>
  );
}
