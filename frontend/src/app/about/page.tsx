'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, Car, Scale, Receipt, Star, Zap, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { vehicleApi } from '@/features/vehicles/api';
import { config } from '@/lib/config';

/**
 * Why choose us.
 *
 * The four promises below are the ones with enforcement behind them in the
 * product — rebooking cover, a claims window that actually closes, blind
 * reviews, citations at cost. Nothing aspirational is listed, because a promise
 * page that overstates is worse than no promise page: the first guest to test
 * one and find it hollow stops believing the other three.
 *
 * The counts are live from the marketplace, and simply absent when there is
 * nothing real to show yet.
 */
export default function AboutPage() {
  const facets = useQuery({ queryKey: ['facets'], queryFn: () => vehicleApi.facets() });
  const stats = facets.data?.stats;

  return (
    <div className="mx-auto max-w-4xl space-y-10 py-6">
      <PageHeader
        title={`Why choose ${config.appName}`}
        description="Renting someone's car should not require faith. Here is what we put in writing."
      />

      {/* Live supply numbers — rendered only when there is something to state. */}
      {stats && (
        <div className="grid gap-3 sm:grid-cols-3">
          {stats.ratingAvg !== null && stats.ratingCount > 0 && (
            <Metric
              icon={Star}
              value={stats.ratingAvg.toFixed(1)}
              label={`from ${stats.ratingCount.toLocaleString()} completed trip${stats.ratingCount === 1 ? '' : 's'}`}
            />
          )}
          {stats.verifiedHosts > 0 && (
            <Metric
              icon={ShieldCheck}
              value={stats.verifiedHosts.toLocaleString()}
              label={`verified host${stats.verifiedHosts === 1 ? '' : 's'}`}
            />
          )}
          {stats.instantBook > 0 && (
            <Metric
              icon={Zap}
              value={stats.instantBook.toLocaleString()}
              label={`car${stats.instantBook === 1 ? '' : 's'} you can book instantly`}
            />
          )}
        </div>
      )}

      <section className="space-y-4">
        <h2 className="display text-2xl">Four things we guarantee</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Pillar
            icon={Car}
            title="A host cancels, you still drive"
            body="Most platforms refund you and call it resolved — which leaves you at an airport with no car. We find you another for your original dates and absorb the price difference up to a set limit."
          />
          <Pillar
            icon={Receipt}
            title="A finished trip stays finished"
            body="Claims have a hard window and require photographic evidence. Once it closes, the trip cannot be reopened against you weeks later."
          />
          <Pillar
            icon={Scale}
            title="Reviews are written blind"
            body="Neither side sees the other's review until both are submitted or the window closes. That removes the retaliation problem that makes ratings on other platforms mean very little."
          />
          <Pillar
            icon={ShieldCheck}
            title="Costs are passed through, not marked up"
            body="Tolls and citations are charged at cost, evidenced, and only within the window in which they could have occurred."
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="display text-2xl">How the money works</h2>
        <Card>
          <CardContent className="space-y-3 py-5 text-sm text-muted-foreground">
            <p>
              Guests see the full price before booking — the daily rate, protection, taxes and any delivery fee are
              itemised, not revealed at the last step.
            </p>
            <p>
              Hosts keep the majority of what guests pay. The exact split is published on the{' '}
              <Link href="/calculator" className="font-medium text-primary hover:underline">Carculator</Link>, along
              with what a car in your city actually earns.
            </p>
            <p>
              Taxes are calculated per jurisdiction rather than as a flat national rate, so a booking at an airport and
              one across town are priced correctly instead of approximately.
            </p>
          </CardContent>
        </Card>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/search"
          className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          Find a car <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/host"
          className="inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-card px-6 font-semibold transition-colors hover:bg-muted"
        >
          List your car
        </Link>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, value, label }: { icon: typeof Star; value: string; label: string }) {
  return (
    <Card>
      <CardContent className="py-5">
        <Icon className="h-5 w-5 text-primary" />
        <p className="numeric mt-2 text-3xl font-bold leading-none">{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function Pillar({ icon: Icon, title, body }: { icon: typeof Car; title: string; body: string }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="flex items-center gap-2 font-semibold">
          <Icon className="h-5 w-5 shrink-0 text-primary" /> {title}
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}
