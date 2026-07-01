'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, MapPin, ShieldCheck, Zap, Car, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { VehicleCard } from '@/features/vehicles/components/vehicle-card';
import { useTrending } from '@/features/vehicles/hooks';

const CITIES = ['Bangalore', 'Mumbai', 'Delhi'];
const CITY_COORDS: Record<string, { lng: number; lat: number }> = {
  Bangalore: { lng: 77.5946, lat: 12.9716 },
  Mumbai: { lng: 72.8777, lat: 19.076 },
  Delhi: { lng: 77.209, lat: 28.6139 },
};

const CATEGORIES = [
  { key: 'suv', label: 'SUVs', emoji: '🚙' },
  { key: 'luxury', label: 'Luxury', emoji: '✨' },
  { key: 'ev', label: 'Electric', emoji: '⚡' },
  { key: 'economy', label: 'Economy', emoji: '💸' },
  { key: 'van', label: 'Vans', emoji: '🚐' },
  { key: 'sports', label: 'Sports', emoji: '🏎️' },
];

export default function HomePage() {
  const router = useRouter();
  const [city, setCity] = useState('Bangalore');
  const trending = useTrending(CITY_COORDS[city].lng, CITY_COORDS[city].lat);

  return (
    <div className="space-y-20">
      {/* Hero */}
      <section className="relative -mx-4 overflow-hidden px-4 py-20 sm:-mx-6 sm:px-6">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        </div>
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center animate-slide-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-soft">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> The Mobility Operating System
          </span>
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Find your drive with <span className="text-gradient">KIEDO</span>
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Book cars from trusted local hosts. Instant confirmation, flexible pickup, and delivery to
            your door.
          </p>

          {/* Search bar */}
          <div className="mt-2 flex w-full max-w-xl flex-col gap-2 rounded-2xl border border-border bg-card p-2 shadow-card sm:flex-row">
            <div className="flex flex-1 items-center gap-2 px-3">
              <MapPin className="h-5 w-5 shrink-0 text-muted-foreground" />
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="h-11 w-full bg-transparent text-sm focus:outline-none"
              >
                {CITIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <Button size="lg" className="sm:w-auto" onClick={() => router.push(`/search?city=${city}`)}>
              <Search className="h-5 w-5" /> Search cars
            </Button>
          </div>

          {/* Category pills */}
          <div className="hide-scrollbar mt-2 flex w-full gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map((c) => (
              <Link
                key={c.key}
                href={`/search?city=${city}&category=${c.key}`}
                className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium shadow-soft transition-colors hover:border-primary/50 hover:bg-accent"
              >
                <span>{c.emoji}</span> {c.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Trending */}
      <section className="space-y-5">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Trending in {city}</h2>
            <p className="text-muted-foreground">Most-booked cars near you</p>
          </div>
          <Link href={`/search?city=${city}`}>
            <Button variant="ghost">
              View all <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
        {trending.isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-72 w-full" />
            ))}
          </div>
        ) : trending.data && trending.data.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {trending.data.slice(0, 4).map((v) => (
              <VehicleCard key={v._id} vehicle={v} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
            No cars listed yet in {city}. Be the first — <Link href="/host" className="text-primary underline">become a host</Link>.
          </div>
        )}
      </section>

      {/* Value props */}
      <section className="grid gap-5 sm:grid-cols-3">
        {[
          { icon: Zap, title: 'Instant Book', body: 'Reserve verified cars in seconds.' },
          { icon: ShieldCheck, title: 'Trust & Safety', body: 'Verified hosts, insurance, and support.' },
          { icon: Car, title: 'One Platform', body: 'P2P today; fleet, corporate & EV next.' },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border border-border bg-card p-6 shadow-soft">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-soft text-primary">
              <f.icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </section>

      {/* Host CTA */}
      <section className="overflow-hidden rounded-2xl brand-gradient p-8 text-center text-white sm:p-12">
        <h2 className="text-2xl font-bold sm:text-3xl">Turn your car into income</h2>
        <p className="mx-auto mt-2 max-w-lg text-white/90">
          List in minutes, set your own prices, and earn on your schedule.
        </p>
        <Link href="/host" className="mt-6 inline-block">
          <Button size="lg" variant="secondary">
            Become a host <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </section>
    </div>
  );
}
