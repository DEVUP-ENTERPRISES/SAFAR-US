'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  SlidersHorizontal, X, Map as MapIcon, LayoutGrid, ChevronDown, Zap, Star, Bell,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { VehicleCard } from '@/features/vehicles/components/vehicle-card';
import { VehicleListCard } from '@/features/vehicles/components/vehicle-list-card';
import { useVehicleSearch, useFacets } from '@/features/vehicles/hooks';
import { useMutation } from '@tanstack/react-query';
import { savedSearchApi } from '@/features/saved-search/api';
import { useAuthStore } from '@/features/auth/store';
import { MapPanel } from '@/features/maps/components/map-panel';
import { SearchBarFields } from '@/features/search/search-bar-fields';
import { useSearchBar, toIso } from '@/features/search/search-store';
import { cn } from '@/lib/utils/cn';
import type { SearchParams, SortKey } from '@/features/vehicles/types';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'price_asc', label: 'Price: low to high' },
  { key: 'price_desc', label: 'Price: high to low' },
  { key: 'rating', label: 'Top rated' },
  { key: 'trending', label: 'Trending' },
];

const FUELS = ['petrol', 'diesel', 'hybrid', 'ev'] as const;
const SEAT_OPTIONS = [2, 4, 5, 7];

/** A filter "pill" that opens a small popover, Turo-style. Closes on outside click. */
function FilterDropdown({
  label, active, width = 300, children,
}: {
  label: React.ReactNode; active?: boolean; width?: number;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors',
          active ? 'border-foreground bg-foreground text-background' : 'border-border bg-card hover:border-foreground/50',
        )}
      >
        {label}
        <ChevronDown className={cn('h-4 w-4 opacity-60 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          className="absolute left-0 top-12 z-50 animate-slide-up rounded-2xl border border-border bg-card p-4 shadow-xl"
          style={{ width, maxWidth: '92vw' }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** A pill option inside a dropdown. */
function Opt({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3.5 py-2 text-sm font-medium capitalize transition-colors',
        on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:border-primary/50',
      )}
    >
      {children}
    </button>
  );
}

function SearchInner() {
  const qp = useSearchParams();
  const facets = useFacets();
  const cities = facets.data?.cities ?? [];
  const categories = facets.data?.categories ?? [];
  const status = useAuthStore((s) => s.status);
  const saveSearch = useMutation({ mutationFn: savedSearchApi.create });

  // Where / From / Until / Age live in the shared store so the bar can render
  // in the navbar (desktop) and here (mobile) and stay in sync.
  const bar = useSearchBar();
  const { center, fromDate, fromTime, untilDate, untilTime } = bar;
  const activeCity = cities.find((c) => c.city === bar.city) ?? cities[0];
  const city = activeCity?.city ?? bar.city;

  // Seed the bar from the URL once (deep links from the hero / saved searches).
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    bar.patch({
      city: qp.get('city') ?? bar.city,
      fromDate: (qp.get('start') ?? bar.fromDate).slice(0, 10),
      untilDate: (qp.get('end') ?? bar.untilDate).slice(0, 10),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filters
  const [category, setCategory] = useState(qp.get('category') ?? '');
  const [make, setMake] = useState('');
  const [fuelType, setFuelType] = useState('');
  const [transmission, setTransmission] = useState('');
  const [instantBook, setInstantBook] = useState(false);
  const [delivery, setDelivery] = useState(false);
  const [seatsMin, setSeatsMin] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [yearMin, setYearMin] = useState('');
  const [yearMax, setYearMax] = useState('');
  const [ratingMin, setRatingMin] = useState(0);
  const [sort, setSort] = useState<SortKey>('relevance');
  const [view, setView] = useState<'grid' | 'map'>('grid');

  const startIso = toIso(fromDate, fromTime);
  const endIso = toIso(untilDate, untilTime);
  const bothDates = !!(startIso && endIso);
  const days = bothDates ? Math.max(1, Math.ceil((+new Date(endIso!) - +new Date(startIso!)) / 86_400_000)) : undefined;
  const dateLabel =
    bothDates
      ? `${new Date(startIso!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(endIso!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
      : null;

  const coords = center
    ? { lat: center.lat, lng: center.lng }
    : activeCity
      ? { lat: activeCity.lat, lng: activeCity.lng }
      : undefined;
  const areaLabel = center ? center.label : city;

  const params: SearchParams | null = coords
    ? {
        ...coords,
        radiusKm: 50,
        start: bothDates ? startIso : undefined,
        end: bothDates ? endIso : undefined,
        category: category || undefined,
        make: make.trim() || undefined,
        fuelType: (fuelType as SearchParams['fuelType']) || undefined,
        transmission: (transmission as SearchParams['transmission']) || undefined,
        instantBook: instantBook || undefined,
        delivery: delivery || undefined,
        seatsMin: seatsMin ? Number(seatsMin) : undefined,
        priceMin: priceMin ? Number(priceMin) * 100 : undefined,
        priceMax: priceMax ? Number(priceMax) * 100 : undefined,
        yearMin: yearMin ? Number(yearMin) : undefined,
        yearMax: yearMax ? Number(yearMax) : undefined,
        ratingMin: ratingMin || undefined,
        sort,
        limit: 24,
      }
    : null;

  const { data, isLoading, isError, refetch, isFetching } = useVehicleSearch(params);

  const activeCount = [category, make, fuelType, transmission, instantBook, delivery, seatsMin, priceMin, priceMax, yearMin, yearMax, ratingMin].filter(Boolean).length;
  const clear = () => {
    setCategory(''); setMake(''); setFuelType(''); setTransmission(''); setInstantBook(false);
    setDelivery(false); setSeatsMin(''); setPriceMin(''); setPriceMax(''); setYearMin(''); setYearMax(''); setRatingMin(0);
  };

  return (
    <div className="space-y-5">
      {/* Search bar — desktop shows it inline in the navbar; mobile shows the
          full box here. Same shared store drives both. */}
      <div className="relative z-40 lg:hidden">
        <SearchBarFields variant="bar" />
      </div>

      {/* ── Filter pills + view toggle ────────────────────────────────── */}
      <div className="sticky top-16 z-30 -mx-4 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="hide-scrollbar flex flex-1 items-center gap-2 overflow-x-auto">
            {/* All filters */}
            <FilterDropdown
              label={<SlidersHorizontal className="h-4 w-4" />}
              active={!!transmission || ratingMin > 0}
              width={280}
            >
              {() => (
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-sm font-semibold">Transmission</p>
                    <div className="flex flex-wrap gap-2">
                      {['automatic', 'manual'].map((t) => (
                        <Opt key={t} on={transmission === t} onClick={() => setTransmission(transmission === t ? '' : t)}>{t}</Opt>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-semibold">Minimum rating</p>
                    <div className="flex flex-wrap gap-2">
                      {[4, 4.5].map((r) => (
                        <Opt key={r} on={ratingMin === r} onClick={() => setRatingMin(ratingMin === r ? 0 : r)}>
                          <Star className="mr-1 inline h-3.5 w-3.5 fill-current" />{r}+
                        </Opt>
                      ))}
                    </div>
                  </div>
                  {activeCount > 0 && (
                    <button onClick={clear} className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
                      <X className="h-4 w-4" /> Clear all filters
                    </button>
                  )}
                </div>
              )}
            </FilterDropdown>

            {/* Price */}
            <FilterDropdown label="Price" active={!!(priceMin || priceMax)} width={260}>
              {() => (
                <div>
                  <p className="mb-2 text-sm font-semibold">Daily price</p>
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} value={priceMin} onChange={(e) => setPriceMin(e.target.value)} placeholder="Min $" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
                    <span className="text-muted-foreground">–</span>
                    <input type="number" min={0} value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="Max $" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
                  </div>
                </div>
              )}
            </FilterDropdown>

            {/* Vehicle type */}
            <FilterDropdown label="Vehicle type" active={!!category} width={300}>
              {() => (
                <div className="flex flex-wrap gap-2">
                  {categories.length === 0 && <p className="text-sm text-muted-foreground">No types yet.</p>}
                  {categories.map((c) => (
                    <Opt key={c.category} on={category === c.category} onClick={() => setCategory(category === c.category ? '' : c.category)}>
                      {c.category} <span className="opacity-60">{c.vehicles}</span>
                    </Opt>
                  ))}
                </div>
              )}
            </FilterDropdown>

            {/* Make & model */}
            <FilterDropdown label="Make & model" active={!!make} width={260}>
              {() => (
                <div>
                  <p className="mb-2 text-sm font-semibold">Make</p>
                  <input value={make} onChange={(e) => setMake(e.target.value)} placeholder="e.g. Tesla, BMW" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
                </div>
              )}
            </FilterDropdown>

            {/* Years */}
            <FilterDropdown label="Years" active={!!(yearMin || yearMax)} width={260}>
              {() => (
                <div>
                  <p className="mb-2 text-sm font-semibold">Year</p>
                  <div className="flex items-center gap-2">
                    <input type="number" min={1990} max={2100} value={yearMin} onChange={(e) => setYearMin(e.target.value)} placeholder="From" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
                    <span className="text-muted-foreground">–</span>
                    <input type="number" min={1990} max={2100} value={yearMax} onChange={(e) => setYearMax(e.target.value)} placeholder="To" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
                  </div>
                </div>
              )}
            </FilterDropdown>

            {/* Seats */}
            <FilterDropdown label="Seats" active={!!seatsMin} width={240}>
              {() => (
                <div>
                  <p className="mb-2 text-sm font-semibold">Minimum seats</p>
                  <div className="flex flex-wrap gap-2">
                    {SEAT_OPTIONS.map((s) => (
                      <Opt key={s} on={seatsMin === String(s)} onClick={() => setSeatsMin(seatsMin === String(s) ? '' : String(s))}>{s}+</Opt>
                    ))}
                  </div>
                </div>
              )}
            </FilterDropdown>

            {/* Fuel type */}
            <FilterDropdown label="Fuel type" active={!!fuelType} width={280}>
              {() => (
                <div className="flex flex-wrap gap-2">
                  {FUELS.map((f) => (
                    <Opt key={f} on={fuelType === f} onClick={() => setFuelType(fuelType === f ? '' : f)}>
                      {f === 'ev' ? <><Zap className="mr-1 inline h-3.5 w-3.5" />Electric</> : f}
                    </Opt>
                  ))}
                </div>
              )}
            </FilterDropdown>

            {/* Deliver to me */}
            <FilterDropdown label="Deliver to me" active={delivery} width={260}>
              {() => (
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input type="checkbox" checked={delivery} onChange={(e) => setDelivery(e.target.checked)} className="mt-0.5 accent-[hsl(var(--primary))]" />
                  <span>
                    <span className="font-medium">Delivery available</span>
                    <span className="block text-muted-foreground">Only show cars a host will bring to you.</span>
                  </span>
                </label>
              )}
            </FilterDropdown>

            {/* Instant book */}
            <button
              type="button"
              onClick={() => setInstantBook((v) => !v)}
              className={cn(
                'flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors',
                instantBook ? 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-500' : 'border-border bg-card hover:border-foreground/50',
              )}
            >
              <Zap className="h-4 w-4" /> Instant Book
            </button>
          </div>

          {/* Grid / Map toggle */}
          <div className="flex shrink-0 rounded-full border border-border bg-card p-1">
            <button
              onClick={() => setView('grid')}
              className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors', view === 'grid' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
            >
              <LayoutGrid className="h-4 w-4" /> <span className="hidden sm:inline">Grid</span>
            </button>
            <button
              onClick={() => setView('map')}
              className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors', view === 'map' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
            >
              <MapIcon className="h-4 w-4" /> <span className="hidden sm:inline">Map</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Count + sort + save ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          {isFetching ? 'Searching…' : `${data?.length ?? 0} cars available`}
          <span className="ml-2 text-base font-medium text-muted-foreground">in {areaLabel}</span>
        </h1>
        <div className="flex items-center gap-2">
          {status === 'authenticated' && (
            <Button
              variant="outline"
              size="sm"
              loading={saveSearch.isPending}
              onClick={() =>
                saveSearch.mutate({
                  city: city || undefined,
                  category: category || undefined,
                  fuelType: (fuelType || undefined) as never,
                  transmission: (transmission || undefined) as never,
                  seatsMin: seatsMin ? Number(seatsMin) : undefined,
                  priceMaxCents: priceMax ? Number(priceMax) * 100 : undefined,
                  instantBook: instantBook || undefined,
                })
              }
            >
              <Bell className="h-4 w-4" /> {saveSearch.isSuccess ? 'Saved' : 'Save search'}
            </Button>
          )}
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-9 cursor-pointer appearance-none rounded-full border border-border bg-card pl-4 pr-9 text-sm font-medium outline-none hover:border-foreground/40"
            >
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
      </div>

      {/* ── Results ───────────────────────────────────────────────────── */}
      {isLoading && (
        <div className={cn(view === 'map' ? 'space-y-4' : 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4')}>
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-72 w-full rounded-2xl" />)}
        </div>
      )}
      {isError && <ErrorState message="Couldn’t load cars." retry={() => refetch()} />}
      {data && data.length === 0 && (
        <EmptyState title="No cars match your filters" description="Try widening your search or clearing filters." action={<Button variant="outline" onClick={clear}>Clear filters</Button>} />
      )}

      {data && data.length > 0 && (
        view === 'map' ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_460px] xl:grid-cols-[1fr_560px]">
            <div className="space-y-4">
              {data.map((v) => (
                <VehicleListCard key={v._id} vehicle={v} days={days} dateLabel={dateLabel} />
              ))}
            </div>
            <div className="sticky top-32 hidden h-[calc(100vh-9rem)] overflow-hidden rounded-2xl border border-border lg:block">
              <MapPanel lat={coords!.lat} lng={coords!.lng} label={areaLabel} count={data.length} vehicles={data} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-6">
            {data.map((v) => <VehicleCard key={v._id} vehicle={v} />)}
          </div>
        )
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <SearchInner />
    </Suspense>
  );
}
