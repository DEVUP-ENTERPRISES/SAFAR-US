'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ShieldCheck, Zap, Sparkles, ArrowRight, Star, CarFront, KeyRound, Route, BadgeCheck,
  Search, UserCheck, FileCheck2, Lock, CreditCard, Ban, ClipboardList,
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
import { config } from '@/lib/config';


const STEPS = [
  { icon: CarFront, image: '/sections/find-the-one.webp', title: 'Find the one', body: 'Browse verified cars from local hosts. Filter by price, features, or delivery.' },
  { icon: KeyRound, image: '/sections/book-in-seconds.webp', title: 'Book in seconds', body: 'Instant Book cars confirm immediately. No back-and-forth, no waiting.' },
  { icon: Route, image: '/sections/hit-the-road.webp', title: 'Hit the road', body: 'Pick it up, or have it delivered to your door, hotel, or the airport.' },
];

// The reservation, one step deeper than STEPS - what actually happens
// between "Book in seconds" and "Hit the road": the exact vehicle gets
// locked to the reservation, identity gets checked, and the card only
// gets charged once the trip is confirmed.
const RESERVATION_FLOW = [
  { icon: Search, label: 'Choose', body: 'The exact car - real photos, real plate. Not a class or a placeholder.' },
  { icon: UserCheck, label: 'Verify', body: 'Identity checked in the flow. No separate office visit.' },
  { icon: FileCheck2, label: 'Documents', body: 'License and insurance on file before pickup, not at the curb.' },
  { icon: Lock, label: 'Hold', body: 'The card is authorized, not charged. The vehicle is locked to you.' },
  { icon: CreditCard, label: 'Capture', body: 'Charged only once the reservation is confirmed and the trip is set.' },
] as const;

const RESERVATION_TRUST = [
  { icon: CarFront, label: 'Exact vehicle, not a class' },
  { icon: Ban, label: 'No double bookings' },
  { icon: UserCheck, label: 'Verified in the flow' },
  { icon: Lock, label: 'Held, then charged' },
  { icon: ClipboardList, label: 'Everything on the reservation' },
] as const;

// Step connector removed for a cleaner layout

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
      <section className="full-bleed relative isolate grain overflow-visible hero-mesh">
        <div className="mx-auto max-w-7xl px-4 pb-12 pt-[5.5rem] sm:px-6 sm:pb-16 sm:pt-20 lg:pt-24">
          <div className="grid lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-14 items-center">
            <div>
              <div className="max-w-3xl">
                {/*
                  Was a Sparkles icon reading "The Mobility Operating System".
                  A sparkle is the stock "AI / premium / magic" glyph and says
                  nothing about cars, and "operating system" is platform language
                  for what a visitor experiences as renting a car. The badge above
                  a headline should tell someone what this actually is.
                */}
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-bold tracking-widest uppercase text-white/95 shadow-soft">
                  <KeyRound className="h-4 w-4" /> Self-drive car sharing
                </span>

                {/* The display face, and no gradient-to-transparent: that trick
                    is everywhere, and it throws away contrast on the one line the
                    whole page is built around. */}
                <h1 className="display mt-6 text-[2.6rem] leading-[0.95] text-white sm:mt-8 sm:text-[4.6rem] lg:text-[5.2rem]">
                  Drive away
                  <br />
                  certain.
                </h1>

                <p className="mt-5 max-w-xl text-base font-medium leading-relaxed text-white/75 sm:mt-7 sm:text-xl">
                  Real cars from local hosts, delivered where you need them - with three promises no
                  other rental makes.
                </p>
              </div>

              {/*
                One search bar, not two.

                The hero ran its own widget - a native <select> listing cities with
                a "(1)" vehicle count after each, and two native date inputs
                rendering dd-mm-yyyy in an OS-drawn picker. The navbar and the
                search page had already moved to SearchBarFields, so the product
                had two search implementations that looked and behaved differently
                depending on which one you happened to hit first.

                The counts went with it. A city offering one car reads as an empty
                marketplace, and the number is not what anyone is choosing on.
              */}
              <div className="mt-8 max-w-2xl animate-slide-up sm:mt-10 relative z-10">
                <SearchBarFields calendarPlacement="flow" />
              </div>
            </div>

            <div className="relative hidden lg:block w-full">
              <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-primary/20 blur-3xl" />
              <Image
                src="/newsections/cato-hero-people.webp"
                alt="Car sharing hero"
                width={800}
                height={800}
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="w-full h-auto aspect-[4/3] rounded-3xl object-cover shadow-2xl ring-1 ring-white/15"
                priority
              />
            </div>
          </div>

          {/* The three promises, stated on the first screen. Each one is a
              shipped mechanic, not a marketing line. */}
          <div className="mt-12 grid max-w-5xl gap-px overflow-hidden rounded-xl border border-white/15 bg-white/10 sm:mt-16 sm:grid-cols-3">
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
              <div key={p.t} className="rounded-xl bg-[hsl(var(--ink))]/70 p-4 backdrop-blur-sm sm:rounded-none sm:p-5">
                <p className="text-[15px] font-semibold leading-snug text-white">{p.t}</p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/60">{p.d}</p>
              </div>
            ))}
          </div>

          {/* Live marketplace numbers - supporting evidence, not the pitch. */}
          <div className="mt-6 flex flex-col gap-y-2 text-sm text-white/55 sm:mt-8 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8 sm:gap-y-3">
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

      <div className="space-y-12 py-8 sm:space-y-16 sm:py-12">
        {/* ── Browse by category ─────────────────────────────────────── */}
        <section className="space-y-5">
          <div className="flex items-baseline gap-3">
            <h2 className="display text-2xl text-foreground sm:text-3xl">Browse by style</h2>
            <span className="hidden h-px flex-1 bg-border sm:block" />
            <p className="shrink-0 text-sm text-muted-foreground">Whatever the trip calls for.</p>
          </div>
          <CategoryCarousel city={city} />
        </section>

        {/* ── For You (personalized) ─────────────────────────────────── */}
        {user && forYou.data && forYou.data.length > 0 && (
          <section className="space-y-5">
            <div className="flex items-baseline gap-3">
              <h2 className="display flex items-center gap-2 text-2xl text-foreground sm:text-3xl">
                <Sparkles className="h-5 w-5 text-primary" /> For you
              </h2>
              <span className="hidden h-px flex-1 bg-border sm:block" />
              <p className="shrink-0 text-sm text-muted-foreground">Picked from the cars you&apos;ve loved.</p>
            </div>
            <div className="flex overflow-x-auto snap-x snap-mandatory hide-scrollbar gap-4 pb-4 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-6 sm:pb-0">
              {forYou.data.slice(0, 4).map((v) => (
                <VehicleCard key={v._id} vehicle={v} className="w-[85vw] shrink-0 snap-center sm:w-auto" />
              ))}
            </div>
          </section>
        )}

        {/* ── Trending ───────────────────────────────────────────────── */}
        <section className="space-y-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <h2 className="display text-2xl text-foreground sm:text-3xl">Trending in {city}</h2>
              <p className="hidden text-sm text-muted-foreground sm:block">Most-booked right now.</p>
            </div>
            <div className="hide-scrollbar flex gap-2 overflow-x-auto">
              {cities.map((c) => (
                <button
                  key={c.city}
                  onClick={() => setCity(c.city)}
                  className={`shrink-0 rounded-full border px-3.5 py-1 text-xs font-medium transition-colors ${
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
                No cars listed yet in {city}. Be the first -{' '}
                <Link
                  href={config.assetPartnersOnly ? '/asset-partners/apply' : '/host'}
                  className="font-medium text-primary underline underline-offset-4"
                >
                  list your car
                </Link>
                .
              </p>
            </div>
          )}
        </section>

        {/* ── How it works ───────────────────────────────────────────── */}
        <Reveal as="section" className="space-y-8 sm:space-y-12">
          <div className="max-w-xl sm:text-start">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-primary">How it works</p>
            <h2 className="display text-3xl text-foreground sm:text-4xl lg:text-5xl">No counter. No queue. No paperwork.</h2>
            <p className="mt-3 text-base text-muted-foreground sm:mt-4 sm:text-lg">Three steps from search to keys in hand.</p>
          </div>
          <div className="grid gap-12 md:grid-cols-3 md:gap-8">
            {STEPS.map((s, i) => (
              <Reveal
                key={s.title}
                delay={i * 120}
                className="group flex h-full flex-col"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl mb-6 shadow-md border border-border/40">
                  <Image
                    src={s.image}
                    alt={s.title}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
                  />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <s.icon className="h-5 w-5" />
                    </span>
                    <h3 className="display text-xl text-foreground">{s.title}</h3>
                  </div>
                  <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Reveal>

        {/* ── The reservation, step by step ─────────────────────────── */}
        <ReservationFlowSection />

        {/* ── Trust strip ────────────────────────────────────────────── */}
        {/* These were three photo cards identical in template to "How it works",
            which made the page look like repeating slides. As a horizontal
            strip they read as supporting evidence that sits between content,
            not another "section" demanding equal visual attention. */}
        <section className="grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-12 py-8 border-y border-border/40">
          {[
            { icon: ShieldCheck, stat: 'Verified', label: 'Every host and car is checked before listing.' },
            { icon: BadgeCheck, stat: 'Protected', label: 'Choose a plan at checkout - up to $0 deductible.' },
            { icon: Zap, stat: 'Instant Book', label: 'Confirmed the moment you pay. No waiting.' },
          ].map((t) => (
            <div key={t.stat} className="flex items-start gap-4">
              <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <t.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-lg font-semibold text-foreground">{t.stat}</p>
                <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted-foreground">{t.label}</p>
              </div>
            </div>
          ))}
        </section>

        {/* ── Traction + who we serve ──────────────────────────────── */}
        <div className="pt-4 sm:pt-6">
          <TractionStats heading="Backed by real numbers." excludeLive />
        </div>

        <AudienceSection heading="Built for two kinds of people." />

        {/* ── Host / Asset Partner CTA ─────────────────────────────────── */}
        <Reveal as="section" className="relative isolate grain overflow-hidden rounded-2xl hero-mesh px-8 py-14 sm:px-16 sm:py-16">
          {/* An existing host shouldn't be pitched on hosting - send them to
              their dashboard instead. A NEW visitor sees the Asset Partner
              pitch while config.assetPartnersOnly is on: the self-serve "list
              it yourself" story is what's switched off, not the CTA slot. */}
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
                : config.assetPartnersOnly
                  ? 'We list it, price it, deliver it and service it. You keep 80% of every booking - no calendar to manage.'
                  : 'List in minutes, set your own price, and get paid out - instantly, if you want it. You stay in control of your calendar.'}
            </p>
            <Link
              href={isHost ? '/host/trips' : config.assetPartnersOnly ? '/asset-partners' : '/host'}
              className="mt-8 inline-block"
            >
              <Button size="lg" variant="secondary" className="rounded-full px-7">
                {isHost ? 'Go to your dashboard' : config.assetPartnersOnly ? 'Become an Asset Partner' : 'Start hosting'} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          {/* The real product shot. It leads on mobile (a picture pulls you in
              before a headline does) and sits beside the copy on desktop. */}
          <div className="relative order-first lg:order-last">
            <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-primary/20 blur-3xl" />
            <Image
              src="/sections/cato-your-car.webp"
              alt="The CatoDrive app showing a host's weekly earnings"
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

function ReservationFlowSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const section = sectionRef.current;
      const track = trackRef.current;
      if (!section || !track || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      const start = section.offsetTop;
      const travel = Math.max(1, section.offsetHeight - window.innerHeight);
      const rawP = Math.min(1, Math.max(0, (window.scrollY - start) / travel));
      const eased = rawP < 0.5
        ? 2 * rawP * rawP
        : 1 - Math.pow(-2 * rawP + 2, 2) / 2;
      
      setProgress(eased);
      const maxOffset = Math.max(0, track.scrollWidth - track.parentElement!.clientWidth);
      setOffset(maxOffset * eased);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <section ref={sectionRef} className="relative isolate overflow-clip rounded-3xl hero-mesh px-6 py-8 min-h-[calc(100vh+40rem)] sm:px-10 sm:py-10 lg:px-14">
      <div className="sticky top-20 flex min-h-[calc(100vh-6rem)] flex-col justify-center sm:top-24 sm:min-h-[calc(100vh-8rem)]">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white/80 backdrop-blur">
            One reservation, end to end
          </span>
          <h2 className="display mt-4 text-[2.4rem] leading-[1.02] text-white sm:text-5xl">
            Pick the exact car. Get it at the curb.
          </h2>
          <p className="mt-3 text-lg leading-relaxed text-white/70">
            Not a request form that somebody calls you back about. A real reservation, on a real
            vehicle, held the moment you book it.
          </p>
        </div>

        <div className="mt-8 overflow-hidden sm:mt-10">
          <div
            ref={trackRef}
            className="flex w-max gap-6 transition-transform duration-300 ease-out motion-reduce:translate-x-0 motion-reduce:transition-none py-2"
            style={{ transform: `translate3d(-${offset}px, 0, 0)` }}
          >
            {RESERVATION_FLOW.map((step, i) => {
              const centerI = progress * 5;
              const diff = Math.abs(centerI - i);
              const scale = Math.max(0.9, 1 - diff * 0.05);
              const opacity = Math.max(0.3, 1 - diff * 0.4);

              return (
                <article 
                  key={step.label} 
                  className="w-[min(80vw,20rem)] shrink-0 rounded-2xl border border-white/10 bg-black/20 p-5 shadow-xl backdrop-blur-sm sm:w-[22rem] transition-all duration-300"
                  style={{ transform: `scale(${scale})`, opacity }}
                >
                  <div className="flex items-center gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/15 transition-colors duration-300" style={{ backgroundColor: diff < 0.5 ? 'rgba(255,255,255,0.2)' : '' }}>
                      <step.icon className="h-5 w-5" />
                    </span>
                    <h3 className="text-base font-bold uppercase tracking-widest text-primary">{step.label}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-white/70">{step.body}</p>
                </article>
              );
            })}
            
            <div 
              className="w-[min(80vw,20rem)] shrink-0 flex flex-col justify-center rounded-2xl border border-primary/40 bg-primary/10 p-5 shadow-xl backdrop-blur-sm sm:w-[22rem] transition-all duration-300"
              style={{
                transform: `scale(${Math.max(0.9, 1 - Math.abs(progress * 5 - 5) * 0.05)})`,
                opacity: Math.max(0.3, 1 - Math.abs(progress * 5 - 5) * 0.4)
              }}
            >
              <Lock className="mb-3 h-7 w-7 text-primary" />
              <p className="text-sm font-bold uppercase tracking-wider text-primary">
                The money never moved until it had to.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-4 border-t border-white/10 pt-6 lg:flex-row lg:items-center lg:justify-between opacity-90">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
            {RESERVATION_TRUST.map((trust) => (
              <span key={trust.label} className="flex items-center gap-2 text-xs sm:text-sm font-medium text-white/75">
                <trust.icon className="h-4 w-4 shrink-0 text-primary" /> {trust.label}
              </span>
            ))}
          </div>
          <Link href="/search" className="group inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2 text-sm font-bold text-primary-foreground shadow-xl shadow-primary/20 transition-transform hover:scale-[1.03] active:scale-95">
            Book Now <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
