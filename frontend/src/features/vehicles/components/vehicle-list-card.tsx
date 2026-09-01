'use client';

import Link from 'next/link';
import { Star, Award, MapPin, CalendarDays, Zap } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatMoney } from '@/lib/utils/format';
import { WishlistButton } from '@/features/favorites/wishlist-button';
import type { Vehicle } from '../types';

/**
 * Horizontal result card — photo left, details right, price bottom-right —
 * matching the list layout of the reference marketplace. Used beside the map.
 * When trip dates are set it shows the base total for those days; otherwise the
 * nightly rate. All figures are the car's real price data.
 */
export function VehicleListCard({
  vehicle,
  days,
  dateLabel,
  className,
}: {
  vehicle: Vehicle;
  days?: number;
  dateLabel?: string | null;
  className?: string;
}) {
  const cover = vehicle.photos?.find((p) => p.isCover)?.url ?? vehicle.photos?.[0]?.url;
  const unlimited = !vehicle.mileageLimit?.perDayKm;
  const total = days ? vehicle.pricing.dailyPrice * days + (vehicle.pricing.cleaningFee ?? 0) : null;

  return (
    <Link
      href={`/vehicles/${vehicle._id}`}
      className={cn('group block overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-lg', className)}
    >
      <div className="flex flex-col sm:flex-row">
        {/* Photo */}
        <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-muted sm:aspect-auto sm:w-[44%]">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt={`${vehicle.make} ${vehicle.model}`} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="flex h-full min-h-[160px] w-full items-center justify-center brand-gradient text-5xl font-black text-white/80">
              {vehicle.make.slice(0, 1)}{vehicle.model.slice(0, 1)}
            </div>
          )}
          {unlimited && (
            <span className="absolute start-3 top-3 rounded-md bg-background/90 px-2 py-1 text-[11px] font-bold text-foreground shadow-sm backdrop-blur">
              Unlimited miles
            </span>
          )}
          <div className="absolute end-2 top-2 rounded-full bg-black/25 backdrop-blur-md">
            <WishlistButton vehicleId={vehicle._id} />
          </div>
        </div>

        {/* Details */}
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight">{vehicle.make} {vehicle.model}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
              <span>{vehicle.year}</span>
              {vehicle.ratingCount > 0 && (
                <>
                  <span>·</span>
                  <span className="font-medium text-foreground">{vehicle.ratingAvg.toFixed(1)}</span>
                  <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                  <span>({vehicle.ratingCount})</span>
                </>
              )}
              {vehicle.hostIsSuperhost && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 font-medium text-foreground">
                    <Award className="h-3.5 w-3.5 text-amber-500" /> Superhost
                  </span>
                </>
              )}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /> {vehicle.location.city || '—'}
            </p>
            {dateLabel && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" /> {dateLabel}
              </p>
            )}
            {vehicle.listing.instantBook && (
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                <Zap className="h-3 w-3 fill-current" /> Instant Book
              </span>
            )}
          </div>

          <div className="text-end">
            {total != null ? (
              <>
                <p className="font-bold">
                  {formatMoney({ amount: total, currency: vehicle.pricing.currency })} <span className="font-semibold">total</span>
                </p>
                <p className="text-xs text-muted-foreground">Before taxes</p>
              </>
            ) : (
              <p className="font-bold">
                {formatMoney({ amount: vehicle.pricing.dailyPrice, currency: vehicle.pricing.currency })}
                <span className="font-medium text-muted-foreground"> / day</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
