'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  PlaneTakeoff, Car, Banknote, Settings2, ShieldCheck, Star, Sparkles,
  ArrowRight, TrendingUp, Briefcase, Building2, Users, CheckCircle2,
  Camera, Wallet, ClipboardCheck, Quote,
} from 'lucide-react';
import { Reveal } from '@/components/ui/reveal';

/**
 * About CatoDrive — the brand story, the traction, and the owner economics.
 *
 * The booking experience is the homepage; this is where the pitch lives. Built
 * on the same dark hero-mesh / display-type / Reveal system as the homepage so
 * the two read as one brand, with scroll-triggered count-ups and numbered
 * frames doing the heavy lifting rather than a component library.
 *
 * Every figure here is CatoDrive marketing copy supplied by the business
 * (revenue, ratings, owner net, liability). Confirm current numbers before each
 * campaign — stale claims on a rental site are a trust and legal risk.
 */

const BRAND = 'CatoDrive';

const STATS = [
  { prefix: '$', value: 307, suffix: 'K', decimals: 0, label: '2025 Fleet Revenue' },
  { prefix: '', value: 4.96, suffix: '★', decimals: 2, label: 'Rating', sub: '2,053 reviews' },
  { prefix: '', value: 75, suffix: '+', decimals: 0, label: 'Vehicles Under Management' },
  { prefix: '', value: 2607, suffix: '+', decimals: 0, label: 'Trips Completed', comma: true },
] as const;

const PILLARS = [
  { n: '01', icon: PlaneTakeoff, title: 'Free Terminal Valet', body: 'Car delivered straight to your terminal at DFW International and Love Field. Returned the same way. No shuttles. No satellite lots. Ever.' },
  { n: '02', icon: Car, title: 'Exact Car, Guaranteed', body: 'Book the precise vehicle you want. Real photos, real car. No bait-and-switch. Every vehicle SOP-maintained, spotless, and road-ready.' },
  { n: '03', icon: Banknote, title: 'Owners Net $1,066–$1,878/mo', body: '80% of every booking goes to you. After maintenance (~$100–200/mo), the average owner nets over $1,000/month per vehicle. The car pays for itself in 36–40 months.' },
  { n: '04', icon: Settings2, title: 'Full Fleet Management', body: 'Owners do nothing. We list, price, deliver, clean, and service — a 24/7 operations team based in DFW. Your only job is cashing the check.' },
] as const;

const STEPS = [
  { n: '01', icon: Car, title: 'List the Car You Own', body: 'You already own an eligible vehicle — no purchase required. We take it from there.', tag: 'Use the car you already own' },
  { n: '02', icon: Camera, title: `${BRAND} Lists It`, body: 'We photograph it, list it, and price it dynamically. You do nothing.', tag: '$0 additional effort from you' },
  { n: '03', icon: ClipboardCheck, title: 'Guest Books Online', body: 'A vetted traveler books online. We screen every trip. You’re never involved.', tag: 'Full vetting on every reservation' },
  { n: '04', icon: Settings2, title: 'We Manage Everything', body: 'Valet pickup, terminal delivery, cleaning, maintenance coordination — full white-glove service.', tag: '100% of operations handled' },
  { n: '05', icon: Wallet, title: 'You Get Paid', body: '80% of every booking hits your account monthly. No invoices. No chasing.', tag: 'Net $1,066–$1,878 / month' },
] as const;

const TESTIMONIALS = [
  { quote: 'I was skeptical at first — I’d never rented my car before. CatoDrive listed it, handled every guest, and I made $1,400 my first month. I financed a second car within 90 days. Now I have six cars on the platform.', mono: 'PO', name: 'Portfolio Owner', meta: '6 vehicles · Partner since 2024' },
  { quote: 'The car wash alone would’ve been a headache. CatoDrive handles it all. My only job is cashing the check.', mono: 'AP', name: 'Asset Partner', meta: '2 vehicles' },
  { quote: 'They told me 18-month payback. I hit breakeven in 14. The airport market is insane right now.', mono: 'DI', name: 'DFW Investor', meta: '3 vehicles' },
] as const;

const AUDIENCES = [
  { icon: TrendingUp, title: 'Asset Partners', body: 'List a vehicle you already own. Net $1,029–$1,841/month — you keep 80% of every booking.', href: '/host', cta: 'Become a partner' },
  { icon: Briefcase, title: 'Business Travelers', body: 'Car delivered to your terminal at DFW or Love Field, 5–15% below market rate. Paperless end-to-end. Zero friction.', href: '/search', cta: 'Book a car' },
  { icon: Building2, title: 'Corporate Accounts', body: 'B2B fleet accounts for enterprises and staffing agencies, auto-repair loaner programs, and white-glove SUV delivery to private terminals.', href: '/corporate', cta: 'Talk to us' },
  { icon: Users, title: 'Enterprise & Volume', body: 'Volume pricing, dedicated account management, consolidated billing, and priority terminal delivery for regular DFW travel.', href: '/corporate', cta: 'Corporate portal' },
] as const;

const RISKS = [
  { scenario: 'Renter damages the vehicle', detail: '$750K liability + collision coverage per trip. The owner does not pay and never files directly.', owner: 'CatoDrive' as const },
  { scenario: 'The car sits empty', detail: 'We manage pricing, listing optimization and the booking pipeline 24/7. Your exposure is zero.', owner: 'CatoDrive' as const },
  { scenario: 'Routine maintenance', detail: 'The owner’s only cost: ~$100–200/month for oil, tires and washes — offset many times over by net income.', owner: 'Owner' as const },
  { scenario: 'Guest no-show or late return', detail: 'Our operations team handles all guest issues, rescheduling and late-fee recovery.', owner: 'CatoDrive' as const },
] as const;

export default function AboutPage() {
  return (
    <div className="-mt-6">
      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="full-bleed relative isolate grain overflow-hidden hero-mesh">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:py-32">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-primary-soft backdrop-blur">
              <PlaneTakeoff className="h-3.5 w-3.5" /> Airport mobility, reimagined
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="display mt-7 max-w-4xl text-[2.7rem] leading-[0.98] text-white sm:text-[4rem] lg:text-[4.9rem]">
              Airport mobility is trapped in{' '}
              <span className="relative whitespace-nowrap">
                <span className="text-white/30 line-through decoration-primary/70 decoration-4">1995</span>
              </span>.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-7 max-w-2xl text-lg leading-relaxed text-white/70 sm:text-xl">
              Every rental company makes you take a shuttle bus to a satellite lot. {BRAND} delivers your
              car <span className="font-semibold text-white">curbside at the terminal</span> — DFW and Love Field.
              Keys in hand.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/search" className="group inline-flex h-14 items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-base font-bold text-primary-foreground shadow-xl shadow-primary/20 transition-transform hover:scale-[1.03] active:scale-95">
                Book a car <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link href="/host" className="inline-flex h-14 items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-7 py-3.5 text-base font-bold text-white backdrop-blur transition-colors hover:bg-white/10">
                Become an Asset Partner
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-28 px-5 py-24">
        {/* ── TRACTION ───────────────────────────────────────────────── */}
        <section>
          <Reveal className="mx-auto max-w-2xl text-center">
            <SectionEyebrow>Proven traction · Zero outside capital</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">The numbers, unedited.</h2>
            <p className="mt-4 text-lg text-muted-foreground">Real figures from a real fleet — 100% bootstrapped.</p>
          </Reveal>
          <div className="mt-14 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {STATS.map((s, i) => (
              <Reveal key={s.label} delay={i * 90}>
                <StatCard {...s} />
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── THE SOLUTION ───────────────────────────────────────────── */}
        <section>
          <Reveal className="max-w-3xl">
            <SectionEyebrow>The solution</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">
              A premium experience for travelers.{' '}
              <span className="text-primary">Passive income for owners.</span>
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              {BRAND} built what Enterprise, Hertz and Avis never would — actual terminal delivery at both DFW
              airports — and turned it into a passive-income engine for vehicle owners.
            </p>
          </Reveal>
          <div className="mt-14 grid gap-4 sm:grid-cols-2">
            {PILLARS.map((p, i) => (
              <Reveal key={p.n} delay={i * 80}>
                <FrameCard {...p} />
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── HOW IT WORKS ───────────────────────────────────────────── */}
        <section>
          <Reveal className="max-w-3xl">
            <SectionEyebrow>How it works</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">Five steps. Zero headaches. Income in 30 days.</h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              From vehicle to passive income — {BRAND} handles 100% of operations, from listing to payout.
            </p>
          </Reveal>
          <ol className="mt-14 space-y-3">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} as="li" delay={i * 70}>
                <StepRow {...s} last={i === STEPS.length - 1} />
              </Reveal>
            ))}
          </ol>
        </section>

        {/* ── TESTIMONIALS ───────────────────────────────────────────── */}
        <section>
          <Reveal className="mx-auto max-w-2xl text-center">
            <SectionEyebrow>Don’t take our word for it</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">4.96★ across 2,053 reviews.</h2>
            <p className="mt-4 flex items-center justify-center gap-1 text-lg text-muted-foreground">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />
              ))}
              <span className="ms-2">Here’s what our partners say.</span>
            </p>
          </Reveal>
          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.mono} delay={i * 90}>
                <TestimonialCard {...t} />
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── WHO WE SERVE ───────────────────────────────────────────── */}
        <section>
          <Reveal className="max-w-3xl">
            <SectionEyebrow>Who {BRAND} serves</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">Two sides of one platform.</h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              Travel without hassle. Earn without effort.
            </p>
          </Reveal>
          <div className="mt-14 grid gap-4 sm:grid-cols-2">
            {AUDIENCES.map((a, i) => (
              <Reveal key={a.title} delay={i * 80}>
                <AudienceCard {...a} />
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── RISK & RESPONSIBILITY ──────────────────────────────────── */}
        <section>
          <Reveal className="max-w-3xl">
            <SectionEyebrow>Risk &amp; responsibility</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">
              Every risk has an owner. Most of them are us.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              Backed by a commercial policy with <span className="font-semibold text-foreground">$750K liability per trip</span>.
              The owner never files a claim directly.
            </p>
          </Reveal>
          <div className="mt-14 overflow-hidden rounded-3xl border border-border">
            {RISKS.map((r, i) => (
              <Reveal key={r.scenario} delay={i * 60}>
                <RiskRow {...r} first={i === 0} />
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── CLOSING CTA ────────────────────────────────────────────── */}
        <Reveal>
          <section className="grain relative isolate overflow-hidden rounded-[2rem] hero-mesh px-6 py-16 text-center sm:px-12 sm:py-20">
            <Sparkles className="mx-auto h-8 w-8 text-primary-soft" />
            <h2 className="display mx-auto mt-5 max-w-2xl text-4xl text-white sm:text-5xl">
              Your car could be earning next month.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-white/70">
              List the vehicle you already own, or book a car delivered to your terminal. Either way, {BRAND} does the work.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link href="/host" className="group inline-flex h-14 items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-base font-bold text-primary-foreground shadow-xl shadow-primary/20 transition-transform hover:scale-[1.03] active:scale-95">
                Become an Asset Partner <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link href="/search" className="inline-flex h-14 items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-7 py-3.5 text-base font-bold text-white backdrop-blur transition-colors hover:bg-white/10">
                Book a car
              </Link>
            </div>
          </section>
        </Reveal>
      </div>
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────── */

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-primary">
      <span className="h-px w-6 bg-primary/50" /> {children}
    </span>
  );
}

function StatCard({ prefix = '', value, suffix = '', decimals = 0, comma, label, sub }: {
  prefix?: string; value: number; suffix?: string; decimals?: number; comma?: boolean; label: string; sub?: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-card transition-all duration-500 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10">
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/10 blur-2xl transition-opacity duration-500 group-hover:opacity-80" />
      <p className="numeric text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
        {prefix}
        <CountUp value={value} decimals={decimals} comma={comma} />
        {suffix}
      </p>
      <p className="mt-3 text-sm font-medium text-foreground">{label}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function FrameCard({ n, icon: Icon, title, body }: { n: string; icon: typeof Car; title: string; body: string }) {
  return (
    <article className="group relative h-full overflow-hidden rounded-3xl border border-border bg-card p-7 shadow-card transition-all duration-500 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10">
      {/* Ghost number */}
      <span className="numeric pointer-events-none absolute -right-2 -top-5 text-[7rem] font-black leading-none text-foreground/[0.04] transition-colors duration-500 group-hover:text-primary/10">
        {n}
      </span>
      <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 transition-transform duration-500 group-hover:scale-110">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="display relative mt-5 text-xl">{title}</h3>
      <p className="relative mt-2.5 text-[15px] leading-relaxed text-muted-foreground">{body}</p>
    </article>
  );
}

function StepRow({ n, icon: Icon, title, body, tag, last }: {
  n: string; icon: typeof Car; title: string; body: string; tag: string; last: boolean;
}) {
  return (
    <div className="group relative flex gap-5 rounded-3xl border border-border bg-card p-6 shadow-card transition-all duration-500 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 sm:p-7">
      <div className="relative flex flex-col items-center">
        <span className="numeric flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-lg font-black text-primary-foreground shadow-lg shadow-primary/25">
          {n}
        </span>
        {!last && <span className="mt-2 hidden w-px flex-1 bg-gradient-to-b from-primary/40 to-transparent sm:block" />}
      </div>
      <div className="flex-1 pb-1">
        <h3 className="display flex items-center gap-2 text-xl">
          <Icon className="h-5 w-5 text-primary" /> {title}
        </h3>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{body}</p>
        <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <CheckCircle2 className="h-3.5 w-3.5" /> {tag}
        </span>
      </div>
    </div>
  );
}

function TestimonialCard({ quote, mono, name, meta }: { quote: string; mono: string; name: string; meta: string }) {
  return (
    <figure className="flex h-full flex-col rounded-3xl border border-border bg-card p-7 shadow-card transition-all duration-500 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-primary/10">
      <Quote className="h-7 w-7 text-primary/30" />
      <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed text-foreground/90">“{quote}”</blockquote>
      <figcaption className="mt-6 flex items-center gap-3 border-t border-border pt-5">
        <span className="numeric flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-sm font-black text-primary-foreground">
          {mono}
        </span>
        <span>
          <span className="block text-sm font-semibold text-foreground">{name}</span>
          <span className="block text-xs text-muted-foreground">{meta}</span>
        </span>
      </figcaption>
    </figure>
  );
}

function AudienceCard({ icon: Icon, title, body, href, cta }: {
  icon: typeof Car; title: string; body: string; href: string; cta: string;
}) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col rounded-3xl border border-border bg-card p-7 shadow-card transition-all duration-500 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 transition-transform duration-500 group-hover:scale-110">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="display mt-5 text-xl">{title}</h3>
      <p className="mt-2.5 flex-1 text-[15px] leading-relaxed text-muted-foreground">{body}</p>
      <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
        {cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </span>
    </Link>
  );
}

function RiskRow({ scenario, detail, owner, first }: {
  scenario: string; detail: string; owner: 'CatoDrive' | 'Owner'; first: boolean;
}) {
  const isCato = owner === 'CatoDrive';
  return (
    <div className={`flex flex-col gap-4 bg-card p-6 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:gap-6 sm:p-7 ${first ? '' : 'border-t border-border'}`}>
      <div className="flex-1">
        <p className="font-semibold text-foreground">{scenario}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{detail}</p>
      </div>
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-full px-3.5 py-1.5 text-xs font-bold sm:self-center ${
          isCato
            ? 'bg-success/10 text-success ring-1 ring-success/20'
            : 'bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400'
        }`}
      >
        <ShieldCheck className="h-3.5 w-3.5" /> {isCato ? `${BRAND} covers this` : 'Owner’s cost'}
      </span>
    </div>
  );
}

/**
 * Count up to a value once the element scrolls into view. Honors reduced motion
 * by showing the final value immediately.
 */
function CountUp({ value, decimals = 0, comma, durationMs = 1300 }: {
  value: number; decimals?: number; comma?: boolean; durationMs?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    let start = 0;
    const run = (t: number) => {
      if (!start) start = t;
      const p = Math.min((t - start) / durationMs, 1);
      // easeOutExpo — fast then settles, which reads as confident.
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setDisplay(value * eased);
      if (p < 1) raf = requestAnimationFrame(run);
    };
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          raf = requestAnimationFrame(run);
          obs.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, durationMs]);

  const formatted = display.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: !!comma,
  });
  return <span ref={ref}>{formatted}</span>;
}
