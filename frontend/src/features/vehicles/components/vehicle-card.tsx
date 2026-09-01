import Link from 'next/link';
import { Users, Settings2, Zap, Award, Star } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatMoney } from '@/lib/utils/format';
import { WishlistButton } from '@/features/favorites/wishlist-button';
import { CompareButton } from './compare-button';
import type { Vehicle } from '../types';

export function VehicleCard({ vehicle, className }: { vehicle: Vehicle; className?: string }) {
  const cover = vehicle.photos?.find((p) => p.isCover)?.url ?? vehicle.photos?.[0]?.url;
  const d = vehicle.listing.delivery;
  const hasDelivery = d && (d.airport || d.home || d.hotel || d.business);

  return (
    <Link href={`/vehicles/${vehicle._id}`} className={cn("group block", className)}>
      <article className="relative flex flex-col h-full overflow-hidden rounded-2xl sm:rounded-[2rem] border border-white/10 bg-card/60 backdrop-blur-2xl p-2 sm:p-2.5 shadow-xl transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl hover:shadow-primary/20 hover:border-primary/30 group-hover:bg-card/80">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 pointer-events-none z-10" />
        
        {/* Image Wrapper */}
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl sm:rounded-[1.5rem] bg-muted shadow-inner">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={`${vehicle.make} ${vehicle.model}`}
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
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

          {/* Elegant Scrim */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-60 transition-opacity duration-500 group-hover:opacity-80" />

          {/* Actions */}
          <div className="absolute end-3 top-3 flex flex-col gap-2 scale-90 sm:scale-100 origin-top-right z-20">
            <div className="rounded-full bg-black/20 backdrop-blur-md shadow-sm border border-white/10 transition-transform hover:scale-110 hover:bg-black/40">
              <WishlistButton vehicleId={vehicle._id} />
            </div>
            <div className="rounded-full bg-black/20 backdrop-blur-md shadow-sm border border-white/10 transition-transform hover:scale-110 hover:bg-black/40">
              <CompareButton vehicleId={vehicle._id} />
            </div>
          </div>

          {/* Status chips */}
          <div className="absolute start-3 top-3 flex flex-wrap gap-2 max-w-[70%] z-20">
            {vehicle.hostIsSuperhost && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/40 border border-white/20 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-white backdrop-blur-md shadow-sm">
                <Award className="h-3.5 w-3.5 text-yellow-400" /> Superhost
              </span>
            )}
            {vehicle.listing.instantBook && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 border border-white/20 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-white backdrop-blur-md shadow-sm">
                <Zap className="h-3.5 w-3.5 fill-current" /> Instant
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        {/* Body */}
        <div className="relative z-20 flex flex-col flex-1 px-2 py-4 sm:px-4 sm:py-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-3">
            <div className="min-w-0">
              <h3 className="display truncate text-base sm:text-lg font-bold text-foreground transition-colors group-hover:text-primary">
                {vehicle.make} {vehicle.model}
              </h3>
              <p className="mt-1 truncate text-sm font-medium text-muted-foreground/80 flex items-center gap-1.5">
                {vehicle.year} 
                <span className="h-1 w-1 rounded-full bg-muted-foreground/40"></span> 
                {vehicle.location.city || '—'}
              </p>
            </div>
            {vehicle.ratingCount > 0 && (
              <div className="flex shrink-0 items-center rounded-full bg-foreground/5 px-2.5 py-1 text-[13px] font-semibold leading-none text-foreground backdrop-blur-sm border border-border/50">
                <Star className="h-3.5 w-3.5 fill-primary text-primary -mt-[1px]" />
                <span className="numeric ms-1.5">{vehicle.ratingAvg.toFixed(1)}</span>
                <span className="text-muted-foreground/70 font-medium ms-1">({vehicle.ratingCount})</span>
              </div>
            )}
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
              {/* Price is data. Tabular figures keep it from shuffling
                  sideways as digits change across a grid of cards. */}
              <span className="numeric text-2xl font-semibold text-foreground">
                {formatMoney({ amount: vehicle.pricing.dailyPrice, currency: vehicle.pricing.currency })}
              </span>
              <span className="text-sm font-medium text-muted-foreground pb-1">/ day</span>
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}
