'use client';

import { useEffect, useState } from 'react';
import { Car, MapPin, KeyRound, PlaneTakeoff } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * The branded "loading ride" — a car driving down a moving road with cycling
 * status copy, for the moments a wait is real (navigation, search, checkout).
 *
 * It ROTATES: each time one mounts it advances to the next variant (a different
 * icon + a different set of lines), so a second search doesn't look like the
 * first. A curated set, so it stays on-brand rather than random.
 */
const VARIANTS = [
  { icon: Car, lines: ['Finding cars near you…', 'Checking live availability…', 'Almost there…'] },
  { icon: MapPin, lines: ['Mapping your route…', 'Plotting the fastest way…', 'One moment…'] },
  { icon: KeyRound, lines: ['Warming up the engine…', 'Getting your keys ready…', 'Nearly set…'] },
  { icon: PlaneTakeoff, lines: ['Lining up your ride…', 'Prepping curbside delivery…', 'Hang tight…'] },
] as const;

let rotation = 0; // advances across mounts: one time A, next time B, …

export function TripLoader({
  label,
  overlay,
  className,
}: {
  label?: string;
  overlay?: boolean;
  className?: string;
}) {
  const [variant] = useState(() => VARIANTS[rotation++ % VARIANTS.length]);
  const [i, setI] = useState(0);
  const Icon = variant.icon;

  useEffect(() => {
    if (label) return;
    const t = setInterval(() => setI((n) => (n + 1) % variant.lines.length), 1400);
    return () => clearInterval(t);
  }, [label, variant]);

  const scene = (
    <div className={cn('flex flex-col items-center gap-7 py-14', className)}>
      {/* The scene: a car driving toward a horizon, road rushing under it. */}
      <div className="relative h-28 w-72 overflow-hidden rounded-2xl">
        {/* Depth: a soft brand glow low on the horizon. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-primary/15 to-transparent" />

        {/* The car, bobbing, with a headlight glow ahead and a soft shadow. */}
        <div className="absolute left-1/2 top-7 -translate-x-1/2 animate-drive">
          <div className="pointer-events-none absolute -right-6 top-1/2 h-6 w-16 -translate-y-1/2 rounded-full bg-amber-200/40 blur-md" />
          <Icon className="relative h-14 w-14 text-primary drop-shadow-[0_10px_18px_rgba(0,0,0,0.25)]" />
        </div>
        <div className="pointer-events-none absolute left-1/2 top-[4.6rem] h-3 w-16 -translate-x-1/2 rounded-[100%] bg-black/25 blur-md" />

        {/* The road, rushing past. */}
        <div className="absolute inset-x-6 bottom-5 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="absolute inset-0 animate-road opacity-70"
            style={{
              backgroundImage: 'repeating-linear-gradient(90deg, hsl(var(--primary)) 0 16px, transparent 16px 32px)',
              backgroundSize: '32px 100%',
            }}
          />
        </div>
        {/* Speed streaks either side. */}
        <div className="absolute left-2 top-1/2 h-px w-8 animate-road bg-gradient-to-r from-transparent via-foreground/20 to-transparent" style={{ animationDuration: '0.5s' }} />
        <div className="absolute right-2 top-[38%] h-px w-6 animate-road bg-gradient-to-r from-transparent via-foreground/15 to-transparent" style={{ animationDuration: '0.45s' }} />
      </div>

      <div className="text-center">
        <p key={label ?? i} className="animate-fade-in text-[15px] font-bold text-foreground">
          {label ?? variant.lines[i]}
        </p>
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {[0, 1, 2].map((d) => (
            <span
              key={d}
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/70"
              style={{ animationDelay: `${d * 180}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );

  if (!overlay) return scene;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-background/85 backdrop-blur-md">
      <div className="animate-scale-in rounded-[1.75rem] border border-border bg-card px-4 shadow-2xl shadow-black/20">{scene}</div>
    </div>
  );
}
