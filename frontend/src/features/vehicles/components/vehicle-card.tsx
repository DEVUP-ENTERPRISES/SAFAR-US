import Link from 'next/link';
import { Users, Settings2, Zap, Award } from 'lucide-react';
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

        {/* Body */}
        <div className="relative z-20 flex flex-1 flex-col px-3 pb-4 pt-3 sm:px-4 sm:pb-5">
          {(vehicle.fleetOwned || vehicle.hostIsSuperhost || vehicle.listing.instantBook) && (
            <div className="mb-2 flex flex-wrap gap-1.5">
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
            </div>
          )}
          {/* Name and tag share a line at every width; the name gives way first. */}
          <div className="flex items-start justify-between gap-2 sm:gap-3">
            <div className="min-w-0">
              <h3 className="display line-clamp-2 break-words text-base font-bold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-lg">
                {vehicle.make} {vehicle.model}
              </h3>
              <p className="mt-1 truncate text-sm font-medium text-muted-foreground/80 flex items-center gap-1.5">
                {vehicle.year} 
                <span className="h-1 w-1 rounded-full bg-muted-foreground/40"></span> 
                {vehicle.location.city || '-'}
              </p>
            </div>
            <VehicleRating vehicle={vehicle} className="shrink-0 self-start text-xs leading-none sm:text-label" />
          </div>

          <div className="mt-auto pt-4 space-y-4">
            {/* Spec row */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1 border border-border/30">
                <Users className="h-3.5 w-3.5 text-foreground/60" /> {vehicle.seats}
              </span>
              <span className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1 border border-border/30 capitalize">
                <Settings2 className="h-3.5 w-3.5 text-foreground/60" /> 
                <span className="truncate max-w-[80px] sm:max-w-none">{vehicle.transmission}</span>
              </span>
              {vehicle.fuelType === 'ev' && (
                <span className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 border border-primary/20 text-primary font-semibold">
                  <Zap className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Electric</span>
                  <span className="sm:hidden">EV</span>
                </span>
              )}
              {hasDelivery && (
                <span className="hidden sm:flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 border border-primary/20 text-primary font-semibold">
                   Delivery
                </span>
              )}
            </div>

            {/* Price */}
            <div className="flex items-end gap-1.5 border-t border-border/50 pt-3">
              <div className="flex min-w-0 flex-1 items-end gap-1.5">
              {/* Price is data. Tabular figures keep it from shuffling
                  sideways as digits change across a grid of cards. */}
              <DailyPrice amount={vehicle.pricing.dailyPrice} currency={vehicle.pricing.currency} className="numeric text-2xl font-semibold text-foreground" />
              <span className="text-sm font-medium text-muted-foreground pb-1">/ day</span>
              </div>
              <CompareButton vehicleId={vehicle._id} className="self-center" />
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}
