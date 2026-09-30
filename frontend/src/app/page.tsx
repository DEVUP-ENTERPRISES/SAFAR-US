'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ShieldCheck, Zap, ArrowRight, CarFront, KeyRound, Route, BadgeCheck,
  Search, UserCheck, FileCheck2, Lock, CreditCard, Ban, ClipboardList,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/ui/reveal';
import { Skeleton } from '@/components/ui/skeleton';
import { VehicleCard } from '@/features/vehicles/components/vehicle-card';
import { SearchBarFields } from '@/features/search/search-bar-fields';
import { CategoryCarousel } from '@/features/vehicles/components/category-carousel';
import { useTrending, useFacets } from '@/features/vehicles/hooks';

// ─── Static data ──────────────────────────────────────────────────────────────

const STEPS = [
  {
    icon: CarFront,
    image: '/sections/find-the-one.webp',
    title: 'Find the one',
    body: 'Browse our premium managed fleet. Filter by price, vehicle type, or delivery - every car is operated by us.',
  },
  {
    icon: KeyRound,
    image: '/sections/book-in-seconds.webp',
    title: 'Book in seconds',
    body: 'Reserve instantly with Instant Book. No back-and-forth, no waiting on anyone to approve.',
  },
  {
    icon: Route,
    image: '/sections/hit-the-road.webp',
    title: 'Hit the road',
    body: 'Pick it up or have our team deliver it - your door, hotel, or terminal. Keys in hand, on time.',
  },
];

const RESERVATION_FLOW = [
  { icon: Search,     label: 'Choose',    body: 'The exact vehicle - real photos, real plate. Not a class or a placeholder.' },
  { icon: UserCheck,  label: 'Verify',    body: 'Identity checked in the flow. No separate office visit required.' },
  { icon: FileCheck2, label: 'Documents', body: 'Licence on file before pickup, not at the curb when it is too late.' },
  { icon: Lock,       label: 'Hold',      body: 'Card authorised, not charged. The vehicle is locked to you.' },
  { icon: CreditCard, label: 'Capture',   body: 'Charged only once the reservation is confirmed and the trip is set.' },
] as const;

const RESERVATION_TRUST = [
  { icon: CarFront,      label: 'Exact vehicle, not a class' },
  { icon: Ban,           label: 'No double bookings' },
  { icon: UserCheck,     label: 'Verified in the flow' },
  { icon: Lock,          label: 'Held, then charged' },
  { icon: ClipboardList, label: 'Everything on the reservation' },
] as const;

const WHY_ITEMS = [
  {
    icon: MapPin,
    title: 'Curbside at the terminal',
    body: 'We deliver to DFW International and Love Field - no shuttle, no satellite lot, no queue.',
  },
  {
    icon: ShieldCheck,
    title: 'Every car is managed by us',
    body: 'Not a marketplace. Every vehicle is owned by CatoDrive or our Asset Partners, and insured and maintained by CatoDrive.',
  },
  {
    icon: Zap,
    title: 'Instant Book, always',
    body: 'Confirm in seconds. No host approval, no waiting. The reservation is live the moment you pay.',
  },
  {
    icon: BadgeCheck,
    title: 'Up to $0 deductible',
    body: 'Choose a protection plan at checkout. Our Premier plan covers you completely - zero out-of-pocket.',
  },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const facets = useFacets();
  const cities = facets.data?.cities ?? [];
  const [picked, setCity] = useState('');
  const active = cities.find((c) => c.city === picked) ?? cities[0];
  const city = active?.city ?? '';
  const trending = useTrending(active?.lng, active?.lat);

  return (
    <div className="-mt-24">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="full-bleed relative isolate flex min-h-screen flex-col overflow-hidden">
        {/* Full-bleed background photo */}
        <div className="absolute inset-0 -z-10">
          <Image
            src="/sections/hit-the-road.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-center opacity-70"
          />
          {/* Multi-layer overlay for depth:
              1. Radial vignette — darkens edges, focuses eye on center
              2. Linear gradient — bottom half darker so search bar always readable
              3. Subtle teal tint at the very bottom — ties photo to brand */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.55)_100%)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/80" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" />
        </div>

        {/* Content — vertically centered in the full viewport */}
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-4 pb-16 pt-[5.5rem] text-center sm:px-6 sm:pt-20">

          <Reveal delay={60}>
            <h1 className="display mt-6 text-[2.6rem] leading-[0.95] text-white [text-shadow:0_2px_20px_rgba(0,0,0,0.5)] sm:text-[4rem] lg:text-[5rem]">
              Drive away certain.
            </h1>
          </Reveal>

          <Reveal delay={110}>
            <p className="mt-4 max-w-xl text-base font-medium leading-relaxed text-white/85 [text-shadow:0_1px_10px_rgba(0,0,0,0.6)] sm:text-lg">
              Our own premium vehicles, delivered curbside at your terminal.
              No counters. No queues. No surprises.
            </p>
          </Reveal>

          {/* Search bar — glass card so it lifts cleanly off the photo */}
          <Reveal delay={160}>
            <div className="relative mt-10 w-[min(100vw-2rem,60rem)] sm:mt-12">
              {/* Glow */}
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-4 -z-10 rounded-[2.5rem] bg-primary/20 blur-2xl"
              />
              {/* Glass backdrop behind the bar */}
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-1 -z-10 rounded-[2rem] bg-black/30 backdrop-blur-sm"
              />
              <SearchBarFields calendarPlacement="overlay" />
            </div>
          </Reveal>

        </div>
      </section>

      {/* ── Body sections ────────────────────────────────────────────────── */}
      <div className="space-y-20 py-12 sm:space-y-24 sm:py-16">

        {/* ── Browse by category ─────────────────────────────────────────── */}
        <section className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Our fleet</p>
              <h2 className="display mt-1.5 text-2xl text-foreground sm:text-3xl">Browse by style</h2>
            </div>
            <Link href="/search" className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-primary hover:underline underline-offset-4 sm:flex">
              See all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <CategoryCarousel city={city} />
        </section>

        {/* ── Available vehicles ─────────────────────────────────────────── */}
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Ready to book</p>
              <h2 className="display mt-1.5 text-2xl text-foreground sm:text-3xl">
                {city ? `Available in ${city}` : 'Our vehicles'}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              {cities.length > 1 && (
                <div className="hide-scrollbar flex gap-1.5 overflow-x-auto">
                  {cities.map((c) => (
                    <button
                      key={c.city}
                      onClick={() => setCity(c.city)}
                      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        c.city === city
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card hover:border-primary/40'
                      }`}
                    >
                      {c.city}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {trending.isLoading ? (
            <div className="hide-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 sm:grid sm:grid-cols-2 sm:gap-6 sm:pb-0 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-80 w-[85vw] shrink-0 snap-center rounded-2xl sm:w-auto" />
              ))}
            </div>
          ) : trending.data && trending.data.length > 0 ? (
            <>
              {/* Phones: one car at a time, swiped sideways. Tablet and up: a grid. */}
              <div className="hide-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 sm:grid sm:grid-cols-2 sm:gap-6 sm:pb-0 lg:grid-cols-4">
                {trending.data.slice(0, 4).map((v) => (
                  <VehicleCard key={v._id} vehicle={v} className="w-[85vw] shrink-0 snap-center sm:w-auto" />
                ))}
              </div>
              <div>
                <Link
                  href={city ? `/search?city=${encodeURIComponent(city)}` : '/search'}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  View all vehicles <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-border py-16 text-center">
              <p className="text-muted-foreground">
                No vehicles available right now -{' '}
                <Link href="/contact" className="font-medium text-primary underline underline-offset-4">
                  contact us
                </Link>{' '}
                to arrange a booking.
              </p>
            </div>
          )}
        </section>

        {/* ── How it works ───────────────────────────────────────────────── */}
        <Reveal as="section" className="space-y-10 sm:space-y-14">
          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">How it works</p>
            <h2 className="display mt-2 text-3xl text-foreground sm:text-4xl lg:text-5xl">
              No counter. No queue.<br className="hidden sm:block" /> No paperwork.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Three steps from search to keys in hand.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-3 md:gap-6 lg:gap-10">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 100} className="group flex flex-col">
                {/* Step number */}
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-black text-primary-foreground">
                    {i + 1}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border/50 shadow-sm mb-5">
                  <Image
                    src={s.image}
                    alt={s.title}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
                  />
                </div>
                <h3 className="display text-xl text-foreground">{s.title}</h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
              </Reveal>
            ))}
          </div>
        </Reveal>

        {/* ── Why CatoDrive ────────────────────────────────────────────────── */}
        <Reveal as="section" className="space-y-10">
          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Why CatoDrive</p>
            <h2 className="display mt-2 text-3xl text-foreground sm:text-4xl">
              A rental company that works<br className="hidden sm:block" /> the way you travel.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WHY_ITEMS.map((w, i) => (
              <Reveal key={w.title} delay={i * 80}>
                <div className="group flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:border-primary/40 hover:shadow-md">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 transition-transform duration-500 group-hover:scale-110">
                    <w.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-semibold text-foreground">{w.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{w.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Reveal>

        {/* ── Reservation scroll section ───────────────────────────────── */}
        <ReservationFlowSection />

        {/* ── Trust strip ──────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-border bg-card p-8 sm:p-10">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-10">
            {[
              { icon: ShieldCheck, stat: 'Professionally Maintained', label: 'Every vehicle is owned, serviced, and detailed by our team before every trip.' },
              { icon: BadgeCheck,  stat: 'Up to $0 Deductible',       label: 'Choose a protection plan at checkout. Our Premier plan leaves nothing to pay.' },
              { icon: Zap,         stat: 'Instant Book',              label: 'Confirmed the moment you pay. No host approval required.' },
            ].map((t) => (
              <div key={t.stat} className="flex items-start gap-4">
                <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <t.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold text-foreground">{t.stat}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t.label}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Asset Partner CTA ──────────────────────────────────────────── */}
        <Reveal as="section" className="relative isolate grain overflow-hidden rounded-3xl hero-mesh">
          <div className="grid items-center gap-10 px-8 py-14 sm:px-14 sm:py-16 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
            <div className="max-w-lg">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white/80 backdrop-blur-sm">
                Asset Partner Programme
              </span>
              <h2 className="display mt-5 text-[2.2rem] leading-[1.05] text-white sm:text-[3rem]">
                Your car can pay
                <br />
                <span className="text-white/55">for itself.</span>
              </h2>
              <p className="mt-5 text-base leading-relaxed text-white/65 sm:text-lg">
                We list it, price it, deliver it and service it - with no calendar to manage, no guests to coordinate, no hassle.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/asset-partners">
                  <Button size="lg" variant="secondary" className="rounded-full px-7">
                    Become an Asset Partner <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/asset-partners">
                  <Button size="lg" variant="ghost" className="rounded-full px-7 text-white/80 hover:text-white hover:bg-white/10">
                    See the numbers
                  </Button>
                </Link>
              </div>
            </div>

            <div className="relative order-first lg:order-last">
              <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-primary/15 blur-3xl" />
              <Image
                src="/sections/cato-your-car.webp"
                alt="CatoDrive managed fleet earnings"
                width={1200}
                height={800}
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="h-auto w-full rounded-2xl object-cover shadow-2xl ring-1 ring-white/15"
              />
            </div>
          </div>
        </Reveal>

      </div>
    </div>
  );
}

// ─── Reservation scroll section ───────────────────────────────────────────────

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
      const eased = rawP < 0.5 ? 2 * rawP * rawP : 1 - Math.pow(-2 * rawP + 2, 2) / 2;
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
    <section
      ref={sectionRef}
      className="relative isolate overflow-clip rounded-3xl hero-mesh min-h-[calc(100vh+28rem)] px-6 py-8 sm:px-10 sm:py-10 lg:px-14"
    >
      <div className="sticky top-20 flex min-h-[calc(100vh-6rem)] flex-col justify-center sm:top-24 sm:min-h-[calc(100vh-8rem)]">

        {/* Copy */}
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white/80 backdrop-blur">
            One reservation, end to end
          </span>
          <h2 className="display mt-5 text-[2.2rem] leading-[1.02] text-white sm:text-[3rem] lg:text-5xl">
            Pick the exact car.
            <br />Get it at the curb.
          </h2>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-white/65 sm:text-lg">
            A real reservation on a real vehicle - held the moment you book it.
            Not a request form that somebody calls you back about.
          </p>
        </div>

        {/* Horizontal scroll track */}
        <div className="mt-8 overflow-hidden sm:mt-10">
          <div
            ref={trackRef}
            className="flex w-max gap-4 py-2 transition-transform duration-300 ease-out motion-reduce:translate-x-0 motion-reduce:transition-none"
            style={{ transform: `translate3d(-${offset}px, 0, 0)` }}
          >
            {RESERVATION_FLOW.map((step, i) => {
              const centerI = progress * (RESERVATION_FLOW.length - 1);
              const diff = Math.abs(centerI - i);
              const isActive = diff < 0.6;
              const scale = isActive ? 1 : Math.max(0.88, 1 - diff * 0.06);
              const opacity = isActive ? 1 : Math.max(0.22, 1 - diff * 0.48);

              return (
                <article
                  key={step.label}
                  className="w-[min(80vw,20rem)] shrink-0 overflow-hidden rounded-2xl p-5 backdrop-blur-sm sm:w-[21rem] transition-all duration-300"
                  style={{
                    transform: `scale(${scale})`,
                    opacity,
                    border: isActive
                      ? '1.5px solid hsl(var(--primary) / 0.65)'
                      : '1px solid rgba(255,255,255,0.06)',
                    background: isActive
                      ? 'linear-gradient(135deg, hsl(var(--primary) / 0.15) 0%, rgba(0,0,0,0.4) 100%)'
                      : 'rgba(0,0,0,0.3)',
                    boxShadow: isActive
                      ? '0 0 0 1px hsl(var(--primary) / 0.15), 0 24px 48px rgba(0,0,0,0.5)'
                      : '0 8px 24px rgba(0,0,0,0.35)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-300"
                      style={{
                        background: isActive ? 'hsl(var(--primary) / 0.25)' : 'rgba(255,255,255,0.06)',
                        color: isActive ? 'hsl(var(--primary))' : 'rgba(255,255,255,0.35)',
                        borderColor: isActive ? 'hsl(var(--primary) / 0.4)' : 'rgba(255,255,255,0.08)',
                      }}
                    >
                      <step.icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p
                        className="text-[10px] font-black uppercase tracking-[0.2em] transition-colors duration-300"
                        style={{ color: isActive ? 'hsl(var(--primary))' : 'rgba(255,255,255,0.28)' }}
                      >
                        {step.label}
                      </p>
                    </div>
                  </div>
                  <p
                    className="mt-3.5 text-sm leading-relaxed transition-colors duration-300"
                    style={{ color: isActive ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.28)' }}
                  >
                    {step.body}
                  </p>
                </article>
              );
            })}
          </div>
        </div>

        {/* Money note */}
        <div className="mt-5 flex items-center gap-2 text-sm text-white/45">
          <Lock className="h-3.5 w-3.5 shrink-0 text-primary/60" />
          <span>The money never moved until it had to.</span>
        </div>

        {/* Trust points + CTA */}
        <div className="mt-6 flex flex-col gap-5 border-t border-white/10 pt-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
            {RESERVATION_TRUST.map((trust) => (
              <span key={trust.label} className="flex items-center gap-2 text-xs font-medium text-white/65 sm:text-sm">
                <trust.icon className="h-3.5 w-3.5 shrink-0 text-primary" /> {trust.label}
              </span>
            ))}
          </div>
          <Link
            href="/search"
            className="group inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-7 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-110 active:scale-95"
          >
            Book Now <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

      </div>
    </section>
  );
}
