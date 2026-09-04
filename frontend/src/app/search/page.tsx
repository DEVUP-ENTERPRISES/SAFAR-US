'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import {
  SlidersHorizontal, X, Map as MapIcon, LayoutGrid, ChevronDown, Zap, Star, Bell,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Select } from '@/components/ui/select';
import { VehicleCard } from '@/features/vehicles/components/vehicle-card';
import { VehicleListCard } from '@/features/vehicles/components/vehicle-list-card';
import { useVehicleSearch, useFacets, useFilterCounts } from '@/features/vehicles/hooks';
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
/** Stored value -> what a US guest actually calls it. */
const FUEL_LABEL: Record<(typeof FUELS)[number], string> = {
  petrol: 'Gas', diesel: 'Diesel', hybrid: 'Hybrid', ev: 'Electric',
};
const SEAT_OPTIONS = [2, 4, 5, 7];

/** A filter "pill" that opens a small popover, Turo-style. Closes on outside click. */
/**
 * A filter pill with a dropdown panel.
 *
 * The panel is rendered through a portal, positioned to the button, rather than
 * absolutely inside it. The filter bar scrolls horizontally, and a scroll
 * container clips on BOTH axes — an absolutely-positioned panel inside it was
 * being cut off entirely, so clicking a filter appeared to do nothing. A
 * portalled, fixed-position panel escapes the clip and follows the button.
 */
function FilterDropdown({
  label, active, width = 300, children,
}: {
  label: React.ReactNode; active?: boolean; width?: number;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Anchor the panel under the button, nudged back inside the viewport when it
  // would spill off the right edge (the last pills sit near it).
  const place = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const w = Math.min(width, window.innerWidth * 0.92);
    setPos({ top: b.bottom + 8, left: Math.max(8, Math.min(b.left, window.innerWidth - w - 8)) });
  }, [width]);

  useEffect(() => {
    if (!open) return;
    place();
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    // `true` — catch the bar's own horizontal scroll, which does not bubble.
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors',
          active ? 'border-foreground bg-foreground text-background' : 'border-border bg-card hover:border-foreground/50',
        )}
      >
        {label}
        <ChevronDown className={cn('h-4 w-4 opacity-60 transition-transform', open && 'rotate-180')} />
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[60] animate-slide-up rounded-2xl border border-border bg-card p-4 shadow-xl"
          style={{ top: pos.top, left: pos.left, width: Math.min(width, window.innerWidth * 0.92) }}
        >
          {children(() => setOpen(false))}
        </div>,
        document.body,
      )}
    </>
  );
}

/** A pill option inside a dropdown. */
/**
 * A filter option, with how many cars it would return.
 *
 * An option that leads nowhere is disabled rather than offered — discovering an
 * empty result by clicking is the single most tedious part of car search. A
 * count of `undefined` means we have no data yet, so the option stays live
 * rather than being wrongly greyed out while the counts load.
 */
function Opt({
  on,
  onClick,
  count,
  children,
}: {
  on: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  const empty = count === 0 && !on;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={empty}
      title={empty ? 'No cars match this in your area' : undefined}
      className={cn(
        'rounded-full border px-3.5 py-2 text-sm font-medium capitalize transition-colors',
        on
          ? 'border-primary bg-primary text-primary-foreground'
          : empty
            ? 'cursor-not-allowed border-border/60 bg-muted/40 text-muted-foreground/50'
            : 'border-border bg-background hover:border-primary/50',
      )}
    >
      {children}
      {count !== undefined && (
        <span className={cn('ms-1.5 text-xs tabular-nums', on ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
          {count}
        </span>
      )}
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

  // Filters — seeded from the URL, so a shared or bookmarked search opens with
  // the same results the sender saw, and Back after opening a car restores the
  // filters instead of dumping the guest into an unfiltered list.
  const [category, setCategory] = useState(qp.get('category') ?? '');
  const [make, setMake] = useState(qp.get('make') ?? '');
  const [fuelType, setFuelType] = useState(qp.get('fuel') ?? '');
  const [transmission, setTransmission] = useState(qp.get('transmission') ?? '');
  const [instantBook, setInstantBook] = useState(qp.get('instant') === '1');
  const [delivery, setDelivery] = useState(qp.get('delivery') === '1');
  const [seatsMin, setSeatsMin] = useState(qp.get('seats') ?? '');
  const [priceMin, setPriceMin] = useState(qp.get('priceMin') ?? '');
  const [priceMax, setPriceMax] = useState(qp.get('priceMax') ?? '');
  const [yearMin, setYearMin] = useState(qp.get('yearMin') ?? '');
  const [yearMax, setYearMax] = useState(qp.get('yearMax') ?? '');
  const [ratingMin, setRatingMin] = useState(Number(qp.get('rating') ?? 0));
  const [sort, setSort] = useState<SortKey>((qp.get('sort') as SortKey) ?? 'relevance');
  const [view, setView] = useState<'grid' | 'map'>(qp.get('view') === 'map' ? 'map' : 'grid');

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const startIso = toIso(fromDate, fromTime);
  const endIso = toIso(untilDate, untilTime);
  const bothDates = !!(startIso && endIso);
  const days = bothDates ? Math.max(1, Math.ceil((+new Date(endIso!) - +new Date(startIso!)) / 86_400_000)) : undefined;
  
  // Wait until mounted to format dates using the client's locale to avoid hydration mismatch errors
  const dateLabel =
    bothDates && mounted
      ? `${new Date(startIso!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(endIso!).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
      : bothDates
      ? ''
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
  // Counts share the search's params, so every option shows what picking it
  // would actually return rather than making the guest find out by clicking.
  const counts = useFilterCounts(params).data;

  const activeCount = [category, make, fuelType, transmission, instantBook, delivery, seatsMin, priceMin, priceMax, yearMin, yearMax, ratingMin].filter(Boolean).length;

  /*
   * Mirror the filters into the address bar.
   *
   * replaceState rather than router.replace: this fires on every keystroke in
   * the price boxes, and pushing through the router would re-render the tree
   * and stack up history entries the Back button then has to chew through.
   * Only the URL string needs to change — React already holds the truth.
   */
  useEffect(() => {
    const q = new URLSearchParams();
    const put = (k: string, v: string | number | boolean | undefined) => {
      if (v === '' || v === false || v === 0 || v === undefined) return;
      q.set(k, String(v === true ? 1 : v));
    };
    put('city', city);
    put('category', category);
    put('make', make.trim());
    put('fuel', fuelType);
    put('transmission', transmission);
    put('instant', instantBook);
    put('delivery', delivery);
    put('seats', seatsMin);
    put('priceMin', priceMin);
    put('priceMax', priceMax);
    put('yearMin', yearMin);
    put('yearMax', yearMax);
    put('rating', ratingMin);
    if (sort !== 'relevance') q.set('sort', sort);
    if (view !== 'grid') q.set('view', view);

    const qs = q.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [city, category, make, fuelType, transmission, instantBook, delivery, seatsMin, priceMin, priceMax, yearMin, yearMax, ratingMin, sort, view]);
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
                        <Opt key={t} on={transmission === t} count={counts?.transmission[t]} onClick={() => setTransmission(transmission === t ? '' : t)}>{t}</Opt>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-semibold">Minimum rating</p>
                    <div className="flex flex-wrap gap-2">
                      {[4, 4.5].map((r) => (
                        <Opt key={r} on={ratingMin === r} onClick={() => setRatingMin(ratingMin === r ? 0 : r)}>
                          <Star className="me-1 inline h-3.5 w-3.5 fill-current" />{r}+
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
                    <input type="number" min={0} value={priceMin} onChange={(e) => setPriceMin(e.target.value)} placeholder="Min $" className="outline-none focus:border-primary" />
                    <span className="text-muted-foreground">–</span>
                    <input type="number" min={0} value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="Max $" className="outline-none focus:border-primary" />
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
                    <Opt key={c.category} on={category === c.category} count={counts?.category[c.category]} onClick={() => setCategory(category === c.category ? '' : c.category)}>
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
                  <input value={make} onChange={(e) => setMake(e.target.value)} placeholder="e.g. Tesla, BMW" className="outline-none focus:border-primary" />
                </div>
              )}
            </FilterDropdown>

            {/* Years */}
            <FilterDropdown label="Years" active={!!(yearMin || yearMax)} width={260}>
              {() => (
                <div>
                  <p className="mb-2 text-sm font-semibold">Year</p>
                  <div className="flex items-center gap-2">
                    <input type="number" min={1990} max={2100} value={yearMin} onChange={(e) => setYearMin(e.target.value)} placeholder="From" className="outline-none focus:border-primary" />
                    <span className="text-muted-foreground">–</span>
                    <input type="number" min={1990} max={2100} value={yearMax} onChange={(e) => setYearMax(e.target.value)} placeholder="To" className="outline-none focus:border-primary" />
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
                      <Opt key={s} on={seatsMin === String(s)} count={counts?.seats[String(s)]} onClick={() => setSeatsMin(seatsMin === String(s) ? '' : String(s))}>{s}+</Opt>
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
                    <Opt key={f} on={fuelType === f} count={counts?.fuelType[f]} onClick={() => setFuelType(fuelType === f ? '' : f)}>
                      {f === 'ev' ? <><Zap className="me-1 inline h-3.5 w-3.5" />Electric</> : FUEL_LABEL[f]}
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

          {/* Grid / Map toggle (Desktop) */}
          <div className="hidden md:flex shrink-0 rounded-full border border-border bg-card p-1">
            <button
              onClick={() => setView('grid')}
              className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors', view === 'grid' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
            >
              <LayoutGrid className="h-4 w-4" /> <span>Grid</span>
            </button>
            <button
              onClick={() => setView('map')}
              className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors', view === 'map' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
            >
              <MapIcon className="h-4 w-4" /> <span>Map</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Count + sort + save ───────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-2 mb-2">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
          {isFetching ? 'Searching…' : `${data?.length ?? 0} cars available`}
          <span className="block sm:inline sm:ms-2 text-sm sm:text-base font-medium text-muted-foreground mt-1 sm:mt-0">in {areaLabel}</span>
        </h1>
        <div className="flex items-center gap-2 self-start sm:self-auto w-full sm:w-auto">
          {status === 'authenticated' && (
            <Button
              variant="outline"
              size="sm"
              loading={saveSearch.isPending}
              className="flex-1 sm:flex-none h-10 sm:h-9"
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
          <div className="relative flex-1 sm:flex-none">
            <Select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-10 sm:h-9 w-full sm:w-auto cursor-pointer appearance-none rounded-full border border-border bg-card ps-4 pe-9 text-sm font-medium outline-none hover:border-foreground/40"
            >
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
            <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
            <div className="sticky top-32 h-[calc(100vh-9rem)] overflow-hidden rounded-2xl border border-border hidden md:block">
              <MapPanel lat={coords!.lat} lng={coords!.lng} label={areaLabel} count={data.length} vehicles={data} />
            </div>
            {/* Mobile Map Render when view is map */}
            <div className="fixed inset-0 z-40 md:hidden mt-[140px] bg-background">
               <MapPanel lat={coords!.lat} lng={coords!.lng} label={areaLabel} count={data.length} vehicles={data} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-20 md:pb-6">
            {data.map((v) => <VehicleCard key={v._id} vehicle={v} />)}
          </div>
        )
      )}

      {/* Floating Map/Grid Toggle (Mobile) */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 md:hidden">
        <button
          onClick={() => setView(view === 'grid' ? 'map' : 'grid')}
          className="flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-bold text-background shadow-2xl hover:bg-foreground/90 transition-transform active:scale-95"
        >
          {view === 'grid' ? (
            <><MapIcon className="h-5 w-5" /> Map</>
          ) : (
            <><LayoutGrid className="h-5 w-5" /> List</>
          )}
        </button>
      </div>
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
