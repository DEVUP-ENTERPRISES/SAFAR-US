import Link from 'next/link';
import { Zap, Award } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { WishlistButton } from '@/features/favorites/wishlist-button';
import { CompareButton } from './compare-button';
import type { Vehicle } from '../types';
import { VehicleRating, FleetBadge } from './vehicle-rating';
import { DailyPrice } from '@/features/subscriptions/member-ui';

export function VehicleCard({ vehicle, className }: { vehicle: Vehicle; className?: string }) {
  const cover = vehicle.photos?.find((p) => p.isCover)?.url ?? vehicle.photos?.[0]?.url;
  const d = vehicle.listing.delivery;
  const hasDelivery = d && (d.airport || d.home || d.hotel || d.business);

  return (
    <Link href={`/vehicles/${vehicle._id}`} className={cn("group block", className)}>
      <article className="relative flex h-full flex-col overflow-hidden rounded-lg border border-border/70 bg-card transition-colors hover:border-primary/40">
        {/* Image Wrapper */}
        <div className="photo-scrim relative aspect-[5/4] w-full overflow-hidden bg-muted">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={`${vehicle.make} ${vehicle.model}`}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/80 via-primary to-primary/40 relative overflow-hidden">
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff1a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff1a_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>
              <span className="relative z-10 text-7xl font-black text-white/90 mix-blend-overlay tracking-tighter drop-shadow-md">
                {vehicle.make.slice(0, 1)}
                {vehicle.model.slice(0, 1)}
              </span>
            </div>
          )}

          <div className="absolute end-2 top-2 z-20">
            <WishlistButton vehicleId={vehicle._id} className="h-8 w-8 [&_svg]:h-4 [&_svg]:w-4" />
          </div>
        </div>

        <div className="relative z-20 flex flex-1 flex-col gap-2 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="display min-w-0 truncate text-base font-bold leading-snug text-foreground transition-colors group-hover:text-primary">
              {vehicle.make} {vehicle.model}
            </h3>
            <VehicleRating vehicle={vehicle} className="mt-0.5 shrink-0 text-xs leading-none" />
          </div>
          <p className="truncate text-label text-muted-foreground">
            {[vehicle.year, vehicle.location.city, `${vehicle.seats} seats`, vehicle.transmission && vehicle.transmission.charAt(0).toUpperCase() + vehicle.transmission.slice(1)].filter(Boolean).join(' · ')}
          </p>
          {(vehicle.fleetOwned || vehicle.hostIsSuperhost || vehicle.listing.instantBook || hasDelivery || vehicle.fuelType === 'ev') && (
            <div className="flex flex-wrap gap-1.5">
              {vehicle.fleetOwned && <FleetBadge className="px-2 py-0.5" />}
              {vehicle.hostIsSuperhost && (
                <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
                  <Award className="h-3.5 w-3.5" /> Superhost
                </span>
              )}
              {vehicle.listing.instantBook && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                  <Zap className="h-3.5 w-3.5 fill-current text-primary" /> Instant
                </span>
              )}
              {vehicle.fuelType === 'ev' && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                  <Zap className="h-3.5 w-3.5 text-primary" /> Electric
                </span>
              )}
              {hasDelivery && (
                <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">Delivery</span>
              )}
            </div>
          )}
          <div className="mt-auto flex items-center gap-2 border-t border-border/60 pt-3">
            <div className="flex min-w-0 flex-1 items-baseline gap-1">
              <DailyPrice amount={vehicle.pricing.dailyPrice} currency={vehicle.pricing.currency} className="numeric text-xl font-bold text-foreground" />
              <span className="text-label text-muted-foreground">/ day</span>
            </div>
            <CompareButton vehicleId={vehicle._id} />
          </div>
        </div>
      </article>
    </Link>
  );
}
