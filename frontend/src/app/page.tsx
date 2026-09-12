'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ShieldCheck, Zap, Sparkles, ArrowRight, Star, CarFront, KeyRound, Route, BadgeCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/ui/reveal';
import { Skeleton } from '@/components/ui/skeleton';
import { VehicleCard } from '@/features/vehicles/components/vehicle-card';
import { SearchBarFields } from '@/features/search/search-bar-fields';
import { CategoryCarousel } from '@/features/vehicles/components/category-carousel';
import { TractionStats, AudienceSection } from '@/features/marketing/sections';
import { useTrending, useRecommendations, useFacets } from '@/features/vehicles/hooks';
import { useAuthStore } from '@/features/auth/store';
import { useIsHost } from '@/features/host/hooks';


const STEPS = [
  { icon: CarFront, image: '/sections/find-the-one.webp', title: 'Find the one', body: 'Browse verified cars from local hosts. Filter by price, features, or delivery.' },
  { icon: KeyRound, image: '/sections/book-in-seconds.webp', title: 'Book in seconds', body: 'Instant Book cars confirm immediately. No back-and-forth, no waiting.' },
  { icon: Route, image: '/sections/hit-the-road.webp', title: 'Hit the road', body: 'Pick it up, or have it delivered to your door, hotel, or the airport.' },
];

/**
 * The connector between two cards in a three-step row — an arrow that sits in
 * the gap and nudges forward, so the eye is carried 1 → 2 → 3. It points right
 * between columns on desktop and down between stacked cards on mobile. Lives
 * outside the (clipped) card, inside a relative grid cell.
 */
function StepConnector() {
  // Three nested layers, each owning ONE transform, because rotation, the
  // gap-centering offset, and the nudge animation all use `transform` and would
  // otherwise clobber each other.
  //
  // Vertical placement: on desktop it sits low, over the CONTENT band rather
  // than on the photo (the image is the top ~two-thirds of the card, so a
  // mid-card arrow landed on the picture). On mobile it drops into the gap
  // between the stacked cards and points down.
  return (
    <div
      aria-hidden
      className="absolute z-20 bottom-0 start-1/2 -translate-x-1/2 translate-y-1/2
                 md:bottom-[16%] md:start-auto md:end-0 md:top-auto md:translate-x-1/2 md:translate-y-1/2"
    >
      {/* Rotate the whole badge: down between stacked cards, right between columns. */}
      <span className="relative grid h-9 w-9 rotate-90 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background md:rotate-0">
        {/* A slow halo pulse so the link between cards reads as active. */}
        <span className="absolute inset-0 rounded-full bg-primary opacity-40 animate-ping [animation-duration:2.4s]" />
        {/* The nudge lives on the icon, inside the rotated frame, so it travels
            in whatever direction the badge points. */}
        <ArrowRight className="relative h-4 w-4 animate-nudge-x" />
      </span>
    </div>
  );
}

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
          <div className="grid gap-8 sm:gap-y-6 md:grid-cols-3 md:gap-x-12">
            {STEPS.map((s, i) => (
              <div key={s.title} className="relative">
                <Reveal
                  delay={i * 120}
                  className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border/50 bg-card shadow-card transition-all duration-500 hover:-translate-y-2 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10"
                >
                  {/* The real photo leads. A slow zoom on hover keeps it alive. */}
                  <div className="relative aspect-[16/10] w-full overflow-hidden">
                    <Image
                      src={s.image}
                      alt={s.title}
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
                    />
                    {/* Nothing sits on the photo — the image stays clean. */}
                  </div>
                  <div className="flex flex-col p-6 sm:p-7">
                    {/* Icon + title live in the content, off the image. */}
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 transition-transform duration-500 group-hover:scale-110">
                        <s.icon className="h-5 w-5" />
                      </span>
                      <h3 className="display text-xl text-foreground">{s.title}</h3>
                    </div>
                    <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
                  </div>
                </Reveal>
                {i < STEPS.length - 1 && <StepConnector />}
              </div>
            ))}
          </div>
        </Reveal>

        {/* ── Trust ──────────────────────────────────────────────────── */}
        <section>
          <div className="grid gap-8 sm:gap-y-6 md:grid-cols-3 md:gap-x-12">
            {[
              { icon: ShieldCheck, image: '/sections/cato-verified.webp', stat: 'Verified', label: 'Every host and every car is checked before it ever gets listed.' },
              { icon: BadgeCheck, image: '/sections/cato-protected.webp', stat: 'Protected', label: 'Choose a protection plan at checkout — up to zero deductible.' },
              { icon: Zap, image: '/sections/cato-instant.webp', stat: 'Instant', label: 'Instant Book cars are confirmed the moment you pay. No waiting.' },
            ].map((t, i, arr) => (
              <div key={t.stat} className="relative">
                <Reveal
                  delay={i * 120}
                  className="group flex h-full flex-col overflow-hidden rounded-3xl border border-border/50 bg-card shadow-card transition-all duration-500 hover:-translate-y-2 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10"
                >
                  <div className="relative aspect-[16/10] w-full overflow-hidden">
                    <Image
                      src={t.image}
                      alt={t.stat}
                      fill
                      sizes="(min-width: 768px) 33vw, 100vw"
                      className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
                    />
                    {/* Clean photo — nothing overlaid. */}
                  </div>
                  <div className="flex flex-col p-6">
                    {/* Icon + promise live below the image, ahead of the detail. */}
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 transition-transform duration-500 group-hover:scale-110">
                        <t.icon className="h-5 w-5" />
                      </span>
                      <span className="display text-xl text-foreground">{t.stat}</span>
                    </div>
                    <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{t.label}</p>
                  </div>
                </Reveal>
                {i < arr.length - 1 && <StepConnector />}
              </div>
            ))}
          </div>
        </section>

        {/* ── Traction + who we serve (shared with the About page) ───── */}
        <TractionStats heading="Backed by real numbers." />

        <AudienceSection heading="Built for two kinds of people." />

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
            <Image
              src="/sections/cato-your-car.webp"
              alt="The CATO app showing a host's weekly earnings"
              width={1200}
              height={800}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="w-full h-auto rounded-2xl object-cover shadow-2xl ring-1 ring-white/15"
            />
          </div>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
