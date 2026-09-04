'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Plus, Car, TrendingUp, Award, ArrowRight, AlertTriangle, ImageOff,
  Wallet, ChevronRight, Sparkles,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="display text-xl">Waiting on you</h2>
            {(inbox.data?.atRiskTotal ?? 0) > 0 && (
              <span className="numeric text-sm font-semibold text-warning">
                {money(inbox.data!.atRiskTotal)} at risk
              </span>
            )}
          </div>

          {blockers.map((b) => (
            <Link key={b.key} href={b.href} className="block">
              <Card className="border-destructive/40 bg-destructive/5 transition-colors hover:border-destructive">
                <CardContent className="flex items-center gap-3 py-4">
                  <Wallet className="h-5 w-5 shrink-0 text-destructive" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{b.label}</p>
                    <p className="text-sm text-muted-foreground">{b.detail}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}

          {actions.slice(0, 4).map((a) => (
            <Link key={a.id} href={a.href} className="block">
              <Card className="transition-colors hover:border-primary/50">
                <CardContent className="flex items-center gap-3 py-4">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{a.title}</p>
                    <p className="truncate text-sm text-muted-foreground">{a.detail}</p>
                  </div>
                  {a.atRisk ? (
                    <span className="numeric shrink-0 text-sm font-semibold">{money(a.atRisk)}</span>
                  ) : null}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>
      )}

      {/* 2 — Money. One headline figure, the rest supporting it. */}
      {earnings.isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : hasHistory ? (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="grid sm:grid-cols-[1.4fr_1fr]">
              <div className="border-b border-border p-6 sm:border-b-0 sm:border-e">
                <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <TrendingUp className="h-4 w-4 text-primary" /> Lifetime earnings
                </p>
                <p className="numeric display mt-2 text-5xl leading-none">
                  {money(earnings.data!.lifetimeEarnings)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Across {earnings.data!.completedTrips ?? 0} completed trip
                  {earnings.data!.completedTrips === 1 ? '' : 's'}
                </p>
                <Link
                  href="/host/earnings"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  See the breakdown <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <dl className="divide-y divide-border">
                <Figure label="Available now" value={money(earnings.data!.currentBalance)} />
                <Figure
                  label="Pending payout"
                  value={money(earnings.data!.pendingPayout)}
                  tone={earnings.data!.pendingPayout > 0 ? 'warning' : undefined}
                />
                <Figure label="Paid out" value={money(earnings.data!.paidOut)} />
              </dl>
            </div>
          </CardContent>
        </Card>
      ) : (
        // A new host does not need four zeros explained to them.
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-6">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-semibold">No earnings yet</p>
                <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">
                  {cars.length === 0
                    ? 'List your first car and your earnings will appear here after your first completed trip.'
                    : 'Your cars are live. Earnings appear here once your first trip completes.'}
                </p>
              </div>
            </div>
            <Link href={cars.length === 0 ? '/host/listings/new' : '/host/listings'}>
              <Button variant="outline">
                {cars.length === 0 ? 'List a car' : 'Review your listings'}
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* 3 — The fleet, with photographs. */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="display text-xl">Your cars</h2>
          {cars.length > 3 && (
            <Link href="/host/listings" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        {vehicles.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-64 w-full rounded-2xl" />)}
          </div>
        ) : cars.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-muted">
                <Car className="h-7 w-7 text-muted-foreground" />
              </span>
              <div>
                <p className="font-semibold">No cars listed yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Adding a car takes a few minutes — we read most of the details from the VIN.
                </p>
              </div>
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                <Link href="/host/listings/new"><Button><Plus className="h-4 w-4" /> Add a car</Button></Link>
                <Link href="/host/listings/import"><Button variant="outline">Import a fleet</Button></Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cars.slice(0, 6).map((v) => <FleetCard key={v._id} v={v} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'warning' }) {
  return (
    <div className="flex items-center justify-between px-6 py-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={cn('numeric font-semibold', tone === 'warning' && 'text-warning')}>{value}</dd>
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
    <Link href={`/host/listings/${v._id}`} className="group block">
      <Card className="overflow-hidden transition-all duration-300 group-hover:-translate-y-1 group-hover:border-primary/40 group-hover:shadow-lg">
        <div className="relative aspect-[16/10] overflow-hidden bg-muted">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt={`${v.make} ${v.model}`}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
              <ImageOff className="h-6 w-6" />
              <span className="text-xs font-medium">No photo — add one</span>
            </div>
          )}

          {/* On a photograph, a scrim is what keeps a label readable over both
              a white car and a black one. */}
          <span className="absolute end-2 top-2 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-md">
            {v.status}
          </span>
          {!listed && <span className="absolute inset-0 bg-background/45" />}
        </div>

        <CardContent className="flex items-center justify-between gap-3 py-4">
          <div className="min-w-0">
            {/* Year included: a host with two Camrys cannot tell them apart
                without it, and the old card truncated even a single name. */}
            <p className="truncate font-semibold transition-colors group-hover:text-primary">
              {v.year} {v.make} {v.model}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              {v.ratingCount > 0 ? (
                <>{v.ratingAvg.toFixed(1)} ★ · {v.ratingCount} trip{v.ratingCount === 1 ? '' : 's'}</>
              ) : (
                'No trips yet'
              )}
            </p>
          </div>
          <p className="numeric shrink-0 text-end">
            <span className="text-lg font-bold">
              {formatMoney({ amount: v.pricing.dailyPrice, currency: v.pricing.currency })}
            </span>
            <span className="block text-xs text-muted-foreground">per day</span>
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
