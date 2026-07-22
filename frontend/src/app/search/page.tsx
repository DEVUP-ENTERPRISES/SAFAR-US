'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SlidersHorizontal, X, Map as MapIcon, CalendarDays, Zap, MapPin, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { Chip } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { VehicleCard } from '@/features/vehicles/components/vehicle-card';
import { useVehicleSearch, useFacets } from '@/features/vehicles/hooks';
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

function SearchInner() {
  const qp = useSearchParams();
  // Cities and categories mirror live supply — see /search/facets.
  const facets = useFacets();
  const cities = facets.data?.cities ?? [];
  const categories = facets.data?.categories ?? [];
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
        <h1 className="display text-display-sm">Cars in {areaLabel}</h1>
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
        <div className="overflow-hidden border-t border-border bg-card p-6 sm:p-8 animate-slide-up shadow-sm mb-6 rounded-b-2xl">
          <div className="grid gap-10 md:grid-cols-12 max-w-7xl mx-auto">
            
            {/* Category */}
            <div className="md:col-span-12">
              <h3 className="mb-4 text-base font-semibold text-foreground">Category</h3>
              <div className="hide-scrollbar flex gap-3 overflow-x-auto pb-2">
                {categories.length === 0 && (
                  <p className="text-sm text-muted-foreground">No categories available yet.</p>
                )}
                {categories.map((c) => (
                  <Chip
                    key={c.category}
                    active={category === c.category}
                    onClick={() => setCategory(category === c.category ? '' : c.category)}
                    className="capitalize px-5 py-2.5 hover:scale-105 active:scale-95 shrink-0 text-sm font-medium"
                  >
                    {c.category}
                    <span className="ml-1.5 opacity-60 font-normal">{c.vehicles}</span>
                  </Chip>
                ))}
              </div>
            </div>

            <div className="h-px bg-border/60 md:col-span-12" />

            {/* Core Specs */}
            <div className="md:col-span-4 space-y-4">
              <h3 className="text-base font-semibold text-foreground">Powertrain</h3>
              <div className="flex flex-wrap gap-3">
                {['petrol', 'diesel', 'hybrid', 'ev'].map((f) => (
                  <Chip key={f} active={fuelType === f} onClick={() => setFuelType(fuelType === f ? '' : f)} className="capitalize shrink-0 px-4 py-2 font-medium">{f}</Chip>
                ))}
              </div>
            </div>

            <div className="md:col-span-4 space-y-4">
              <h3 className="text-base font-semibold text-foreground">Transmission</h3>
              <div className="flex flex-wrap gap-3">
                {['automatic', 'manual'].map((t) => (
                  <Chip key={t} active={transmission === t} onClick={() => setTransmission(transmission === t ? '' : t)} className="capitalize shrink-0 px-4 py-2 font-medium">{t}</Chip>
                ))}
              </div>
            </div>

            <div className="md:col-span-4 space-y-4">
              <h3 className="text-base font-semibold text-foreground">Limits</h3>
              <div className="flex gap-3">
                <div className="flex-1 flex items-center gap-2 rounded-xl border border-border/80 bg-background px-4 h-11 focus-within:ring-2 focus-within:ring-foreground focus-within:border-foreground transition-all">
                  <span className="text-muted-foreground text-sm font-medium shrink-0">Seats+</span>
                  <input type="number" value={seatsMin} onChange={(e) => setSeatsMin(e.target.value)} placeholder="Any" className="flex-1 bg-transparent outline-none text-sm min-w-0" />
                </div>
                <div className="flex-1 flex items-center gap-2 rounded-xl border border-border/80 bg-background px-4 h-11 focus-within:ring-2 focus-within:ring-foreground focus-within:border-foreground transition-all">
                  <span className="text-muted-foreground text-sm font-medium shrink-0">Max $</span>
                  <input type="number" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="Any" className="flex-1 bg-transparent outline-none text-sm min-w-0" />
                </div>
              </div>
            </div>

            <div className="h-px bg-border/60 md:col-span-12" />

            {/* Quick Filters */}
            <div className="md:col-span-12 flex flex-wrap items-center gap-3">
              <Chip active={instantBook} onClick={() => setInstantBook((v) => !v)} className="shrink-0 px-4 py-2 ring-1 ring-yellow-500/20 data-[active=true]:bg-yellow-500/10 data-[active=true]:text-yellow-600 data-[active=true]:border-yellow-500/50">
                <Zap className="h-4 w-4 mr-1.5" /> Instant book
              </Chip>
              <Chip active={delivery} onClick={() => setDelivery((v) => !v)} className="shrink-0 px-4 py-2">
                <MapPin className="h-4 w-4 mr-1.5" /> Delivery available
              </Chip>
              <Chip active={ratingMin === 4} onClick={() => setRatingMin(ratingMin === 4 ? 0 : 4)} className="shrink-0 px-4 py-2 ring-1 ring-amber-500/20 data-[active=true]:bg-amber-500/10 data-[active=true]:text-amber-600 data-[active=true]:border-amber-500/50">
                <Star className="h-4 w-4 mr-1.5" /> 4.0+ Rated
              </Chip>
              
              {activeCount > 0 && (
                <button onClick={clear} className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-destructive hover:text-destructive/80 transition-colors px-4 py-2 rounded-full shrink-0">
                  <X className="h-4 w-4" /> Clear all
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
