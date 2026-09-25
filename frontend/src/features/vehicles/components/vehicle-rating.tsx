import { Star, ShieldCheck, Zap, Truck, CalendarCheck, Award } from 'lucide-react';
import type { Vehicle } from '../types';
import { cn } from '@/lib/utils/cn';

type RatingFields = Pick<Vehicle, 'ratingAvg' | 'ratingCount'> & { externalRating?: { source: string; rating: number; trips: number } };

/** CatoDrive's own rating once a car has real reviews here; otherwise a rating earned elsewhere with its source named; otherwise "New". */
export function VehicleRating({ vehicle, className }: { vehicle: RatingFields; className?: string }) {
  const own = vehicle.ratingCount > 0;
  const ext = !own ? vehicle.externalRating : undefined;
  if (!own && !ext) {
    return <span className={cn('inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-[12px] font-semibold text-primary', className)}>New on CatoDrive</span>;
  }
  const avg = own ? vehicle.ratingAvg : ext!.rating;
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-semibold', className)}>
      <Star className="h-3.5 w-3.5 fill-primary text-primary" />
      <span className="numeric">{avg.toFixed(1)}</span>
      <span className="font-medium text-muted-foreground">
        {own ? `(${vehicle.ratingCount})` : `on ${ext!.source}${ext!.trips > 0 ? ` · ${ext!.trips} trips` : ''}`}
      </span>
    </span>
  );
}

export function FleetBadge({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-primary', className)}>
      <ShieldCheck className="h-3.5 w-3.5" /> CatoDrive Fleet
    </span>
  );
}

/** Badges that are true because of how the car is actually set up; nothing here is invented. */
export function VehicleBadges({ vehicle }: { vehicle: Vehicle }) {
  const d = vehicle.listing.delivery;
  const items: { key: string; icon: typeof Zap; label: string }[] = [];
  if (vehicle.fleetOwned) items.push({ key: 'fleet', icon: ShieldCheck, label: 'Owned & inspected by CatoDrive' });
  if (vehicle.hostIsSuperhost) items.push({ key: 'super', icon: Award, label: 'Superhost' });
  if (vehicle.listing.instantBook) items.push({ key: 'instant', icon: Zap, label: 'Instant Book' });
  if (vehicle.listing.cancellationPolicy === 'flexible') items.push({ key: 'cancel', icon: CalendarCheck, label: 'Flexible cancellation' });
  if (d && (d.airport || d.home || d.hotel || d.business)) items.push({ key: 'delivery', icon: Truck, label: 'Delivery available' });
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(({ key, icon: Icon, label }) => (
        <span key={key} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-[13px] font-medium">
          <Icon className="h-4 w-4 text-primary" /> {label}
        </span>
      ))}
    </div>
  );
}
