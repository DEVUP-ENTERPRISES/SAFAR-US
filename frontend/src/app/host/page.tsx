'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Plus, Car, TrendingUp, Award, ArrowRight, AlertTriangle, ImageOff,
  Wallet, ChevronRight, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';
import { formatMoney } from '@/lib/utils/format';
import { hostApi } from '@/features/host/api';
import { useHostMe, useEarnings } from '@/features/host/hooks';
import { useMyVehicles } from '@/features/vehicles/hooks';
import type { Vehicle } from '@/features/vehicles/types';

/**
 * The host dashboard.
 *
 * It previously opened with four large tiles reading $0, $0, 0 and a dash, and
 * listed cars as text-only cards with no photograph. On a car marketplace that
 * is the worst possible first impression: it makes a working product look
 * empty, and it hides the one asset the host actually cares about looking at.
 *
 * The order now follows what a host opens this page to find out:
 *
 *  1. IS ANYTHING WAITING ON ME. Approvals expire, documents lapse, cars come
 *     back. That is the only genuinely urgent content, so it is first — and it
 *     is absent entirely when nothing is wrong, rather than showing an
 *     "all clear" card that trains people to scroll past the position.
 *  2. HOW AM I DOING. Money, shown as one figure with the rest supporting it,
 *     not four equal tiles competing for attention.
 *  3. MY CARS. With photographs, because that is what a car host recognises
 *     their fleet by — not by reading make and model as a list.
 *
 * A host with no history sees a start-here panel instead of a wall of zeros.
 * Nothing is fabricated to fill the space.
 */
export default function HostDashboardPage() {
  const host = useHostMe();
  const earnings = useEarnings();
  const vehicles = useMyVehicles(true);

  const inbox = useQuery({ queryKey: ['host-inbox'], queryFn: () => hostApi.inboxActions(), retry: false });
  const payout = useQuery({ queryKey: ['payout-readiness'], queryFn: () => hostApi.payoutReadiness(), retry: false });

  const cur = earnings.data?.currency ?? 'USD';
  const money = (v: number) => formatMoney({ amount: v, currency: cur });

  const cars = vehicles.data ?? [];
  const actions = inbox.data?.items ?? [];
  const blockers = (payout.data?.blockers ?? []).filter((b) => b.severity === 'blocking');
  const hasHistory = (earnings.data?.lifetimeEarnings ?? 0) > 0 || (earnings.data?.completedTrips ?? 0) > 0;

  return (
    <div className="space-y-8 pb-8">
      {/* Greeting. Compact — the page is a workspace, not a landing page. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Host</p>
          <h1 className="display mt-1 truncate text-display-sm">{host.data?.displayName ?? 'Your dashboard'}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {host.data && (
              <Badge tone={host.data.verificationStatus === 'verified' ? 'success' : 'warning'}>
                {host.data.verificationStatus}
              </Badge>
            )}
            {host.data?.isSuperhost && (
              <Badge tone="default"><Award className="me-1 h-3 w-3" /> All-Star Host</Badge>
            )}
            <span className="text-sm text-muted-foreground">
              {cars.length} car{cars.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <Link href="/host/listings/new">
          <Button size="lg"><Plus className="h-4 w-4" /> Add a car</Button>
        </Link>
      </div>

      {/* 1 — Waiting on you. Rendered only when something actually is. */}
      {(actions.length > 0 || blockers.length > 0) && (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between gap-3 px-1">
            <h2 className="text-xl font-bold tracking-tight">Needs attention</h2>
            {(inbox.data?.atRiskTotal ?? 0) > 0 && (
              <span className="numeric text-sm font-bold text-destructive flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" /> {money(inbox.data!.atRiskTotal)} at risk
              </span>
            )}
          </div>
          <div className="space-y-3">
            {blockers.map((b) => (
              <Link key={b.key} href={b.href} className="block group">
                <div className="flex items-center gap-4 rounded-3xl bg-destructive/5 p-5 transition-all group-hover:bg-destructive/10 group-active:scale-[0.98]">
                  <div className="h-12 w-12 shrink-0 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
                    <Wallet className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-foreground text-base">{b.label}</p>
                    <p className="text-sm font-medium text-destructive/80 mt-0.5">{b.detail}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            ))}

            {actions.slice(0, 4).map((a) => (
              <Link key={a.id} href={a.href} className="block group">
                <div className="flex items-center gap-4 rounded-3xl bg-warning/5 p-5 transition-all group-hover:bg-warning/10 group-active:scale-[0.98]">
                  <div className="h-12 w-12 shrink-0 rounded-full bg-warning/20 flex items-center justify-center text-warning-foreground">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-foreground text-base">{a.title}</p>
                    <p className="truncate text-sm font-medium text-warning-foreground/80 mt-0.5">{a.detail}</p>
                  </div>
                  {a.atRisk ? (
                    <span className="numeric shrink-0 text-base font-bold text-foreground">{money(a.atRisk)}</span>
                  ) : null}
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 2 — Money. One headline figure, the rest supporting it. */}
      {earnings.isLoading ? (
        <Skeleton className="h-40 w-full rounded-3xl" />
      ) : hasHistory ? (
        <section className="rounded-3xl bg-muted/20 border border-border/30 overflow-hidden">
          <div className="grid sm:grid-cols-[1.4fr_1fr]">
            <div className="p-8 sm:border-r border-border/40 flex flex-col justify-center">
              <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                <TrendingUp className="h-4 w-4 text-primary" /> Lifetime earnings
              </p>
              <p className="numeric tracking-tighter mt-4 text-5xl lg:text-6xl font-black text-foreground">
                {money(earnings.data!.lifetimeEarnings)}
              </p>
              <p className="mt-3 text-sm font-medium text-muted-foreground">
                Across {earnings.data!.completedTrips ?? 0} completed trip
                {earnings.data!.completedTrips === 1 ? '' : 's'}
              </p>
              <Link
                href="/host/earnings"
                className="mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition-transform hover:scale-105"
              >
                View breakdown <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <dl className="flex flex-col justify-center p-6 sm:p-8 space-y-6">
              <Figure label="Available now" value={money(earnings.data!.currentBalance)} />
              <Figure
                label="Pending payout"
                value={money(earnings.data!.pendingPayout)}
                tone={earnings.data!.pendingPayout > 0 ? 'warning' : undefined}
              />
              <Figure label="Paid out" value={money(earnings.data!.paidOut)} />
            </dl>
          </div>
        </section>
      ) : (
        // A new host does not need four zeros explained to them.
        <section className="rounded-3xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 shrink-0 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">No earnings yet</p>
                <p className="mt-1 max-w-prose text-base font-medium text-muted-foreground">
                  {cars.length === 0
                    ? 'List your first car and your earnings will appear here after your first completed trip.'
                    : 'Your cars are live. Earnings appear here once your first trip completes.'}
                </p>
              </div>
            </div>
            <Link href={cars.length === 0 ? '/host/listings/new' : '/host/listings'} className="shrink-0">
              <Button size="lg" className="rounded-full font-bold w-full sm:w-auto">
                {cars.length === 0 ? 'List a car' : 'Review your listings'}
              </Button>
            </Link>
          </div>
        </section>
      )}

      {/* 3 — The fleet, with photographs. */}
      <section className="space-y-6 pt-4">
        <div className="flex items-baseline justify-between gap-3 px-1">
          <h2 className="text-xl font-bold tracking-tight">Your cars</h2>
          {cars.length > 3 && (
            <Link href="/host/listings" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary transition-transform hover:translate-x-1">
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>

        {vehicles.isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-72 w-full rounded-[2rem]" />)}
          </div>
        ) : cars.length === 0 ? (
          <div className="rounded-[2rem] border-2 border-dashed border-border p-12 text-center">
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-muted">
              <Car className="h-10 w-10 text-muted-foreground/60" />
            </span>
            <p className="mt-6 text-xl font-bold">No cars listed yet</p>
            <p className="mt-2 text-base font-medium text-muted-foreground max-w-sm mx-auto">
              Adding a car takes a few minutes — we read most of the details from the VIN.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
              <Link href="/host/listings/new"><Button size="lg" className="w-full sm:w-auto rounded-full font-bold"><Plus className="h-5 w-5 mr-2" /> Add a car</Button></Link>
              <Link href="/host/listings/import"><Button size="lg" variant="outline" className="w-full sm:w-auto rounded-full font-bold">Import fleet</Button></Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {cars.slice(0, 6).map((v) => <FleetCard key={v._id} v={v} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'warning' }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-base font-semibold text-muted-foreground">{label}</dt>
      <dd className={cn('numeric text-lg font-bold', tone === 'warning' ? 'text-warning' : 'text-foreground')}>{value}</dd>
    </div>
  );
}

/**
 * A car, shown as a car.
 *
 * The photograph is the point: a host recognises their fleet by sight, and a
 * listing with no cover image is also a listing guests scroll past — so a
 * missing photo is surfaced as something to fix rather than hidden behind a
 * grey rectangle.
 */
function FleetCard({ v }: { v: Vehicle }) {
  const photo = v.photos?.find((p) => p.isCover)?.url ?? v.photos?.[0]?.url;
  const listed = v.status === 'listed';

  return (
    <Link href={`/host/listings/${v._id}`} className="group block h-full">
      <div className="flex flex-col h-full overflow-hidden rounded-[2rem] bg-card transition-all duration-500 group-hover:-translate-y-2 group-hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] border border-border/40 hover:border-primary/30">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt={`${v.make} ${v.model}`}
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-muted/50 to-muted text-muted-foreground/60">
              <ImageOff className="h-8 w-8" />
              <span className="text-sm font-bold">No photo added</span>
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          
          <span className={cn(
            "absolute left-4 top-4 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider backdrop-blur-md border",
            listed ? "bg-black/40 text-white border-white/20" : "bg-black/70 text-white border-white/10"
          )}>
            {v.status}
          </span>
          {!listed && <span className="absolute inset-0 bg-background/20 backdrop-blur-[1px]" />}
        </div>

        <div className="flex flex-col flex-1 justify-between p-5 sm:p-6">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold transition-colors group-hover:text-primary">
              {v.year} {v.make} {v.model}
            </h3>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-muted-foreground/80">
              {v.ratingCount > 0 ? (
                <><span className="text-primary">★ {v.ratingAvg.toFixed(1)}</span> <span className="w-1 h-1 rounded-full bg-muted-foreground/40 mx-1"/> {v.ratingCount} trips</>
              ) : (
                'No trips yet'
              )}
            </p>
          </div>
          <div className="mt-6 flex items-end justify-between border-t border-border/40 pt-4">
             <span className="text-sm font-semibold text-muted-foreground">Daily rate</span>
             <p className="numeric text-right flex items-baseline gap-1">
              <span className="text-xl font-bold text-foreground">
                {formatMoney({ amount: v.pricing.dailyPrice, currency: v.pricing.currency })}
              </span>
              <span className="text-xs font-medium text-muted-foreground">/d</span>
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
