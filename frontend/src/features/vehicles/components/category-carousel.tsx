'use client';

import { useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useFacets } from '@/features/vehicles/hooks';
import { formatMoney } from '@/lib/utils/format';

/**
 * Presentation only — artwork and copy per category. Which categories actually
 * render, and in what order, comes from live supply in the selected city, so a
 * guest is never sent to an empty result set.
 */
const LOOK: Record<string, { label: string; image: string; description: string }> = {
  suv: { label: 'SUVs', image: '/categories/suv.png', description: 'Room for everyone' },
  luxury: { label: 'Luxury', image: '/categories/luxury.png', description: 'Arrive in style' },
  ev: { label: 'Electric', image: '/categories/electric.png', description: 'Zero emissions' },
  economy: { label: 'Economy', image: '/categories/economy.png', description: 'Everyday value' },
  van: { label: 'Vans', image: '/categories/van.png', description: 'Group adventures' },
  sports: { label: 'Sports', image: '/categories/sports.png', description: 'Thrill & performance' },
};

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function CategoryCarousel({ city }: { city: string }) {
  const facets = useFacets(city || undefined);
  const categories = facets.data?.categories ?? [];
  const currency = facets.data?.currency ?? 'USD';
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(Math.ceil(scrollLeft) + clientWidth < scrollWidth);
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [categories.length]);

  const scrollByAmount = (amount: number) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  return (
    <div className="relative group/carousel -mx-4 px-4 sm:mx-0 sm:px-0">
      {/* Scroll Left Button */}
      <button
        onClick={() => scrollByAmount(-300)}
        className={cn(
          "absolute left-4 top-1/2 z-10 -translate-y-1/2 hidden h-12 w-12 items-center justify-center rounded-full bg-background/80 text-foreground shadow-lg backdrop-blur transition-all hover:scale-105 hover:bg-background sm:flex opacity-0 group-hover/carousel:opacity-100",
          !canScrollLeft && "hidden sm:hidden"
        )}
        aria-label="Scroll left"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>

      {/* Scroll Container */}
      <div 
        ref={scrollRef}
        onScroll={checkScroll}
        className="hide-scrollbar flex gap-5 overflow-x-auto snap-x snap-mandatory pb-6 pt-2"
      >
        {categories.map((cat) => {
          const look = LOOK[cat.category] ?? {
            label: titleCase(cat.category),
            image: '/categories/economy.png',
            description: 'Available now',
          };
          const c = { key: cat.category, ...look };
          return (
          <Link
            key={c.key}
            href={`/search?city=${encodeURIComponent(city)}&category=${c.key}`}
            className="group relative flex h-[340px] w-[240px] sm:w-[280px] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-[2rem] border-0 shadow-float transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl"
          >
            {/* Background Image with Parallax-like scale */}
            <div className="absolute inset-0 bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={c.image} 
                alt={c.label} 
                className="h-full w-full object-cover transition-transform duration-1000 group-hover:scale-110" 
              />
            </div>
            
            {/* Advanced Gradients for Text Legibility */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80 transition-opacity duration-500 group-hover:opacity-90" />
            
            {/* Inner Premium Ring */}
            <div className="absolute inset-0 rounded-[2rem] ring-1 ring-inset ring-white/10 group-hover:ring-white/20 transition-all duration-500" />
            
            {/* Content */}
            <div className="relative z-10 p-6 sm:p-8 flex flex-col gap-1 transform transition-transform duration-500 translate-y-2 group-hover:translate-y-0">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-primary-soft opacity-0 transition-opacity duration-500 group-hover:opacity-100">
                <Sparkles className="h-3 w-3" /> Explore
              </span>
              <h3 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{c.label}</h3>
              <p className="text-sm font-medium text-white/70">{c.description}</p>
              <p className="mt-1 text-xs font-semibold text-white/60">
                {cat.vehicles} car{cat.vehicles === 1 ? '' : 's'}
                {cat.fromPrice > 0 && ` · from ${formatMoney({ amount: cat.fromPrice, currency })}/day`}
              </p>
            </div>
          </Link>
          );
        })}
      </div>

      {/* Scroll Right Button */}
      <button
        onClick={() => scrollByAmount(300)}
        className={cn(
          "absolute right-4 top-1/2 z-10 -translate-y-1/2 hidden h-12 w-12 items-center justify-center rounded-full bg-background/80 text-foreground shadow-lg backdrop-blur transition-all hover:scale-105 hover:bg-background sm:flex opacity-0 group-hover/carousel:opacity-100",
          !canScrollRight && "hidden sm:hidden"
        )}
        aria-label="Scroll right"
      >
        <ChevronRight className="h-6 w-6" />
      </button>
    </div>
  );
}
