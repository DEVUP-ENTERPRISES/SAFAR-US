'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/utils/format';
import { vehicleApi } from '@/features/vehicles/api';
import type { Vehicle } from '@/features/vehicles/types';

/**
 * "Similar cars for your dates" — the nearby substitutes a guest weighs against
 * this one, exactly like the strip on the reference marketplace. Real listings
 * from the API (same metro, same category first); when trip dates are set, the
 * server only returns cars actually free for them and each price shows the base
 * total for that many days rather than a nightly rate.
 */
export function SimilarCars({
  vehicleId,
  start,
  end,
  days,
}: {
  vehicleId: string;
  start?: string;
  end?: string;
  days?: number;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const hasDates = !!(start && end && days && days > 0);

  const { data, isLoading } = useQuery({
    queryKey: ['similar', vehicleId, start, end],
    queryFn: () => vehicleApi.similar(vehicleId, hasDates ? start : undefined, hasDates ? end : undefined, 8),
    enabled: !!vehicleId,
  });

  const scroll = (dir: -1 | 1) =>
    scroller.current?.scrollBy({ left: dir * (scroller.current.clientWidth * 0.8), behavior: 'smooth' });

  if (isLoading) {
    return (
      <div className="flex gap-5 overflow-hidden">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-72 w-[300px] shrink-0 rounded-2xl" />)}
      </div>
    );
  }
  if (!data || data.length === 0) return null;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">
          {hasDates ? 'Similar cars for your dates' : 'Similar cars nearby'}
        </h2>
        <div className="hidden gap-2 sm:flex">
          <button onClick={() => scroll(-1)} aria-label="Previous" className="rounded-full border border-border p-2 transition-colors hover:bg-accent">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button onClick={() => scroll(1)} aria-label="Next" className="rounded-full border border-border p-2 transition-colors hover:bg-accent">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div ref={scroller} className="hide-scrollbar -mx-1 flex snap-x snap-mandatory gap-5 overflow-x-auto px-1 pb-2">
        {data.map((car) => (
          <SimilarCard key={car._id} car={car} days={hasDates ? days : undefined} />
        ))}
      </div>
    </section>
  );
}

function SimilarCard({ car, days }: { car: Vehicle; days?: number }) {
  const cover = car.photos?.find((p) => p.isCover) ?? car.photos?.[0];
  const total = days ? car.pricing.dailyPrice * days + (car.pricing.cleaningFee ?? 0) : null;

  return (
    <Link href={`/vehicles/${car._id}`} className="group w-[280px] shrink-0 snap-start sm:w-[300px]">
      <div className="aspect-[16/11] overflow-hidden rounded-2xl bg-muted">
        {cover?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.url} alt={`${car.make} ${car.model}`} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center brand-gradient text-5xl font-black text-white/80">
            {car.make.slice(0, 1)}{car.model.slice(0, 1)}
          </div>
        )}
      </div>
      <div className="mt-3">
        <p className="text-lg font-bold leading-tight">{car.make} {car.model}</p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <span>{car.year}</span>
          {car.ratingCount > 0 ? (
            <>
              <span>·</span>
              <span className="font-medium text-foreground">{car.ratingAvg.toFixed(2)}</span>
              <Star className="h-3.5 w-3.5 fill-primary text-primary" />
              <span>({car.ratingCount})</span>
            </>
          ) : (
            <><span>·</span><span>New</span></>
          )}
        </p>
        <p className="mt-2 font-bold">
          {total != null ? (
            <>{formatMoney({ amount: total, currency: car.pricing.currency })} total</>
          ) : (
            <>{formatMoney({ amount: car.pricing.dailyPrice, currency: car.pricing.currency })} <span className="font-medium text-muted-foreground">/ day</span></>
          )}
        </p>
      </div>
    </Link>
  );
}
