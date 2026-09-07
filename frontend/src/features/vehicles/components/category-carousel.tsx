'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Sparkles, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useFacets } from '@/features/vehicles/hooks';
import { formatMoney } from '@/lib/utils/format';

/**
 * Browse by style — a horizontal carousel of compact style tiles.
 *
 * A fixed, curated set of styles so the row is always a complete shape rather
 * than one lonely card in white space. A style with live supply is vibrant,
 * clickable, and shows its real count and starting price; a style with none yet
 * is an elegant "Coming soon" tile (never a link to an empty result); a "List
 * your car" tile closes the row and turns thin supply into a reason to host.
 * Tiles light up on their own as hosts list cars.
 */
const STYLES: { key: string; label: string; image: string; description: string }[] = [
  { key: 'economy', label: 'Economy', image: '/categories/economy.webp', description: 'Everyday value' },
  { key: 'suv', label: 'SUVs', image: '/categories/suv.webp', description: 'Room for everyone' },
  { key: 'luxury', label: 'Luxury', image: '/categories/luxury.webp', description: 'Arrive in style' },
  { key: 'ev', label: 'Electric', image: '/categories/electric.webp', description: 'Zero emissions' },
  { key: 'sports', label: 'Sports', image: '/categories/sports.webp', description: 'Thrill & speed' },
  { key: 'van', label: 'Vans', image: '/categories/van.webp', description: 'Group trips' },
];

export function CategoryCarousel({ city }: { city: string }) {
  const facets = useFacets(city || undefined);
  const live = facets.data?.categories ?? [];
  const currency = facets.data?.currency ?? 'USD';
  const supply = new Map(live.map((c) => [c.category, c]));

  const tiles = [...STYLES]
    .map((s) => ({ ...s, cat: supply.get(s.key) }))
    .sort((a, b) => (b.cat?.vehicles ?? 0) - (a.cat?.vehicles ?? 0));

  const scrollRef = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(false);
  const [right, setRight] = useState(true);

  const check = () => {
    const el = scrollRef.current;
    if (!el) return;
    setLeft(el.scrollLeft > 4);
    setRight(Math.ceil(el.scrollLeft) + el.clientWidth < el.scrollWidth - 4);
  };
  useEffect(() => {
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [tiles.length]);
  const nudge = (d: number) => scrollRef.current?.scrollBy({ left: d, behavior: 'smooth' });

  const arrow = (dir: 'l' | 'r', on: boolean) => (
    <button
      onClick={() => nudge(dir === 'l' ? -260 : 260)}
      aria-label={dir === 'l' ? 'Scroll left' : 'Scroll right'}
      className={cn(
        'absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-background/90 text-foreground shadow-lg backdrop-blur transition-all hover:scale-105 sm:grid',
        dir === 'l' ? 'start-1' : 'end-1',
        on ? 'opacity-0 group-hover/car:opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      {dir === 'l' ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
    </button>
  );

  return (
    <div className="group/car relative -mx-4 px-4 sm:mx-0 sm:px-0">
      {arrow('l', left)}
      <div
        ref={scrollRef}
        onScroll={check}
        className="hide-scrollbar flex snap-x snap-mandatory gap-3.5 overflow-x-auto pb-2 sm:gap-4"
      >
        {tiles.map((t, i) => {
          const available = !!t.cat && t.cat.vehicles > 0;
          const inner = (
            <>
              <div className="absolute inset-0 bg-muted">
                <Image
                  src={t.image}
                  alt={t.label}
                  fill
                  sizes="180px"
                  className={cn(
                    'object-cover transition-transform duration-[1200ms] ease-out',
                    available ? 'group-hover:scale-110' : 'scale-105 opacity-50 grayscale',
                  )}
                />
              </div>
              <div
                className={cn(
                  'absolute inset-0 transition-opacity duration-500',
                  available
                    ? 'bg-gradient-to-t from-black/90 via-black/25 to-transparent opacity-85 group-hover:opacity-95'
                    : 'bg-gradient-to-t from-black/80 via-black/40 to-black/20',
                )}
              />
              <div className="absolute inset-0 rounded-[1.4rem] ring-1 ring-inset ring-white/10 transition-all duration-500 group-hover:ring-white/25" />
              {available && (
                <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-[900ms] ease-out group-hover:translate-x-full" />
              )}

              {available ? (
                <div className="relative z-10 flex translate-y-1 flex-col gap-0.5 p-4 transition-transform duration-500 group-hover:translate-y-0">
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-primary-soft opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                    <Sparkles className="h-2.5 w-2.5" /> Explore
                  </span>
                  <h3 className="display text-lg leading-tight text-white">{t.label}</h3>
                  <p className="text-[11px] font-medium text-white/65">{t.description}</p>
                  <p className="numeric mt-0.5 text-[10px] font-semibold text-white/60">
                    {t.cat!.vehicles} car{t.cat!.vehicles === 1 ? '' : 's'}
                    {t.cat!.fromPrice > 0 && ` · from ${formatMoney({ amount: t.cat!.fromPrice, currency })}`}
                  </p>
                </div>
              ) : (
                <div className="relative z-10 flex flex-col gap-0.5 p-4">
                  <span className="inline-flex w-fit items-center rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white/90 backdrop-blur-sm">
                    Coming soon
                  </span>
                  <h3 className="display mt-1.5 text-lg leading-tight text-white/85">{t.label}</h3>
                  <p className="text-[11px] font-medium text-white/55">{t.description}</p>
                </div>
              )}
            </>
          );

          const shell =
            'group animate-slide-up relative flex h-[220px] w-[150px] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-[1.4rem] shadow-lift transition-all duration-500 sm:w-[165px]';
          const style = { animationDelay: `${i * 70}ms`, animationFillMode: 'backwards' as const };

          return available ? (
            <Link
              key={t.key}
              href={`/search?city=${encodeURIComponent(city)}&category=${t.key}`}
              style={style}
              className={cn(shell, 'hover:-translate-y-1 hover:shadow-2xl')}
            >
              {inner}
            </Link>
          ) : (
            <div key={t.key} style={style} className={cn(shell, 'cursor-default')} aria-label={`${t.label} — coming soon`}>
              {inner}
            </div>
          );
        })}

        {/* Host nudge closes the row. */}
        <Link
          href="/host"
          style={{ animationDelay: `${tiles.length * 70}ms`, animationFillMode: 'backwards' }}
          className="group animate-slide-up flex h-[220px] w-[150px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-[1.4rem] border-2 border-dashed border-border bg-card/40 p-4 text-center transition-all duration-500 hover:border-primary/50 hover:bg-card sm:w-[165px]"
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary transition-transform duration-500 group-hover:scale-110">
            <ArrowRight className="h-4 w-4" />
          </span>
          <p className="text-sm font-bold leading-tight">List your car</p>
          <p className="text-[11px] text-muted-foreground">Fill a style, start earning</p>
        </Link>
      </div>
      {arrow('r', right)}
    </div>
  );
}
