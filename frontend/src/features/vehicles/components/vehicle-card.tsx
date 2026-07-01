import Link from 'next/link';
import { Users, Zap, Settings2, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Rating } from '@/components/ui/rating';
import { formatMoney } from '@/lib/utils/format';
import { WishlistButton } from '@/features/favorites/wishlist-button';
import type { Vehicle } from '../types';

export function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const cover = vehicle.photos?.find((p) => p.isCover)?.url ?? vehicle.photos?.[0]?.url;
  const hasDelivery =
    vehicle.listing.delivery &&
    (vehicle.listing.delivery.airport ||
      vehicle.listing.delivery.home ||
      vehicle.listing.delivery.hotel ||
      vehicle.listing.delivery.business);

  return (
    <Link href={`/vehicles/${vehicle._id}`} className="group block">
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
        <div className="relative aspect-[4/3] overflow-hidden">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={`${vehicle.make} ${vehicle.model}`}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center brand-gradient">
              <span className="text-4xl font-bold text-white/80">
                {vehicle.make.slice(0, 1)}
                {vehicle.model.slice(0, 1)}
              </span>
            </div>
          )}
          <div className="absolute right-3 top-3">
            <WishlistButton vehicleId={vehicle._id} />
          </div>
          <div className="absolute left-3 top-3 flex gap-1.5">
            {vehicle.listing.instantBook && <Badge tone="success">⚡ Instant</Badge>}
            {vehicle.fuelType === 'ev' && <Badge>EV</Badge>}
          </div>
        </div>

        <div className="space-y-2.5 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-semibold leading-tight group-hover:text-primary">
                {vehicle.make} {vehicle.model}
              </h3>
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3 w-3" /> {vehicle.location.city || '—'} · {vehicle.year}
              </p>
            </div>
            <Rating value={vehicle.ratingAvg} count={vehicle.ratingCount} />
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> {vehicle.seats}
            </span>
            <span className="flex items-center gap-1 capitalize">
              <Settings2 className="h-3.5 w-3.5" /> {vehicle.transmission}
            </span>
            {vehicle.fuelType === 'ev' && (
              <span className="flex items-center gap-1 text-primary">
                <Zap className="h-3.5 w-3.5" /> Electric
              </span>
            )}
            {hasDelivery && <span className="text-primary">· Delivery</span>}
          </div>

          <div className="flex items-baseline gap-1 pt-1">
            <span className="text-lg font-bold">
              {formatMoney({ amount: vehicle.pricing.dailyPrice, currency: vehicle.pricing.currency })}
            </span>
            <span className="text-sm text-muted-foreground">/ day</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
