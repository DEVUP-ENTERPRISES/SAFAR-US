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
  const d = vehicle.listing.delivery;
  const hasDelivery = d && (d.airport || d.home || d.hotel || d.business);

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

          {/* Top-left chips */}
          <div className="absolute start-3 top-3 flex flex-wrap gap-1.5">
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
        <div className="flex flex-col gap-3 p-4">

          {/* Make / model + rating */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="display truncate font-bold text-foreground transition-colors group-hover:text-primary">
                {vehicle.make} {vehicle.model}
              </h3>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                <span>{vehicle.year}</span>
                <span aria-hidden className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                <span className="truncate">{vehicle.location.city || '-'}</span>
              </p>
            </div>
            <VehicleRating
              vehicle={vehicle}
              className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[12px] font-semibold leading-none"
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
          <div className="flex items-baseline gap-1 border-t border-border/50 pt-3">
            <DailyPrice
              amount={vehicle.pricing.dailyPrice}
              currency={vehicle.pricing.currency}
              className="numeric text-xl font-bold text-foreground"
            />
            <span className="text-sm text-muted-foreground">/ day</span>
          </div>

        </div>
      </article>
    </Link>
  );
}
