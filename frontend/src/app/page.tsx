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
  { icon: CarFront, image: '/sections/find-the-one.png', title: 'Find the one', body: 'Browse verified cars from local hosts. Filter by price, features, or delivery.' },
  { icon: KeyRound, image: '/sections/book-in-seconds.png', title: 'Book in seconds', body: 'Instant Book cars confirm immediately. No back-and-forth, no waiting.' },
  { icon: Route, image: '/sections/hit-the-road.png', title: 'Hit the road', body: 'Pick it up, or have it delivered to your door, hotel, or the airport.' },
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
                className="group relative flex flex-col overflow-hidden rounded-3xl border border-border/50 bg-card shadow-card transition-all duration-500 hover:-translate-y-2 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10"
              >
                {/* The real photo leads. A slow zoom on hover keeps it alive. */}
                <div className="relative aspect-[16/10] w-full overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.image}
                    alt={s.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
                  />
                  {/* A soft floor so the icon chip reads on any photo. */}
                  <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-card via-card/40 to-transparent" />
                  {/* Step number — the sequence is the information here. */}
                  <span className="numeric absolute end-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-background/85 text-sm font-bold text-foreground shadow-lg backdrop-blur">
                    {i + 1}
                  </span>
                  {/* The icon chip straddles the photo and the text, tying them together. */}
                  <span className="absolute -bottom-6 start-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg ring-4 ring-card transition-transform duration-500 group-hover:scale-110">
                    <s.icon className="h-6 w-6" />
                  </span>
                </div>
                <div className="flex flex-col p-6 pt-9 sm:p-7 sm:pt-9">
                  <h3 className="display text-xl text-foreground">{s.title}</h3>
                  <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Reveal>

        {/* ── Trust ──────────────────────────────────────────────────── */}
        <section className="space-y-8">
          <div className="text-center sm:text-start">
            <h2 className="display text-4xl text-foreground sm:text-5xl">Built on trust</h2>
            <p className="mt-4 max-w-xl text-lg font-medium text-muted-foreground sm:text-xl">
              Three promises no other rental makes.
            </p>
          </div>
          <div className="grid gap-6 sm:gap-8 md:grid-cols-3">
            {[
              { icon: ShieldCheck, image: '/sections/cato-verified.png', stat: 'Verified', label: 'Every host and every car is checked before it ever gets listed.' },
              { icon: BadgeCheck, image: '/sections/cato-protected.png', stat: 'Protected', label: 'Choose a protection plan at checkout — up to zero deductible.' },
              { icon: Zap, image: '/sections/cato-instant.png', stat: 'Instant', label: 'Instant Book cars are confirmed the moment you pay. No waiting.' },
            ].map((t, i) => (
              <Reveal
                key={t.stat}
                delay={i * 90}
                className="group flex flex-col overflow-hidden rounded-3xl border border-border/50 bg-card shadow-card transition-all duration-500 hover:-translate-y-2 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={t.image}
                    alt={t.stat}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  {/* Label sits on the photo — the promise, over the proof. */}
                  <div className="absolute bottom-4 start-5 flex items-center gap-2.5">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur">
                      <t.icon className="h-5 w-5" />
                    </span>
                    <span className="display text-2xl text-white drop-shadow">{t.stat}</span>
                  </div>
                </div>
                <p className="p-6 text-[15px] leading-relaxed text-muted-foreground">{t.label}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Host CTA ───────────────────────────────────────────────── */}
        <Reveal as="section" className="relative isolate grain overflow-hidden rounded-3xl hero-mesh px-8 py-14 sm:px-16 sm:py-16">
          {/* An existing host shouldn't be pitched on hosting — send them to
              their dashboard instead. */}
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-14">
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

          {/* The real product shot. It leads on mobile (a picture pulls you in
              before a headline does) and sits beside the copy on desktop. */}
          <div className="relative order-first lg:order-last">
            <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-primary/20 blur-3xl" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/sections/cato-your-car.png"
              alt="The CATO app showing a host's weekly earnings"
              loading="lazy"
              className="w-full rounded-2xl object-cover shadow-2xl ring-1 ring-white/15"
            />
          </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
