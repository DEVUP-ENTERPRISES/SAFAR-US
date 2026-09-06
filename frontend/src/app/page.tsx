'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ShieldCheck, Zap, Sparkles, ArrowRight, Star, CarFront, KeyRound, Route, BadgeCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/ui/reveal';
import { Skeleton } from '@/components/ui/skeleton';
import { VehicleCard } from '@/features/vehicles/components/vehicle-card';
import { SearchBarFields } from '@/features/search/search-bar-fields';
import { CategoryCarousel } from '@/features/vehicles/components/category-carousel';
import { useTrending, useRecommendations, useFacets } from '@/features/vehicles/hooks';
import { useAuthStore } from '@/features/auth/store';
import { useIsHost } from '@/features/host/hooks';


const STEPS = [
  { icon: CarFront, title: 'Find the one', body: 'Browse verified cars from local hosts. Filter by price, features, or delivery.' },
  { icon: KeyRound, title: 'Book in seconds', body: 'Instant Book cars confirm immediately. No back-and-forth, no waiting.' },
  { icon: Route, title: 'Hit the road', body: 'Pick it up, or have it delivered to your door, hotel, or the airport.' },
];

export default function HomePage() {
  // Cities, categories and the trust numbers all come from live supply.
  const facets = useFacets();
  const cities = facets.data?.cities ?? [];
  const [picked, setCity] = useState('');
  const active = cities.find((c) => c.city === picked) ?? cities[0];
  const city = active?.city ?? '';
  const trending = useTrending(active?.lng, active?.lat);
  const user = useAuthStore((s) => s.user);
  const isHost = useIsHost();
  const forYou = useRecommendations(!!user);
  const stats = facets.data?.stats;

  return (
    <div className="-mt-24">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="full-bleed relative isolate grain overflow-hidden hero-mesh">
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-24 sm:px-6 sm:pb-24 sm:pt-32">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-bold tracking-widest uppercase text-white/95 backdrop-blur-md shadow-soft">
              <Sparkles className="h-4 w-4" /> The Mobility Operating System
            </span>

            {/* The display face, and no gradient-to-transparent: that trick
                is everywhere, and it throws away contrast on the one line the
                whole page is built around. */}
            <h1 className="display mt-8 text-[3.1rem] leading-[0.95] text-white sm:text-[4.6rem] lg:text-[5.6rem]">
              Drive away
              <br />
              certain.
            </h1>

            <p className="mt-7 max-w-xl text-lg font-medium leading-relaxed text-white/75 sm:text-xl">
              Real cars from local hosts, delivered where you need them — with three promises no
              other rental makes.
            </p>
          </div>

          {/*
            One search bar, not two.

            The hero ran its own widget — a native <select> listing cities with
            a "(1)" vehicle count after each, and two native date inputs
            rendering dd-mm-yyyy in an OS-drawn picker. The navbar and the
            search page had already moved to SearchBarFields, so the product
            had two search implementations that looked and behaved differently
            depending on which one you happened to hit first.

            The counts went with it. A city offering one car reads as an empty
            marketplace, and the number is not what anyone is choosing on.
          */}
          <div className="mt-10 max-w-4xl animate-slide-up">
            <SearchBarFields />
          </div>

          {/* The three promises, stated on the first screen. Each one is a
              shipped mechanic, not a marketing line. */}
          <div className="mt-11 grid max-w-4xl gap-px overflow-hidden rounded-2xl border border-white/15 bg-white/10 sm:grid-cols-3">
            {[
              {
                t: 'Your host cancels, you still drive',
                d: 'We put you in a comparable car and cover the price difference.',
              },
              {
                t: 'A finished trip stays finished',
                d: 'Damage must be reported within 72 hours, with photos. After that, nothing.',
              },
              {
                t: 'Reviews written blind',
                d: 'Neither side sees the other until both are in. Nobody can retaliate.',
              },
            ].map((p) => (
              <div key={p.t} className="bg-[hsl(var(--ink))]/70 p-5 backdrop-blur-sm">
                <p className="text-[15px] font-semibold leading-snug text-white">{p.t}</p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/60">{p.d}</p>
              </div>
            ))}
          </div>

          {/* Live marketplace numbers — supporting evidence, not the pitch. */}
          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-white/55">
            {stats && stats.ratingAvg !== null && (
              <span className="flex items-center gap-2">
                <Star className="h-4 w-4 fill-white/70 text-white/70" />
                {stats.ratingAvg} average from {stats.ratingCount.toLocaleString()} trip
                {stats.ratingCount === 1 ? '' : 's'}
              </span>
            )}
            {!!stats?.verifiedHosts && (
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> {stats.verifiedHosts.toLocaleString()} verified host
                {stats.verifiedHosts === 1 ? '' : 's'}
              </span>
            )}
            {!!stats?.instantBook && (
              <span className="flex items-center gap-2">
                <Zap className="h-4 w-4" /> {stats.instantBook.toLocaleString()} car
                {stats.instantBook === 1 ? '' : 's'} on Instant Book
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="space-y-24 py-16">
        {/* ── Browse by category ─────────────────────────────────────── */}
        <Reveal as="section" className="space-y-6">
          <div>
            <h2 className="display text-display-sm">Browse by style</h2>
            <p className="mt-2 text-muted-foreground">Whatever the trip calls for.</p>
          </div>
          <CategoryCarousel city={city} />
        </Reveal>

        {/* ── For You (personalized) ─────────────────────────────────── */}
        {user && forYou.data && forYou.data.length > 0 && (
          <Reveal as="section" className="space-y-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="display flex items-center gap-2.5 text-display-sm">
                  <Sparkles className="h-7 w-7 text-primary" /> For you
                </h2>
                <p className="mt-2 text-muted-foreground">Picked from the cars you&apos;ve loved.</p>
              </div>
            </div>
            <div className="flex overflow-x-auto snap-x snap-mandatory hide-scrollbar gap-4 pb-4 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-6 sm:pb-0">
              {forYou.data.slice(0, 4).map((v) => (
                <VehicleCard key={v._id} vehicle={v} className="w-[85vw] shrink-0 snap-center sm:w-auto" />
              ))}
            </div>
          </Reveal>
        )}

        {/* ── Trending ───────────────────────────────────────────────── */}
        <Reveal as="section" className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="display text-display-sm">Trending in {city}</h2>
              <p className="mt-2 text-muted-foreground">The most-booked cars near you right now.</p>
            </div>
            <div className="hide-scrollbar flex gap-2 overflow-x-auto">
              {cities.map((c) => (
                <button
                  key={c.city}
                  onClick={() => setCity(c.city)}
                  className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                    c.city === city
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card hover:border-primary/40'
                  }`}
                >
                  {c.city}
                </button>
              ))}
            </div>
          </div>

          {trending.isLoading ? (
            <div className="flex overflow-x-auto snap-x snap-mandatory hide-scrollbar gap-4 pb-4 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-6 sm:pb-0">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-80 w-[85vw] shrink-0 snap-center sm:w-auto rounded-2xl" />
              ))}
            </div>
          ) : trending.data && trending.data.length > 0 ? (
            <>
              <div className="flex overflow-x-auto snap-x snap-mandatory hide-scrollbar gap-4 pb-4 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-6 sm:pb-0">
                {trending.data.slice(0, 4).map((v) => (
                  <VehicleCard key={v._id} vehicle={v} className="w-[85vw] shrink-0 snap-center sm:w-auto" />
                ))}
              </div>
              <div className="pt-2">
                <Link href={`/search?city=${encodeURIComponent(city)}`}>
                  <Button variant="outline" size="lg" className="rounded-full">
                    See all cars in {city} <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-border py-20 text-center">
              <p className="text-muted-foreground">
                No cars listed yet in {city}. Be the first —{' '}
                <Link href="/host" className="font-medium text-primary underline underline-offset-4">
                  become a host
                </Link>
                .
              </p>
            </div>
          )}
        </Reveal>

        {/* ── How it works ───────────────────────────────────────────── */}
        <Reveal as="section" className="space-y-12 sm:space-y-16 relative isolate pt-10">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent opacity-60 pointer-events-none blur-3xl"></div>
          <div className="text-center sm:text-start">
            <h2 className="display text-4xl text-foreground sm:text-5xl">How CATO works</h2>
            <p className="mt-4 text-muted-foreground text-lg sm:text-xl font-medium max-w-xl">Three steps. No counter, no queue, no paperwork.</p>
          </div>
          <div className="grid gap-6 sm:gap-10 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <Reveal
                key={s.title}
                delay={i * 90}
                className="group relative overflow-hidden rounded-3xl border border-border/50 bg-card/40 backdrop-blur-xl p-8 shadow-lg transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl hover:shadow-primary/20 hover:border-primary/40 hover:bg-card/80"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 pointer-events-none" />
                <span className="absolute -end-4 -top-8 text-[140px] font-black text-foreground/[0.02] transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3 group-hover:text-primary/[0.03] pointer-events-none select-none">
                  {i + 1}
                </span>
                <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20 shadow-inner transition-all duration-500 group-hover:scale-110 group-hover:shadow-[0_0_20px_-5px_rgba(var(--primary),0.4)]">
                  <s.icon className="h-7 w-7 text-primary" />
                </span>
                <h3 className="mt-8 text-xl font-bold tracking-tight text-foreground/90 transition-colors group-hover:text-foreground">{s.title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground transition-colors group-hover:text-muted-foreground/90">{s.body}</p>
                
                {/* Glow effect at the bottom */}
                <div className="absolute -bottom-1 start-1/2 -translate-x-1/2 w-1/2 h-1.5 bg-primary blur-md opacity-0 transition-opacity duration-500 group-hover:opacity-100 pointer-events-none" />
              </Reveal>
            ))}
          </div>
        </Reveal>

        {/* ── Trust ──────────────────────────────────────────────────── */}
        <Reveal as="section" className="relative overflow-hidden grid gap-10 rounded-3xl sm:rounded-[2.5rem] border border-border/50 bg-gradient-to-br from-card/80 via-card/50 to-card/20 backdrop-blur-2xl p-8 sm:p-14 md:grid-cols-3 shadow-2xl">
          <div className="absolute -top-40 -end-40 w-96 h-96 bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute -bottom-40 -start-40 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
          
          {[
            { icon: ShieldCheck, stat: 'Verified', label: 'Every host and every car is checked before it ever gets listed.' },
            { icon: BadgeCheck, stat: 'Protected', label: 'Choose a protection plan at checkout — up to zero deductible.' },
            { icon: Zap, stat: 'Instant', label: 'Instant Book cars are confirmed the moment you pay. No waiting.' },
          ].map((t) => (
            <div key={t.stat} className="relative z-10 group flex flex-col items-center text-center md:items-start md:text-start">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20 transition-all duration-500 group-hover:bg-primary/20 group-hover:scale-110 group-hover:shadow-[0_0_30px_-5px_rgba(var(--primary),0.3)]">
                <t.icon className="h-8 w-8 text-primary transition-transform duration-500 group-hover:scale-110" />
              </div>
              <p className="mt-6 text-2xl font-bold tracking-tight text-foreground/90 transition-colors duration-300 group-hover:text-primary">{t.stat}</p>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground max-w-xs">{t.label}</p>
            </div>
          ))}
        </Reveal>

        {/* ── Host CTA ───────────────────────────────────────────────── */}
        <Reveal as="section" className="relative isolate grain overflow-hidden rounded-3xl hero-mesh px-8 py-16 sm:px-16 sm:py-20">
          {/* An existing host shouldn't be pitched on hosting — send them to
              their dashboard instead. */}
          <div className="max-w-xl">
            <h2 className="display text-display text-white">
              {isHost ? (
                <>
                  Your fleet,
                  <br />
                  <span className="text-white/60">at a glance.</span>
                </>
              ) : (
                <>
                  Your car can pay
                  <br />
                  <span className="text-white/60">for itself.</span>
                </>
              )}
            </h2>
            <p className="mt-5 text-lg text-white/70">
              {isHost
                ? 'Check today’s trips, cash out your earnings, and keep your calendar up to date.'
                : 'List in minutes, set your own price, and get paid out — instantly, if you want it. You stay in control of your calendar.'}
            </p>
            <Link href={isHost ? '/host/trips' : '/host'} className="mt-8 inline-block">
              <Button size="lg" variant="secondary" className="rounded-full px-7">
                {isHost ? 'Go to your dashboard' : 'Start hosting'} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
