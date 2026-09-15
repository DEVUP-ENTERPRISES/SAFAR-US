'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, Car, Wallet, TrendingUp, CalendarClock, CheckCircle2, Clock,
  FileText, Phone, Mail, Banknote,
} from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { BarChart } from '@/components/ui/charts';
import { formatMoney, formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import {
  assetPartnerApi,
  type ApplicationStatus,
  type PartnerApplication,
  type PartnerDashboard,
  type PartnerVehicleSummary,
} from '@/features/asset-partners/api';

/**
 * The Asset Partner's own dashboard.
 *
 * An Asset Partner is a PASSIVE owner — CATO lists, prices, delivers, cleans
 * and services the car. So this is deliberately not the host dashboard, which
 * is built for someone managing their own calendar and pricing. The only
 * questions a passive owner has are: where is my application, is my car out
 * earning, how much, and when am I paid. Everything here answers one of those.
 *
 * It also closes a real hole: before this, submitting the intake form returned
 * a reference number and then nothing — the application was only ever visible
 * in the admin queue.
 */

/** Real, business-supplied partner support contacts. */
const PARTNER_PHONE = '(214) 814-0402';
const PARTNER_EMAIL = 'shoaib@catodrive.com';

const STATUS_META: Record<
  ApplicationStatus,
  { label: string; tone: 'default' | 'success' | 'warning' | 'destructive' | 'muted'; detail: string }
> = {
  submitted: {
    label: 'Submitted',
    tone: 'warning',
    detail: 'We have your application. A partner manager reviews it and comes back within 2 business days.',
  },
  under_review: {
    label: 'Under review',
    tone: 'warning',
    detail: 'Your vehicle and documents are being checked. We’ll call you to arrange the inspection.',
  },
  approved: {
    label: 'Approved',
    tone: 'success',
    detail: 'You’re approved. Once onboarding and the inspection are done, your car goes live and starts earning.',
  },
  rejected: {
    label: 'Not approved',
    tone: 'destructive',
    detail: 'We couldn’t take this vehicle on. The reason is below — talk to us if anything has changed.',
  },
};

/** The four stages a partner moves through, in order. */
const STAGES = ['Submitted', 'Under review', 'Approved', 'Earning'] as const;

function stageIndex(app: PartnerApplication, isEarning: boolean): number {
  if (isEarning) return 3;
  if (app.status === 'approved') return 2;
  if (app.status === 'under_review') return 1;
  return 0;
}

export default function Page() {
  return (
    <AuthGuard>
      <PartnerDashboardPage />
    </AuthGuard>
  );
}

function PartnerDashboardPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['asset-partner-dashboard'],
    queryFn: () => assetPartnerApi.dashboard(),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 py-8">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-[2rem]" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-6xl py-8">
        <ErrorState message="We couldn’t load your partner dashboard." retry={() => refetch()} />
      </div>
    );
  }

  const hasApplied = data.applications.length > 0;
  const isEarning = data.vehicles.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8 py-8 pb-24">
      <PageHeader
        eyebrow="Asset Partners"
        title="Your partner dashboard"
        description={
          isEarning
            ? 'What your vehicles are earning, and when the money reaches you.'
            : 'Where your application stands, and what happens next.'
        }
        actions={
          hasApplied ? (
            <Link href="/asset-partners/apply">
              <Button variant="outline">Add another vehicle</Button>
            </Link>
          ) : undefined
        }
      />

      {!hasApplied ? <NotAppliedYet /> : <Applied data={data} isEarning={isEarning} />}
    </div>
  );
}

/** Nothing to show — they reached this page without ever applying. */
function NotAppliedYet() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <FileText className="h-7 w-7" />
        </span>
        <div>
          <p className="display text-xl">No application yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Put the car you already own to work. We list it, price it, deliver it, clean it and
            service it — you keep 80% of every booking.
          </p>
        </div>
        <Link href="/asset-partners/apply">
          <Button size="lg" className="rounded-xl">
            Apply to become a partner <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        <Link href="/asset-partners" className="text-sm font-medium text-primary hover:underline">
          Read how it works first
        </Link>
      </CardContent>
    </Card>
  );
}

function Applied({ data, isEarning }: { data: PartnerDashboard; isEarning: boolean }) {
  const e = data.earnings;
  const cur = e?.currency ?? 'USD';
  const money = (v: number) => formatMoney({ amount: v, currency: cur });

  return (
    <div className="space-y-8">
      {/* Earnings lead once there is something to report. Before that they are
          noise — a row of $0 tiles reads as "my car earned nothing". */}
      {isEarning && e && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Available now"
              value={money(e.currentBalance)}
              sub="Ready to pay out"
              icon={<Wallet className="h-5 w-5" />}
              tone="success"
              emphasis
            />
            <StatTile
              label="Next payout"
              value={data.nextPayout ? money(data.nextPayout.amount) : '—'}
              sub={data.nextPayout ? formatDate(data.nextPayout.scheduledFor) : 'Nothing scheduled'}
              icon={<CalendarClock className="h-5 w-5" />}
            />
            <StatTile
              label="Paid out"
              value={money(e.paidOut)}
              sub="Already in your account"
              icon={<Banknote className="h-5 w-5" />}
            />
            <StatTile
              label="Lifetime earnings"
              value={money(e.lifetimeEarnings)}
              sub={`${e.completedTrips} payout${e.completedTrips === 1 ? '' : 's'}`}
              icon={<TrendingUp className="h-5 w-5" />}
            />
          </div>

          {e.monthly.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TrendingUp className="h-5 w-5 text-primary" /> Monthly earnings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart
                  data={e.monthly.map((m) => ({ label: m.month, value: m.amount }))}
                  currency={cur}
                />
              </CardContent>
            </Card>
          )}

          <section>
            <h2 className="display mb-4 text-xl">Your vehicles</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.vehicles.map((v) => (
                <VehicleCard key={v._id} vehicle={v} currency={cur} />
              ))}
            </div>
          </section>
        </>
      )}

      {/* Application status — always shown. Once earning it is history; before
          that it is the entire point of the page. */}
      <section>
        <h2 className="display mb-4 text-xl">
          {data.applications.length === 1 ? 'Your application' : 'Your applications'}
        </h2>
        <div className="space-y-4">
          {data.applications.map((app) => (
            <ApplicationCard key={app._id} app={app} isEarning={isEarning} />
          ))}
        </div>
      </section>

      <PartnerSupport />
    </div>
  );
}

function VehicleCard({ vehicle, currency }: { vehicle: PartnerVehicleSummary; currency: string }) {
  const live = vehicle.status === 'listed';
  return (
    <Card className="overflow-hidden">
      <div className="relative h-36 w-full bg-muted">
        {vehicle.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={vehicle.photo} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            <Car className="h-7 w-7" />
          </div>
        )}
      </div>
      <CardContent className="space-y-3 py-5">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate font-semibold">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </p>
          <Badge tone={live ? 'success' : 'muted'}>{live ? 'Live' : vehicle.status.replace(/_/g, ' ')}</Badge>
        </div>
        <div className="flex items-baseline justify-between border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">Earned</span>
          <span className="font-bold">{formatMoney({ amount: vehicle.revenue, currency })}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Trips</span>
          <span className="font-medium">{vehicle.trips}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function ApplicationCard({ app, isEarning }: { app: PartnerApplication; isEarning: boolean }) {
  const meta = STATUS_META[app.status];
  const current = stageIndex(app, isEarning);
  const rejected = app.status === 'rejected';

  return (
    <Card>
      <CardContent className="space-y-5 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={meta.tone}>{meta.label}</Badge>
              <span className="font-mono text-xs text-muted-foreground">{app.reference}</span>
            </div>
            <p className="display mt-2 truncate text-lg">
              {app.vehicle.year} {app.vehicle.make} {app.vehicle.model}
              {app.vehicle.trim ? ` ${app.vehicle.trim}` : ''}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Applied {formatDate(app.createdAt)} · VIN {app.vehicle.vin}
            </p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">{meta.detail}</p>

        {/* A rejected application has no journey left to show. */}
        {!rejected && <StageTrack current={current} />}

        {app.reviewNotes && (
          <div className={cn('rounded-xl border p-4', rejected ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-muted/40')}>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Note from your partner manager
            </p>
            <p className="mt-1 text-sm leading-relaxed">{app.reviewNotes}</p>
          </div>
        )}

        {/* Approved but nothing listed yet — say what is actually outstanding
            rather than leaving them wondering why no money is moving. */}
        {app.status === 'approved' && !isEarning && (
          <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Clock className="h-4 w-4" /> Next: onboarding &amp; inspection
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              We’ll photograph the car, confirm the agreement and complete the inspection. Your car
              goes live straight after — nothing more is needed from you until we call.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Submitted → Under review → Approved → Earning. */
function StageTrack({ current }: { current: number }) {
  return (
    <ol className="flex flex-col gap-3 sm:flex-row sm:gap-0">
      {STAGES.map((stage, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={stage} className="flex flex-1 items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
            <span className="flex items-center gap-3 sm:w-full">
              <span
                className={cn(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold',
                  done && 'bg-success/15 text-success',
                  active && 'bg-primary text-primary-foreground',
                  !done && !active && 'bg-muted text-muted-foreground',
                )}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </span>
              {/* Connector — horizontal only, where the stages sit in a row. */}
              {i < STAGES.length - 1 && (
                <span className={cn('hidden h-px flex-1 sm:block', done ? 'bg-success/40' : 'bg-border')} />
              )}
            </span>
            <span
              className={cn(
                'text-sm',
                active ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              {stage}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function PartnerSupport() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Questions about your vehicle?</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <a
          href={`tel:${PARTNER_PHONE.replace(/\D/g, '')}`}
          className="flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:border-primary/40"
        >
          <Phone className="h-5 w-5 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Call or text</span>
            <span className="block truncate font-semibold">{PARTNER_PHONE}</span>
          </span>
        </a>
        <a
          href={`mailto:${PARTNER_EMAIL}`}
          className="flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:border-primary/40"
        >
          <Mail className="h-5 w-5 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Email</span>
            <span className="block truncate font-semibold">{PARTNER_EMAIL}</span>
          </span>
        </a>
      </CardContent>
    </Card>
  );
}
