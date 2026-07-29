'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  SlidersHorizontal, X, Map as MapIcon, CalendarDays, Zap, MapPin, Star, Bell,
  LayoutGrid, Fuel, Cog, Gauge, Car, Gem, Wallet, Truck, Leaf, Users, DollarSign,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { Chip } from '@/components/ui/chip';
import { cn } from '@/lib/utils/cn';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { VehicleCard } from '@/features/vehicles/components/vehicle-card';
import { useVehicleSearch, useFacets } from '@/features/vehicles/hooks';
import { useMutation } from '@tanstack/react-query';
import { savedSearchApi } from '@/features/saved-search/api';
import { useAuthStore } from '@/features/auth/store';
import { LocationSearch } from '@/features/maps/components/location-search';
import { MapPanel } from '@/features/maps/components/map-panel';
import type { SearchParams, SortKey } from '@/features/vehicles/types';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'price_asc', label: 'Price ↑' },
  { key: 'price_desc', label: 'Price ↓' },
  { key: 'rating', label: 'Top rated' },
  { key: 'trending', label: 'Trending' },
];

/** A little visual identity per category / powertrain, with a safe fallback. */
const CATEGORY_ICON: Record<string, LucideIcon> = {
  suv: Truck, ev: Zap, luxury: Gem, economy: Wallet, sedan: Car,
  compact: Car, sports: Gauge, van: Users, truck: Truck, convertible: Car,
};
const FUEL_ICON: Record<string, LucideIcon> = { petrol: Fuel, diesel: Fuel, hybrid: Leaf, ev: Zap };

/** A titled filter group with a subtle panel, so sections read as blocks. */
function FilterGroup({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-muted/20 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </h3>
      {children}
    </section>
  );
}

/** Accent toggle for the popular filters — its own colour so it reads as special. */
function ToggleTag({
  active, onClick, icon: Icon, tone = 'primary', children,
}: {
  active: boolean; onClick: () => void; icon: LucideIcon;
  tone?: 'primary' | 'amber'; children: React.ReactNode;
}) {
  const tones = {
    primary: 'border-primary/40 bg-primary/10 text-primary',
    amber: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-500',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-all active:scale-95',
        active
          ? cn(tones[tone], 'shadow-soft')
          : 'border-border/70 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" /> {children}
    </button>
  );
}

function SearchInner() {
  const qp = useSearchParams();
  // Cities and categories mirror live supply — see /search/facets.
  const facets = useFacets();
  const cities = facets.data?.cities ?? [];
  const categories = facets.data?.categories ?? [];
  const status = useAuthStore((s) => s.status);
  const saveSearch = useMutation({ mutationFn: savedSearchApi.create });
  const [cityChoice, setCity] = useState(qp.get('city') ?? '');
  const activeCity = cities.find((c) => c.city === cityChoice) ?? cities[0];
  const city = activeCity?.city ?? cityChoice;
  const [category, setCategory] = useState(qp.get('category') ?? '');
  const [fuelType, setFuelType] = useState('');
  const [transmission, setTransmission] = useState('');
  const [instantBook, setInstantBook] = useState(false);
  const [delivery, setDelivery] = useState(false);
  const [seatsMin, setSeatsMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [ratingMin, setRatingMin] = useState(0);
  const [sort, setSort] = useState<SortKey>('relevance');
  const [showFilters, setShowFilters] = useState(true);
  const [center, setCenter] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [showMap, setShowMap] = useState(false);

  // Dates come from the hero search widget — they drive availability filtering
  // server-side, so a car that's already booked never appears.
  const start = qp.get('start') ?? undefined;
  const end = qp.get('end') ?? undefined;

  const coords = center
    ? { lat: center.lat, lng: center.lng }
    : activeCity
      ? { lat: activeCity.lat, lng: activeCity.lng }
      : undefined;
  const areaLabel = center ? center.label : city;

  // No origin yet (facets still loading, or the marketplace has no supply) —
  // pass null so the query stays idle rather than searching 0,0.
  const params: SearchParams | null = coords
    ? {
    ...coords,
    radiusKm: 50,
    start,
    end,
    category: category || undefined,
    fuelType: (fuelType as SearchParams['fuelType']) || undefined,
    transmission: (transmission as SearchParams['transmission']) || undefined,
    instantBook: instantBook || undefined,
    delivery: delivery || undefined,
    seatsMin: seatsMin ? Number(seatsMin) : undefined,
    priceMax: priceMax ? Number(priceMax) * 100 : undefined,
    ratingMin: ratingMin || undefined,
    sort,
    limit: 24,
      }
    : null;

  const { data, isLoading, isError, refetch, isFetching } = useVehicleSearch(params);

  const activeCount = [category, fuelType, transmission, instantBook, delivery, seatsMin, priceMax, ratingMin].filter(Boolean).length;
  const clear = () => {
    setCategory(''); setFuelType(''); setTransmission(''); setInstantBook(false);
    setDelivery(false); setSeatsMin(''); setPriceMax(''); setRatingMin(0);
  };

  const dateLabel =
    start && end
      ? `${new Date(start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
      : null;

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="display text-display-sm">Cars in {areaLabel}</h1>
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
              <Bell className="h-4 w-4" /> {saveSearch.isSuccess ? 'Saved — we’ll alert you' : 'Save search & alert me'}
            </Button>
          )}
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground">
          <span>{isFetching ? 'Searching…' : `${data?.length ?? 0} cars available`}</span>
          {dateLabel && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground">
              <CalendarDays className="h-3.5 w-3.5" /> {dateLabel}
            </span>
          )}
        </p>
      </div>

      {/* Sticky toolbar */}
      {/* Sticky toolbar */}
      <div className="sticky top-20 z-20 -mx-4 border-y border-border/40 bg-background/80 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full sm:w-auto flex-1 max-w-sm">
            <LocationSearch onPick={setCenter} placeholder="Search a city or place…" />
          </div>
          
          <div className="relative group w-[calc(50%-0.375rem)] sm:w-auto shrink-0">
            <select 
              value={city} 
              onChange={(e) => { setCity(e.target.value); setCenter(null); }} 
              className="appearance-none h-11 w-full rounded-full border border-border/60 bg-card px-5 pr-10 text-sm font-medium focus:border-foreground focus:ring-1 focus:ring-foreground focus:outline-none transition-all hover:border-border cursor-pointer shadow-none"
            >
              {cities.length === 0 && <option>{facets.isPending ? 'Loading…' : 'No cities yet'}</option>}
              {cities.map((c) => <option key={c.city} value={c.city}>{c.city} ({c.vehicles})</option>)}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-muted-foreground group-hover:text-foreground">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>

          <div className="relative group w-[calc(50%-0.375rem)] sm:w-auto shrink-0">
            <select 
              value={sort} 
              onChange={(e) => setSort(e.target.value as SortKey)} 
              className="appearance-none h-11 w-full rounded-full border border-border/60 bg-card px-5 pr-10 text-sm font-medium focus:border-foreground focus:ring-1 focus:ring-foreground focus:outline-none transition-all hover:border-border cursor-pointer shadow-none"
            >
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-muted-foreground group-hover:text-foreground">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>

          <div className="flex w-full sm:w-auto gap-3 shrink-0">
            <Button 
              variant={showFilters ? 'secondary' : 'outline'} 
              className="flex-1 sm:flex-none rounded-full h-11 px-6 transition-all duration-300 hover:bg-accent border-border/60 hover:border-border font-medium text-sm" 
              onClick={() => setShowFilters((s) => !s)}
            >
              <SlidersHorizontal className="h-4 w-4 mr-2" /> 
              Filters {activeCount > 0 && <span className="ml-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">{activeCount}</span>}
            </Button>
            
            <Button 
              variant={showMap ? 'secondary' : 'outline'} 
              className="flex-1 sm:flex-none rounded-full h-11 px-6 transition-all duration-300 hover:bg-accent border-border/60 hover:border-border font-medium text-sm lg:hidden" 
              onClick={() => setShowMap((s) => !s)}
            >
              <MapIcon className="h-4 w-4 mr-2" /> {showMap ? 'List' : 'Map'}
            </Button>
            <Button 
              variant={showMap ? 'secondary' : 'outline'} 
              className="hidden lg:flex flex-1 sm:flex-none rounded-full h-11 px-6 transition-all duration-300 hover:bg-accent border-border/60 hover:border-border font-medium text-sm" 
              onClick={() => setShowMap((s) => !s)}
            >
              <MapIcon className="h-4 w-4 mr-2" /> Map
            </Button>
          </div>
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="animate-slide-up rounded-3xl border border-border/60 bg-card p-5 shadow-soft sm:p-7">
          <div className="mx-auto grid max-w-6xl gap-6">

            {/* Category */}
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <LayoutGrid className="h-4 w-4 text-primary" /> Category
              </h3>
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">No categories available yet.</p>
              ) : (
                <div className="hide-scrollbar flex gap-2.5 overflow-x-auto pb-1">
                  {categories.map((c) => {
                    const Icon = CATEGORY_ICON[c.category.toLowerCase()] ?? Car;
                    const on = category === c.category;
                    return (
                      <button
                        key={c.category}
                        type="button"
                        onClick={() => setCategory(on ? '' : c.category)}
                        className={cn(
                          'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl border px-4 py-2.5 text-sm font-medium capitalize transition-all active:scale-95',
                          on
                            ? 'border-primary bg-primary text-primary-foreground shadow-soft'
                            : 'border-border/70 bg-background text-foreground hover:border-primary/50 hover:bg-accent',
                        )}
                      >
                        <Icon className={cn('h-4 w-4', !on && 'text-muted-foreground')} />
                        {c.category}
                        <span
                          className={cn(
                            'rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums',
                            on ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {c.vehicles}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Spec groups */}
            <div className="grid gap-4 md:grid-cols-3">
              <FilterGroup icon={Fuel} title="Powertrain">
                <div className="flex flex-wrap gap-2">
                  {['petrol', 'diesel', 'hybrid', 'ev'].map((f) => {
                    const Icon = FUEL_ICON[f] ?? Fuel;
                    return (
                      <Chip key={f} active={fuelType === f} onClick={() => setFuelType(fuelType === f ? '' : f)} className="px-3.5 py-2 capitalize">
                        <Icon className="h-3.5 w-3.5" /> {f}
                      </Chip>
                    );
                  })}
                </div>
              </FilterGroup>

              <FilterGroup icon={Cog} title="Transmission">
                <div className="flex flex-wrap gap-2">
                  {['automatic', 'manual'].map((t) => (
                    <Chip key={t} active={transmission === t} onClick={() => setTransmission(transmission === t ? '' : t)} className="px-3.5 py-2 capitalize">{t}</Chip>
                  ))}
                </div>
              </FilterGroup>

              <FilterGroup icon={Gauge} title="Limits">
                <div className="flex gap-2.5">
                  <label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-border/70 bg-background px-3 transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                    <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <input type="number" min={1} value={seatsMin} onChange={(e) => setSeatsMin(e.target.value)} placeholder="Seats" className="w-full min-w-0 bg-transparent text-sm outline-none" />
                  </label>
                  <label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-border/70 bg-background px-3 transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                    <DollarSign className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <input type="number" min={0} value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="Max/day" className="w-full min-w-0 bg-transparent text-sm outline-none" />
                  </label>
                </div>
              </FilterGroup>
            </div>

            {/* Popular toggles */}
            <div className="flex flex-wrap items-center gap-2.5 border-t border-border/60 pt-5">
              <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Popular</span>
              <ToggleTag active={instantBook} onClick={() => setInstantBook((v) => !v)} icon={Zap} tone="amber">Instant Book</ToggleTag>
              <ToggleTag active={delivery} onClick={() => setDelivery((v) => !v)} icon={MapPin} tone="primary">Delivery</ToggleTag>
              <ToggleTag active={ratingMin === 4} onClick={() => setRatingMin(ratingMin === 4 ? 0 : 4)} icon={Star} tone="amber">4.0+ rated</ToggleTag>

              {activeCount > 0 && (
                <button
                  onClick={clear}
                  className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-destructive"
                >
                  <X className="h-4 w-4" /> Clear all ({activeCount})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 pb-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-80 w-full rounded-3xl" />
          ))}
        </div>
      )}
      {isError && <ErrorState message="Couldn't load cars." retry={() => refetch()} />}
      {data && data.length === 0 && (
        <EmptyState title="No cars match your filters" description="Try widening your search or clearing filters." action={<Button variant="outline" onClick={clear}>Clear filters</Button>} />
      )}
      {data && data.length > 0 && (
        showMap ? (
          <div className="flex flex-col lg:grid gap-6 lg:grid-cols-[1fr_400px] xl:grid-cols-[1.5fr_500px]">
            <div className="hidden lg:grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 pb-4">
              {data.map((v) => (
                <VehicleCard key={v._id} vehicle={v} />
              ))}
            </div>
            {/* On mobile, when map is open, we show only the map and a horizontal scroll of cards overlaying it, or just the map */}
            <div className="sticky top-[140px] h-[calc(100vh-160px)] rounded-3xl overflow-hidden border border-border/40 shadow-lg">
              <MapPanel lat={coords!.lat} lng={coords!.lng} label={areaLabel} count={data.length} vehicles={data} />
              <div className="absolute bottom-6 left-0 right-0 lg:hidden flex overflow-x-auto gap-4 px-4 pb-2 hide-scrollbar snap-x snap-mandatory">
                {data.map((v) => (
                  <div key={v._id} className="w-[85vw] max-w-[320px] shrink-0 snap-center">
                    <VehicleCard vehicle={v} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 pb-6">
            {data.map((v) => (
              <VehicleCard key={v._id} vehicle={v} />
            ))}
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
