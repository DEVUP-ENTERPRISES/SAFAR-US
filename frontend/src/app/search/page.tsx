'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Chip } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { VehicleCard } from '@/features/vehicles/components/vehicle-card';
import { useVehicleSearch } from '@/features/vehicles/hooks';
import type { SearchParams, SortKey } from '@/features/vehicles/types';

const CITIES: Record<string, { lng: number; lat: number }> = {
  Bangalore: { lng: 77.5946, lat: 12.9716 },
  Mumbai: { lng: 72.8777, lat: 19.076 },
  Delhi: { lng: 77.209, lat: 28.6139 },
};
const CATEGORIES = ['economy', 'luxury', 'suv', 'van', 'sports', 'ev'];
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'price_asc', label: 'Price ↑' },
  { key: 'price_desc', label: 'Price ↓' },
  { key: 'rating', label: 'Top rated' },
  { key: 'trending', label: 'Trending' },
];

function SearchInner() {
  const qp = useSearchParams();
  const [city, setCity] = useState(qp.get('city') && CITIES[qp.get('city')!] ? qp.get('city')! : 'Bangalore');
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

  const params: SearchParams = {
    ...CITIES[city],
    radiusKm: 50,
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
  };

  const { data, isLoading, isError, refetch, isFetching } = useVehicleSearch(params);

  const activeCount = [category, fuelType, transmission, instantBook, delivery, seatsMin, priceMax, ratingMin].filter(Boolean).length;
  const clear = () => {
    setCategory(''); setFuelType(''); setTransmission(''); setInstantBook(false);
    setDelivery(false); setSeatsMin(''); setPriceMax(''); setRatingMin(0);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cars in {city}</h1>
          <p className="text-sm text-muted-foreground">
            {isFetching ? 'Searching…' : `${data?.length ?? 0} cars available`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {Object.keys(CITIES).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => setShowFilters((s) => !s)}>
            <SlidersHorizontal className="h-4 w-4" /> Filters{activeCount > 0 ? ` (${activeCount})` : ''}
          </Button>
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-soft animate-scale-in">
          <div>
            <p className="mb-2 text-sm font-medium">Category</p>
            <div className="hide-scrollbar flex gap-2 overflow-x-auto">
              {CATEGORIES.map((c) => (
                <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? '' : c)} className="capitalize">
                  {c}
                </Chip>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="mb-2 text-sm font-medium">Fuel</p>
              <div className="flex flex-wrap gap-2">
                {['petrol', 'diesel', 'hybrid', 'ev'].map((f) => (
                  <Chip key={f} active={fuelType === f} onClick={() => setFuelType(fuelType === f ? '' : f)} className="capitalize">{f}</Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Transmission</p>
              <div className="flex flex-wrap gap-2">
                {['automatic', 'manual'].map((t) => (
                  <Chip key={t} active={transmission === t} onClick={() => setTransmission(transmission === t ? '' : t)} className="capitalize">{t}</Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Min seats</p>
              <Input type="number" value={seatsMin} onChange={(e) => setSeatsMin(e.target.value)} placeholder="Any" />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Max ₹/day</p>
              <Input type="number" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="Any" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Chip active={instantBook} onClick={() => setInstantBook((v) => !v)}>⚡ Instant book</Chip>
            <Chip active={delivery} onClick={() => setDelivery((v) => !v)}>Delivery available</Chip>
            <Chip active={ratingMin === 4} onClick={() => setRatingMin(ratingMin === 4 ? 0 : 4)}>★ 4.0+</Chip>
            {activeCount > 0 && (
              <button onClick={clear} className="ml-auto flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" /> Clear all
              </button>
            )}
          </div>
        </div>
      )}

      {/* Results */}
      {isLoading && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full" />
          ))}
        </div>
      )}
      {isError && <ErrorState message="Couldn't load cars." retry={() => refetch()} />}
      {data && data.length === 0 && (
        <EmptyState title="No cars match your filters" description="Try widening your search or clearing filters." action={<Button variant="outline" onClick={clear}>Clear filters</Button>} />
      )}
      {data && data.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.map((v) => (
            <VehicleCard key={v._id} vehicle={v} />
          ))}
        </div>
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
