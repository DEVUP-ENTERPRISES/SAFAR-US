'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * The branded "loading ride" — a short car animation with cycling status copy,
 * shown while a real wait happens (navigation, search, checkout). Route-level
 * loading uses it too, so it greets a navigation before the page renders.
 *
 * The copy ROTATES: each mount advances to the next line set, so a second search
 * doesn't read like the first. A curated set, so it stays on-brand not random.
 */
const LINE_SETS = [
  ['Finding cars near you…', 'Checking live availability…', 'Almost there…'],
  ['Mapping your route…', 'Plotting the fastest way…', 'One moment…'],
  ['Warming up the engine…', 'Getting your keys ready…', 'Nearly set…'],
  ['Lining up your ride…', 'Prepping curbside delivery…', 'Hang tight…'],
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
  const [lines] = useState(() => LINE_SETS[rotation++ % LINE_SETS.length]);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (label) return;
    const t = setInterval(() => setI((n) => (n + 1) % lines.length), 1400);
    return () => clearInterval(t);
  }, [label, lines]);

  const scene = (
    <div className={cn('flex flex-col items-center gap-6 py-12', className)}>
      <video
        src="/animations/car-loading.mp4"
        autoPlay
        muted
        loop
        playsInline
        // Decorative; if it can't play (rare), the copy below still carries it.
        aria-hidden
        className="h-40 w-auto max-w-[80vw] object-contain"
      />
      <div className="text-center">
        <p key={label ?? i} className="animate-fade-in text-[15px] font-bold text-foreground">
          {label ?? lines[i]}
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
      <div className="animate-scale-in rounded-[1.75rem] border border-border bg-card px-6 shadow-2xl shadow-black/20">{scene}</div>
    </div>
  );
}
