'use client';

import Link from 'next/link';
import { User } from 'lucide-react';
import { StatusPill } from '@/components/ui/rows';
import type { HostTrip } from '../trips.api';
import { NextHandoverStep } from './handover-timeline';
import { TRIP_ACTIVE, flightLine, tripTiming } from '../trip-timing';

export function TripCard({ trip }: { trip: HostTrip }) {
  const t = tripTiming(trip);
  const flight = flightLine(trip);

  return (
    <Link href={`/ops/trips/${trip.bookingId}`} className="group block">
      <article className="flex gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40">
        <div className="min-w-0 flex-1">
          <StatusPill tone={t.tone}>{t.label}</StatusPill>

          <h3 className="mt-3 truncate text-[22px] font-black tracking-tight leading-none transition-colors group-hover:text-primary">
            {trip.vehicle.make} {trip.vehicle.model} {trip.vehicle.year || ''}
          </h3>

          {trip.pickupAddress && (
            <p className="mt-1.5 truncate text-[15px] font-medium text-foreground/80">{trip.pickupAddress}</p>
          )}

          {/* An airport handover is only as good as the flight info - this is
              what tells the host when to actually leave for the terminal. */}
          {flight && <p className="mt-1 text-[13px] font-medium text-primary">{flight}</p>}

          {TRIP_ACTIVE.includes(trip.status) && <NextHandoverStep timeline={trip.timeline} />}

          <div className="mt-3 flex items-center gap-2">
            {trip.guest.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={trip.guest.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
            ) : (
              <span className="grid h-7 w-7 place-items-center rounded-full bg-muted text-muted-foreground">
                <User className="h-4 w-4" />
              </span>
            )}
            <span className="truncate text-[15px] font-semibold text-foreground/90">
              {trip.guest.name} <span className="font-medium text-muted-foreground/70">#{trip.code}</span>
            </span>
          </div>
        </div>

        {/* Vehicle thumb + plate */}
        <div className="shrink-0 text-center">
          <div className="h-16 w-20 overflow-hidden rounded-sm bg-muted">
            {trip.vehicle.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={trip.vehicle.photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center brand-gradient text-sm font-bold text-white/70">
                {trip.vehicle.make.slice(0, 1)}
                {trip.vehicle.model.slice(0, 1)}
              </div>
            )}
          </div>
          {trip.vehicle.plate && (
            <p className="mt-1 font-mono text-xs text-muted-foreground">{trip.vehicle.plate}</p>
          )}
        </div>
      </article>
    </Link>
  );
}
