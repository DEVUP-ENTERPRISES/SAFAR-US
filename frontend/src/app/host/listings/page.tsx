'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Star, LayoutGrid, List, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { formatMoney } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { useMyVehicles } from '@/features/vehicles/hooks';
import { hostTripsApi } from '@/features/host/trips.api';

type TripStatus = '' | 'on_trip' | 'available';

const short = (d: string) =>
  new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export default function HostListingsPage() {
  const vehicles = useMyVehicles(true);
  const booked = useQuery({ queryKey: ['host-trips', 'booked'], queryFn: () => hostTripsApi.booked() });

  const [q, setQ] = useState('');
  const [tripStatus, setTripStatus] = useState<TripStatus>('');
  const [listingStatus, setListingStatus] = useState('');
  const [grid, setGrid] = useState(true);

  /** Which cars are out on a trip right now, and until when. */
  const onTrip = useMemo(() => {
    const map = new Map<string, { start: string; end: string }>();
    const now = Date.now();
    for (const t of booked.data ?? []) {
      if (+new Date(t.period.start) <= now && now <= +new Date(t.period.end)) {
        map.set(t.vehicle._id, t.period);
      }
    }
    return map;
  }, [booked.data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (vehicles.data ?? []).filter((v) => {
      if (needle) {
        const hay = `${v.make} ${v.model} ${v.registrationNumber ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (tripStatus === 'on_trip' && !onTrip.has(v._id)) return false;
      if (tripStatus === 'available' && onTrip.has(v._id)) return false;
      if (listingStatus && v.status !== listingStatus) return false;
      return true;
    });
  }, [vehicles.data, q, tripStatus, listingStatus, onTrip]);

  if (vehicles.isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Host"
        title="Vehicles"
        actions={
          <Link href="/host/listings/new">
            <Button><Plus className="h-4 w-4" /> Add vehicle</Button>
          </Link>
        }
      />

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Make, model, plate #"
          className="ps-9"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={tripStatus}
          onChange={(e) => setTripStatus(e.target.value as TripStatus)}
          className="h-9 rounded-full border border-input bg-card px-3 text-sm font-medium"
        >
          <option value="">Trip status</option>
          <option value="on_trip">On a trip</option>
          <option value="available">Available</option>
        </select>
        <select
          value={listingStatus}
          onChange={(e) => setListingStatus(e.target.value)}
          className="h-9 rounded-full border border-input bg-card px-3 text-sm font-medium"
        >
          <option value="">Listing status</option>
          <option value="listed">Listed</option>
          <option value="unlisted">Unlisted</option>
          <option value="draft">Draft</option>
        </select>

        <div className="ms-auto flex items-center gap-2">
          <span className="text-sm font-semibold">
            {filtered.length} listing{filtered.length === 1 ? '' : 's'}
          </span>
          <button
            onClick={() => setGrid((g) => !g)}
            className="rounded-lg border border-border p-1.5 transition-colors hover:bg-accent"
            aria-label={grid ? 'Switch to list view' : 'Switch to grid view'}
          >
            {grid ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Car className="h-10 w-10" />}
          title={vehicles.data?.length ? 'No vehicles match' : 'No vehicles yet'}
          description={
            vehicles.data?.length
              ? 'Try clearing the search or filters.'
              : 'List your first car to start earning.'
          }
          action={
            !vehicles.data?.length ? (
              <Link href="/host/listings/new">
                <Button><Plus className="h-4 w-4" /> Add vehicle</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className={cn(grid ? 'grid gap-5 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-3')}>
          {filtered.map((v) => {
            const trip = onTrip.get(v._id);
            return (
              <Link key={v._id} href={`/host/listings/${v._id}`} className="group block">
                <article
                  className={cn(
                    'overflow-hidden rounded-2xl border border-border bg-card transition-all hover:border-primary/40 hover:shadow-card',
                    !grid && 'flex gap-4 p-3',
                  )}
                >
                  <div
                    className={cn(
                      'relative overflow-hidden bg-muted',
                      grid ? 'aspect-[16/10]' : 'h-20 w-28 shrink-0 rounded-xl',
                    )}
                  >
                    {v.photos?.[0]?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.photos[0].url}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center brand-gradient text-2xl font-black text-white/70">
                        {v.make.slice(0, 1)}{v.model.slice(0, 1)}
                      </div>
                    )}
                    {grid && (
                      <span
                        className={cn(
                          'absolute start-3 top-3 rounded-md px-2 py-1 text-[11px] font-bold uppercase',
                          v.status === 'listed'
                            ? 'bg-success text-success-foreground'
                            : 'bg-foreground/80 text-background',
                        )}
                      >
                        {v.status}
                      </span>
                    )}
                  </div>

                  <div className={cn('min-w-0 flex-1', grid && 'p-4')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate font-bold leading-snug transition-colors group-hover:text-primary">
                          {v.make} {v.model} {v.year}
                        </h3>
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">
                          <span className="capitalize">{v.category}</span>
                          {v.registrationNumber && (
                            <> · <span className="font-mono">{v.registrationNumber}</span></>
                          )}
                        </p>
                      </div>
                      {v.ratingCount > 0 && (
                        <span className="flex shrink-0 items-center gap-1 text-sm font-medium">
                          <Star className="h-3.5 w-3.5 fill-foreground text-foreground" />
                          {v.ratingAvg.toFixed(1)}
                          <span className="text-muted-foreground">({v.totalTrips})</span>
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      {trip ? (
                        <span className="truncate text-sm font-medium text-primary">
                          On a trip: {short(trip.start)} – {short(trip.end)}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Available</span>
                      )}
                      <span className="shrink-0 text-sm font-semibold">
                        {formatMoney({ amount: v.pricing.dailyPrice, currency: v.pricing.currency })}/day
                      </span>
                    </div>
                  </div>
                </article>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
