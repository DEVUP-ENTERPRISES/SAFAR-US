import Link from 'next/link';
import { Users, Settings2, Zap, Award } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { WishlistButton } from '@/features/favorites/wishlist-button';
import { CompareButton } from './compare-button';
import type { Vehicle } from '../types';
import { VehicleRating, FleetBadge } from './vehicle-rating';
import { DailyPrice } from '@/features/subscriptions/member-ui';

/**
 * Vehicle card - matches the Turo/reference aesthetic:
 * photo dominates the top, clean make/model + year + city below,
 * spec chips inline, price bottom-left. No heavy borders or shadow
 * clutter - the photo and the price do all the work.
 */
export function VehicleCard({ vehicle, className }: { vehicle: Vehicle; className?: string }) {
  const cover = vehicle.photos?.find((p) => p.isCover)?.url ?? vehicle.photos?.[0]?.url;
  // Delivery is offered only to named, priced spots.
  const hasDelivery = (vehicle.listing.deliveryLocations ?? []).some((l) => l.enabled);

  return (
    <Link href={`/vehicles/${vehicle._id}`} className={cn('group block', className)}>
      <article className="relative flex flex-col overflow-hidden rounded-2xl bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/10">

        {/* ── Photo ─────────────────────────────────────────────────── */}
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-muted">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={`${vehicle.make} ${vehicle.model}`}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/70 to-primary/30">
              <span className="text-6xl font-black text-white/80">
                {vehicle.make[0]}{vehicle.model[0]}
              </span>
            </div>
          )}

          {/* Top-left chips: stop short of the action buttons so they wrap instead of hiding underneath. */}
          <div className="absolute start-2.5 end-12 top-2.5 flex flex-wrap gap-1.5 sm:start-3 sm:top-3">
            {vehicle.fleetOwned && (
              <FleetBadge className="bg-black/50 border-white/15 text-white text-[10px] backdrop-blur-md" />
            )}
            {vehicle.hostIsSuperhost && (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/50 border border-white/15 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md">
                <Award className="h-3 w-3 text-amber-400" /> Superhost
              </span>
            )}
            {vehicle.listing.instantBook && (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/50 border border-white/15 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md">
                <Zap className="h-3 w-3 fill-current" /> Instant
              </span>
            )}
          </div>

          {/* Top-right actions */}
          <div className="absolute end-2.5 top-2.5 flex flex-col gap-1.5">
            <div className="rounded-full bg-black/30 backdrop-blur-md border border-white/10 hover:bg-black/50 transition-colors">
              <WishlistButton vehicleId={vehicle._id} />
            </div>
            <div className="rounded-full bg-black/30 backdrop-blur-md border border-white/10 hover:bg-black/50 transition-colors">
              <CompareButton vehicleId={vehicle._id} />
            </div>
          </div>
        </div>

        {/* ── Details ───────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2.5 p-3 sm:gap-3 sm:p-4">

          {/* Make / model + rating: stacked on a narrow card so the name is never cut to "Chevr…". */}
          <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:justify-between sm:gap-2">
            <div className="min-w-0 max-w-full">
              <h3 className="display line-clamp-2 text-sm font-bold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-base">
                {vehicle.make} {vehicle.model}
              </h3>
              <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground sm:text-sm">
                <span className="shrink-0">{vehicle.year}</span>
                <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
                <span className="truncate">{vehicle.location.city || '-'}</span>
              </p>
            </div>
            <VehicleRating
              vehicle={vehicle}
              className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold leading-none sm:text-[12px]"
            />
          </div>

          {/* Spec chips */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/60 px-2 py-0.5">
              <Users className="h-3 w-3" /> {vehicle.seats}
            </span>
            <span className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/60 px-2 py-0.5 capitalize">
              <Settings2 className="h-3 w-3" /> {vehicle.transmission}
            </span>
            {vehicle.fuelType === 'ev' && (
              <span className="flex items-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                <Zap className="h-3 w-3" /> EV
              </span>
            )}
            {hasDelivery && (
              <span className="flex items-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                Delivery
              </span>
            )}
          </div>

          {/* Price */}
          <div className="flex items-baseline gap-1 border-t border-border/50 pt-2.5 sm:pt-3">
            <DailyPrice
              amount={vehicle.pricing.dailyPrice}
              currency={vehicle.pricing.currency}
              className="numeric text-lg font-bold text-foreground sm:text-xl"
            />
            <span className="text-sm text-muted-foreground">/ day</span>
          </div>

        </div>
      </article>
    </Link>
  );
}
