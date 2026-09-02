'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Calculator, TrendingUp, Info, ArrowRight, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { vehicleApi } from '@/features/vehicles/api';
import { usePlatformConfig } from '@/features/platform/config';

const money = (cents: number) =>
  `$${Math.round(cents / 100).toLocaleString('en-US')}`;

/**
 * The Carculator — what a car would actually earn on this marketplace.
 *
 * Every number is live. The daily-rate band comes from the real price range of
 * cars already listed in the selected city and category; the take rate comes
 * from PlatformConfig, so when an admin retunes commission this page moves with
 * it. Nothing here is a stock assumption, which is the whole point: a host who
 * finds out after listing that the real numbers differ from the calculator
 * never trusts anything else on the site.
 */
export default function CarculatorPage() {
  const facets = useQuery({ queryKey: ['facets'], queryFn: () => vehicleApi.facets() });
  const config = usePlatformConfig();

  const [city, setCity] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [daysPerMonth, setDaysPerMonth] = useState(12);
  const [rate, setRate] = useState<number | null>(null);

  const cities = facets.data?.cities ?? [];
  const selectedCity = cities.find((c) => c.city === city) ?? cities[0];

  // Real local market: the price range of cars actually listed near this city.
  const market = useQuery({
    queryKey: ['calc-market', selectedCity?.city, category],
    queryFn: () =>
      vehicleApi.filterCounts({
        lng: selectedCity!.lng,
        lat: selectedCity!.lat,
        radiusKm: 50,
        category: category || undefined,
      }),
    enabled: !!selectedCity,
  });

  const observed = market.data?.priceRange ?? null;
  const sampleSize = market.data?.total ?? 0;

  // With one listed car the observed min and max are the same number, so a
  // slider bounded by them cannot move. Open a range around that single point
  // and say plainly that the bounds are ours, not the market's — the figure
  // itself is still real, the spread around it is not evidence.
  const singlePoint = !!observed && observed.min === observed.max;
  const band = observed
    ? singlePoint
      ? { min: Math.round(observed.min * 0.5), max: Math.round(observed.min * 2) }
      : observed
    : null;

  // Default to the middle of the real local band, not a made-up figure.
  const midpoint = observed ? Math.round((observed.min + observed.max) / 2) : null;
  const dailyRate = rate ?? midpoint;

  const takeRateBps = config.data?.hostTakeRateBps ?? null;

  const projection = useMemo(() => {
    if (dailyRate == null || takeRateBps == null) return null;
    const gross = dailyRate * daysPerMonth;
    const fee = Math.round((gross * takeRateBps) / 10_000);
    return { gross, fee, net: gross - fee, year: (gross - fee) * 12 };
  }, [dailyRate, daysPerMonth, takeRateBps]);

  const loading = facets.isLoading || config.isLoading;

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-6">
      <PageHeader
        title="Carculator"
        description="What your car could earn here — priced off cars actually listed near you, not an industry average."
      />

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : cities.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-8 w-8" />}
          title="No live market data yet"
          description="Once cars are listed we can show you what they earn. Until then we would only be guessing, so we would rather not."
        />
      ) : (
        <>
          {/* Inputs */}
          <Card>
            <CardContent className="grid gap-5 py-6 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium">Where the car lives</span>
                <Select value={selectedCity?.city ?? ''} onChange={(e) => { setCity(e.target.value); setRate(null); }}>
                  {cities.map((c) => (
                    <option key={c.city} value={c.city}>
                      {c.city} — {c.vehicles} car{c.vehicles === 1 ? '' : 's'} listed
                    </option>
                  ))}
                </Select>
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium">Class of car</span>
                <Select value={category} onChange={(e) => { setCategory(e.target.value); setRate(null); }}>
                  <option value="">Any class</option>
                  {(facets.data?.categories ?? []).map((c) => (
                    <option key={c.category} value={c.category}>
                      {c.category}
                    </option>
                  ))}
                </Select>
              </label>

              {/* Daily rate, anchored to the real local band */}
              <div className="space-y-1.5 sm:col-span-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium">Your daily rate</span>
                  {dailyRate != null && (
                    <span className="numeric text-lg font-bold">{money(dailyRate)}<span className="text-sm font-medium text-muted-foreground">/day</span></span>
                  )}
                </div>
                {band ? (
                  <>
                    <input
                      type="range"
                      min={band.min}
                      max={band.max}
                      step={100}
                      value={dailyRate ?? band.min}
                      onChange={(e) => setRate(Number(e.target.value))}
                      className="w-full accent-primary"
                      aria-label="Daily rate"
                    />
                    <p className="numeric flex justify-between text-xs text-muted-foreground">
                      <span>{money(band.min)}</span>
                      <span className="px-2 text-center">
                        {singlePoint
                          ? `The one car listed near ${selectedCity?.city} goes for ${money(observed!.min)}/day`
                          : `Real range across ${sampleSize} cars near ${selectedCity?.city}`}
                      </span>
                      <span>{money(band.max)}</span>
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No cars listed in this class near {selectedCity?.city} yet, so there is no local rate to price against.
                    Pick another class.
                  </p>
                )}
              </div>

              {/* Days booked */}
              <div className="space-y-1.5 sm:col-span-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium">Days booked per month</span>
                  <span className="numeric text-lg font-bold">{daysPerMonth}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={30}
                  value={daysPerMonth}
                  onChange={(e) => setDaysPerMonth(Number(e.target.value))}
                  className="w-full accent-primary"
                  aria-label="Days booked per month"
                />
              </div>
            </CardContent>
          </Card>

          {/* Result */}
          {projection && takeRateBps != null && (
            <Card className="border-primary/40 bg-primary/5">
              <CardContent className="py-6">
                <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
                  <TrendingUp className="h-4 w-4" /> You keep
                </p>
                <p className="numeric display mt-2 text-5xl leading-none">
                  {money(projection.net)}
                  <span className="text-xl font-medium text-muted-foreground">/month</span>
                </p>
                <p className="numeric mt-1 text-sm text-muted-foreground">
                  About {money(projection.year)} a year at this rate and usage.
                </p>

                {/* The deduction, stated plainly rather than buried. */}
                <dl className="numeric mt-5 space-y-2 border-t border-primary/20 pt-4 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Guests pay you</dt>
                    <dd className="font-medium">{money(projection.gross)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">
                      Our cut ({(takeRateBps / 100).toFixed(takeRateBps % 100 === 0 ? 0 : 1)}%)
                    </dt>
                    <dd className="font-medium">−{money(projection.fee)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-primary/20 pt-2 text-base font-bold">
                    <dt>Your payout</dt>
                    <dd>{money(projection.net)}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          )}

          {/* What this figure does and does not include. */}
          <Card>
            <CardContent className="flex items-start gap-3 py-5 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="space-y-1.5">
                <p>
                  <span className="font-medium text-foreground">This is a projection, not an offer.</span> It assumes
                  you are booked the number of days you picked — new listings usually take a few weeks to get there.
                </p>
                <p>
                  The rate shown is our standard cut. Some hosts are on a lower one, so this is a floor on what you
                  keep rather than a cap.
                </p>
                <p>Not included: fuel, cleaning, maintenance, or your own insurance while the car is off-platform.</p>
              </div>
            </CardContent>
          </Card>

          <Link
            href="/host/listings/new"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <Calculator className="h-4 w-4" /> List this car <ArrowRight className="h-4 w-4" />
          </Link>
        </>
      )}
    </div>
  );
}
