'use client';

import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useFacets } from '@/features/vehicles/hooks';
import { formatMoney } from '@/lib/utils/format';

/**
 * Browse by style.
 *
 * Presentation is a fixed, curated set of styles — the section is always the
 * same complete shape, so a young catalogue with cars in only one or two styles
 * reads as "a collection that is filling up" rather than one lonely card in a
 * field of white. A style with live supply is vibrant and clickable and shows
 * its real count and starting price; a style with none yet is an elegant
 * "Coming soon" tile, so a guest is never sent to an empty result set. As hosts
 * list more cars, tiles light up on their own.
 */
const STYLES: { key: string; label: string; image: string; description: string }[] = [
  { key: 'economy', label: 'Economy', image: '/categories/economy.png', description: 'Everyday value' },
  { key: 'suv', label: 'SUVs', image: '/categories/suv.png', description: 'Room for everyone' },
  { key: 'luxury', label: 'Luxury', image: '/categories/luxury.png', description: 'Arrive in style' },
  { key: 'ev', label: 'Electric', image: '/categories/electric.png', description: 'Zero emissions' },
  { key: 'sports', label: 'Sports', image: '/categories/sports.png', description: 'Thrill & performance' },
  { key: 'van', label: 'Vans', image: '/categories/van.png', description: 'Group adventures' },
];

export function CategoryCarousel({ city }: { city: string }) {
  const facets = useFacets(city || undefined);
  const live = facets.data?.categories ?? [];
  const currency = facets.data?.currency ?? 'USD';
  const supply = new Map(live.map((c) => [c.category, c]));

  // Available styles lead, so the vibrant tiles are seen first; the rest follow
  // as "coming soon". A stable order within each group keeps the grid calm.
  const tiles = [...STYLES]
    .map((s) => ({ ...s, cat: supply.get(s.key) }))
    .sort((a, b) => (b.cat?.vehicles ?? 0) - (a.cat?.vehicles ?? 0));

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5">
      {tiles.map((t, i) => {
        const available = !!t.cat && t.cat.vehicles > 0;
        const inner = (
          <>
            <div className="absolute inset-0 bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={t.image}
                alt={t.label}
                className={cn(
                  'h-full w-full object-cover transition-transform duration-[1200ms] ease-out',
                  available ? 'group-hover:scale-110' : 'scale-105 opacity-50 grayscale',
                )}
              />
            </div>

            {/* Legibility scrim. */}
            <div
              className={cn(
                'absolute inset-0 transition-opacity duration-500',
                available
                  ? 'bg-gradient-to-t from-black/90 via-black/25 to-transparent opacity-85 group-hover:opacity-95'
                  : 'bg-gradient-to-t from-black/80 via-black/40 to-black/20',
              )}
            />
            <div className="absolute inset-0 rounded-[1.6rem] ring-1 ring-inset ring-white/10 transition-all duration-500 group-hover:ring-white/25" />

            {/* A light sheen sweeps across an available tile on hover. */}
            {available && (
              <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-[900ms] ease-out group-hover:translate-x-full" />
            )}

            {available ? (
              <div className="relative z-10 flex translate-y-1.5 flex-col gap-0.5 p-5 transition-transform duration-500 group-hover:translate-y-0 sm:p-6">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-primary-soft opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                  <Sparkles className="h-3 w-3" /> Explore
                </span>
                <h3 className="display text-2xl leading-tight text-white">{t.label}</h3>
                <p className="text-sm font-medium text-white/70">{t.description}</p>
                <p className="numeric mt-1 text-xs font-semibold text-white/60">
                  {t.cat!.vehicles} car{t.cat!.vehicles === 1 ? '' : 's'}
                  {t.cat!.fromPrice > 0 && ` · from ${formatMoney({ amount: t.cat!.fromPrice, currency })}/day`}
                </p>
              </div>
            ) : (
              <div className="relative z-10 flex flex-col gap-0.5 p-5 sm:p-6">
                <span className="inline-flex w-fit items-center rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white/90 backdrop-blur-sm">
                  Coming soon
                </span>
                <h3 className="display mt-2 text-2xl leading-tight text-white/85">{t.label}</h3>
                <p className="text-sm font-medium text-white/55">{t.description}</p>
              </div>
            )}
          </>
        );

        const shell =
          'group animate-slide-up relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-[1.6rem] shadow-float transition-all duration-500';
        const style = { animationDelay: `${i * 80}ms`, animationFillMode: 'backwards' as const };

        return available ? (
          <Link
            key={t.key}
            href={`/search?city=${encodeURIComponent(city)}&category=${t.key}`}
            style={style}
            className={cn(shell, 'hover:-translate-y-1.5 hover:shadow-2xl')}
          >
            {inner}
          </Link>
        ) : (
          <div key={t.key} style={style} className={cn(shell, 'cursor-default')} aria-label={`${t.label} — coming soon`}>
            {inner}
          </div>
        );
      })}

      {/* Become-a-host nudge, sized like a tile so the grid stays even and the
          empty styles turn into a reason to list rather than a dead end. */}
      <Link
        href="/host"
        style={{ animationDelay: `${tiles.length * 80}ms`, animationFillMode: 'backwards' }}
        className="group animate-slide-up relative flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-[1.6rem] border-2 border-dashed border-border bg-card/40 p-5 text-center transition-all duration-500 hover:border-primary/50 hover:bg-card"
      >
        <span className="grid h-11 w-11 place-items-center rounded-full bg-primary/10 text-primary transition-transform duration-500 group-hover:scale-110">
          <ArrowRight className="h-5 w-5" />
        </span>
        <p className="font-bold leading-tight">List your car</p>
        <p className="text-xs text-muted-foreground">Fill a style and start earning</p>
      </Link>
    </div>
  );
}
