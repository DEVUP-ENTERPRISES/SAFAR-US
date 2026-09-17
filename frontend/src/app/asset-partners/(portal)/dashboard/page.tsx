'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, Car, Wallet, TrendingUp, CalendarClock, CheckCircle2, Clock, Wrench,
  FileText,
} from 'lucide-react';
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
import { StatementCard } from '@/features/asset-partners/components/statement-card';
import { PartnerVehicleCard } from '@/features/asset-partners/components/vehicle-card';
import { PartnerSupport } from '@/features/asset-partners/components/partner-support';
import {
  assetPartnerApi,
  type ApplicationStatus,
  type PartnerApplication,
  type PartnerDashboard,
  type PartnerStatus,
} from '@/features/asset-partners/api';

/**
 * The Asset Partner's dashboard — an OVERVIEW, not a copy of the portal.
 *
 * An Asset Partner is a passive owner: CATO lists, prices, delivers, cleans
 * and services the car. So this is deliberately not the host dashboard, built
 * for someone running their own calendar and pricing.
 *
 * It used to carry the full statement breakdown, the whole vehicle grid and
 * the monthly chart all at once, which then repeated verbatim on the pages
 * that own those things. Each section here is now a summary that hands off:
 * three vehicles and a link, this month's totals and a link, a banner when
 * maintenance needs a decision.
 */

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

const STAGES = ['Submitted', 'Under review', 'Approved', 'Earning'] as const;

function stageIndex(app: PartnerApplication, isEarning: boolean): number {
  if (isEarning) return 3;
  if (app.status === 'approved') return 2;
  if (app.status === 'under_review') return 1;
  return 0;
}

const PARTNER_STATUS_META: Record<
  PartnerStatus,
  { label: string; tone: 'default' | 'success' | 'warning' | 'destructive' | 'muted' }
> = {
  onboarding: { label: 'Onboarding', tone: 'warning' },
  active: { label: 'Active', tone: 'success' },
  suspended: { label: 'Suspended', tone: 'destructive' },
  exited: { label: 'Exited', tone: 'muted' },
};

export default function PartnerDashboardPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['asset-partner-dashboard'],
    queryFn: () => assetPartnerApi.dashboard(),
  });
  const pending = useQuery({
    queryKey: ['asset-partner-maintenance', 'pending'],
    queryFn: () => assetPartnerApi.maintenance('pending'),
  });

  if (isLoading) {
    return (
      <div className="space-y-6 py-8">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-[2rem]" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="py-8">
        <ErrorState message="We couldn’t load your partner dashboard." retry={() => refetch()} />
      </div>
    );
  }

  const hasApplied = data.applications.length > 0;
  const isEarning = data.vehicles.length > 0;

  return (
    <div className="space-y-8 py-8">
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

      {!hasApplied ? (
        <NotAppliedYet />
      ) : (
        <Applied data={data} isEarning={isEarning} pendingCount={pending.data?.length ?? 0} />
      )}
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

function Applied({
  data,
  isEarning,
  pendingCount,
}: {
  data: PartnerDashboard;
  isEarning: boolean;
  pendingCount: number;
}) {
  const s = data.currentStatement;
  const cur = s?.currency ?? 'USD';
  const money = (v: number) => formatMoney({ amount: v, currency: cur });
  // Closed months only — the running month is shown in full above and would
  // read as a dip in the chart while it is still filling up.
  const closed = (data.history ?? []).filter((h) => h.final).slice().reverse();
  const preview = data.vehicles.slice(0, 3);

  return (
    <div className="space-y-8">
      {/* The one thing on this page that needs a decision, not just reading. */}
      {pendingCount > 0 && (
        <Link href="/asset-partners/maintenance" className="block">
          <Card className="border-warning/40 bg-warning/5 transition-colors hover:border-warning/60">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
              <span className="flex min-w-0 items-center gap-3">
                <Wrench className="h-5 w-5 shrink-0 text-warning" />
                <span className="min-w-0">
                  <span className="block font-semibold">
                    {pendingCount} maintenance {pendingCount === 1 ? 'request needs' : 'requests need'} your approval
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    Work above your approval line doesn’t start until you say so.
                  </span>
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      )}

      {isEarning && s && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Your net this month"
              value={money(s.totals.net)}
              sub={s.final ? 'Final' : 'Still running'}
              icon={<Wallet className="h-5 w-5" />}
              tone={s.totals.net >= 0 ? 'success' : 'warning'}
              emphasis
            />
            <StatTile
              label="Paid on"
              value={formatDate(s.payoutDate)}
              sub={`By ${s.payoutMethod}`}
              icon={<CalendarClock className="h-5 w-5" />}
            />
            <StatTile
              label="Gross bookings"
              value={money(s.totals.gross)}
              sub={`${s.totals.trips} completed trip${s.totals.trips === 1 ? '' : 's'}`}
              icon={<TrendingUp className="h-5 w-5" />}
            />
            <StatTile
              label="Vehicles"
              value={String(data.vehicles.length)}
              sub={`${s.terms.managementFeeBps / 100}% management fee`}
              icon={<Car className="h-5 w-5" />}
              href="/asset-partners/vehicles"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Compact: the per-vehicle breakdown lives on Vehicles, and the
                full archive on Statements. */}
            <div className="space-y-3">
              <StatementCard statement={s} compact />
              <Link
                href="/asset-partners/statements"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                See every statement <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {closed.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <TrendingUp className="h-5 w-5 text-primary" /> Your net by month
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <BarChart
                    data={closed.map((h) => ({ label: h.period.slice(5), value: h.totals.net }))}
                    currency={cur}
                  />
                </CardContent>
              </Card>
            )}
          </div>

          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <h2 className="display text-xl">Your vehicles</h2>
              {data.vehicles.length > preview.length && (
                <Link
                  href="/asset-partners/vehicles"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  View all {data.vehicles.length} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {preview.map((v) => (
                <PartnerVehicleCard key={v._id} vehicle={v} currency={cur} />
              ))}
            </div>
          </section>
        </>
      )}

      {data.partner && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Programme status
              </p>
              <p className="mt-1 truncate font-semibold">
                {data.partner.displayName} ·{' '}
                <span className="capitalize text-muted-foreground">{data.partner.partnerType}</span>
              </p>
            </div>
            <Badge tone={PARTNER_STATUS_META[data.partner.status].tone}>
              {PARTNER_STATUS_META[data.partner.status].label}
            </Badge>
          </CardContent>
        </Card>
      )}

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

function ApplicationCard({ app, isEarning }: { app: PartnerApplication; isEarning: boolean }) {
  const meta = STATUS_META[app.status];
  const current = stageIndex(app, isEarning);
  const rejected = app.status === 'rejected';

  return (
    <Card>
      <CardContent className="space-y-5 py-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={meta.tone}>{meta.label}</Badge>
            <span className="font-mono text-xs text-muted-foreground">{app.reference}</span>
          </div>
          <p className="display mt-2 truncate text-lg">
            {app.vehicle.year} {app.vehicle.make} {app.vehicle.model}
            {app.vehicle.trim ? ` ${app.vehicle.trim}` : ''}
          </p>
          <p className="mt-0.5 break-words text-sm text-muted-foreground">
            Applied {formatDate(app.createdAt)} · VIN {app.vehicle.vin}
          </p>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">{meta.detail}</p>

        {/* A rejected application has no journey left to show. */}
        {!rejected && <StageTrack current={current} />}

        {app.reviewNotes && (
          <div
            className={cn(
              'rounded-xl border p-4',
              rejected ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-muted/40',
            )}
          >
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Note from your partner manager
            </p>
            <p className="mt-1 text-sm leading-relaxed">{app.reviewNotes}</p>
          </div>
        )}

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
              {i < STAGES.length - 1 && (
                <span className={cn('hidden h-px flex-1 sm:block', done ? 'bg-success/40' : 'bg-border')} />
              )}
            </span>
            <span className={cn('text-sm', active ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
              {stage}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

