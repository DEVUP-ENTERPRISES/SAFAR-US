'use client';

import Link from 'next/link';
import { User } from 'lucide-react';
import { StatusPill } from '@/components/ui/rows';
import type { HostTrip } from '../trips.api';
import { NextHandoverStep } from './handover-timeline';

const time = (d: string) =>
  new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/**
 * The timing line is the point of this card: a host scanning their day needs to
 * know *what happens next with this car*, not the booking status enum.
 */
// How a finished booking ended, in the host's words.
const ENDED: Record<string, string> = {
  expired: 'Expired',
  declined: 'Declined',
  cancelled: 'Cancelled',
  cancelled_system: 'Cancelled',
  cancelled_guest: 'Cancelled by guest',
  cancelled_host: 'Cancelled by you',
};

// Only these still have a handover ahead of them.
const ACTIVE = ['confirmed', 'paid', 'in_progress'];

function timing(t: HostTrip): { tone: 'start' | 'end' | 'done' | 'live' | 'complete' | 'off' | 'warn'; label: string } {
  const now = Date.now();
  const start = +new Date(t.period.start);
  const end = +new Date(t.period.end);
  const day = (d: string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  if (t.status === 'completed') return { tone: 'complete', label: `Completed · ${day(t.period.end)}` };
  if (ENDED[t.status]) return { tone: 'off', label: ENDED[t.status] };
  if (t.status === 'disputed') return { tone: 'end', label: 'Disputed' };
  if (t.status === 'pending_approval') return { tone: 'warn', label: 'Request · accept or decline' };
  if (t.status === 'pending_verification') return { tone: 'warn', label: 'Waiting for guest ID' };
  if (t.status === 'pending_payment') return { tone: 'warn', label: 'Waiting for payment' };
  if (t.status !== 'in_progress' && start <= now) return { tone: 'end', label: 'Pickup time passed' };
  if (t.status === 'in_progress') {
    return end - now < 24 * 3600_000
      ? { tone: 'end', label: `Ending at ${time(t.period.end)}` }
      : { tone: 'live', label: 'On a trip' };
  }
  if (start > now && start - now < 24 * 3600_000) {
    return { tone: 'start', label: `Starting at ${time(t.period.start)}` };
  }
  return { tone: 'live', label: `Starts ${new Date(t.period.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` };
}

export function TripCard({ trip }: { trip: HostTrip }) {
  const t = timing(trip);

  return (
    <Link href={`/host/trips/${trip.bookingId}`} className="group block">
      <article className="flex gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
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
          {trip.delivery?.mode === 'airport' && trip.delivery.flightNumber && (
            <p className="mt-1 text-[13px] font-medium text-primary">
              ✈ {trip.delivery.flightNumber}
              {trip.delivery.terminal ? ` · Terminal ${trip.delivery.terminal}` : ''}
              {trip.delivery.arrivesAt
                ? ` · lands ${new Date(trip.delivery.arrivesAt).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}`
                : ''}
            </p>
          )}

          {ACTIVE.includes(trip.status) && <NextHandoverStep timeline={trip.timeline} />}

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
          <div className="h-16 w-20 overflow-hidden rounded-[8px] bg-muted shadow-sm">
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
