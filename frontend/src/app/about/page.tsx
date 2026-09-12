'use client';

import Link from 'next/link';
import Image from 'next/image';
import {
  PlaneTakeoff, Car, Banknote, Settings2, ShieldCheck, Star, Sparkles,
  ArrowRight, CheckCircle2, Camera, Wallet, ClipboardCheck, Quote,
} from 'lucide-react';
import { Reveal } from '@/components/ui/reveal';
import { SectionEyebrow, TractionStats, AudienceSection, BRAND } from '@/features/marketing/sections';

/**
 * About CatoDrive — the brand story, the traction, and the owner economics.
 *
 * The booking experience is the homepage; this is where the pitch lives. Built
 * on the same dark hero-mesh / display-type / Reveal system as the homepage so
 * the two read as one brand. The traction and audience blocks come from the
 * shared marketing module, so they stay identical to the ones on the homepage.
 *
 * Every figure here is CatoDrive marketing copy supplied by the business.
 * Confirm current numbers before each campaign — stale claims on a rental site
 * are a trust and legal risk.
 */

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
        <div className="mx-auto max-w-6xl px-5 pb-20 pt-24 sm:pb-28 sm:pt-32">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-primary-soft backdrop-blur">
              <PlaneTakeoff className="h-3.5 w-3.5" /> Airport mobility, reimagined
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="display mt-7 max-w-4xl text-[2.7rem] leading-[0.98] text-white sm:text-[4rem] lg:text-[4.9rem]">
              Airport mobility is trapped in{' '}
              <span className="text-white/30 line-through decoration-primary/70 decoration-4">1995</span>.
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

      {/* People shot — overlaps the seam between hero and content. Kept OUTSIDE
          the hero section (which is overflow-hidden for the grain texture and
          full-bleed trick) — a translated element bleeding past a clipped
          section gets cut off, which is exactly what was chopping this photo
          in half on mobile. A real negative margin does the overlap safely,
          and a responsive aspect ratio keeps it a real photo at every width
          instead of squashing into a thin strip on small screens. */}
      <div className="relative z-10 mx-auto -mt-14 max-w-6xl px-5 sm:-mt-20">
        <Reveal delay={300}>
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[1.75rem] border border-border shadow-2xl shadow-black/20 sm:aspect-[16/9] lg:aspect-[21/9]">
            <Image
              src="/newsections/cato-hero-people.webp"
              alt="CatoDrive concierge delivering a car to a traveler at the terminal"
              fill
              priority
              sizes="(min-width: 1152px) 1100px, 100vw"
              className="object-cover"
            />
          </div>
        </Reveal>
      </div>

      <div className="mx-auto max-w-6xl space-y-28 px-5 pb-24 pt-16 sm:pt-20">
        {/* Traction — shared with the homepage. */}
        <TractionStats />

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
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
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
          <ol className="mt-12 space-y-3">
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
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.mono} delay={i * 90}>
                <TestimonialCard {...t} />
              </Reveal>
            ))}
          </div>
        </section>

        {/* Who we serve — shared with the homepage (image cards). */}
        <AudienceSection />

        {/* ── RISK & RESPONSIBILITY ──────────────────────────────────── */}
        <section>
          <Reveal className="max-w-3xl">
            <SectionEyebrow>Risk &amp; responsibility</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">Every risk has an owner. Most of them are us.</h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              Backed by a commercial policy with <span className="font-semibold text-foreground">$750K liability per trip</span>.
              The owner never files a claim directly.
            </p>
          </Reveal>
          <div className="mt-12 overflow-hidden rounded-3xl border border-border">
            {RISKS.map((r, i) => (
              <Reveal key={r.scenario} delay={i * 60}>
                <RiskRow {...r} first={i === 0} />
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── CLOSING CTA (image background) ─────────────────────────── */}
        <Reveal>
          <section className="relative isolate overflow-hidden rounded-[2rem] px-6 py-20 text-center sm:px-12 sm:py-24">
            <Image
              src="/newsections/become_asset_partner.webp"
              alt=""
              fill
              sizes="(min-width: 1152px) 1100px, 100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/80 to-ink/70" />
            <div className="relative">
              <Sparkles className="mx-auto h-8 w-8 text-primary-soft" />
              <h2 className="display mx-auto mt-5 max-w-2xl text-4xl text-white sm:text-5xl">
                Your car could be earning next month.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-white/75">
                List the vehicle you already own, or book a car delivered to your terminal. Either way, {BRAND} does the work.
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Link href="/host" className="group inline-flex h-14 items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-base font-bold text-primary-foreground shadow-xl shadow-primary/20 transition-transform hover:scale-[1.03] active:scale-95">
                  Become an Asset Partner <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link href="/search" className="inline-flex h-14 items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-7 py-3.5 text-base font-bold text-white backdrop-blur transition-colors hover:bg-white/20">
                  Book a car
                </Link>
              </div>
            </div>
          </section>
        </Reveal>
      </div>
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────── */

function FrameCard({ n, icon: Icon, title, body }: { n: string; icon: typeof Car; title: string; body: string }) {
  return (
    <article className="group relative h-full overflow-hidden rounded-3xl border border-border bg-card p-7 shadow-card transition-all duration-500 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10">
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
