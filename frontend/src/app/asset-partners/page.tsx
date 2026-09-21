'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight, ArrowDown, ShieldCheck, Car, Camera, ClipboardCheck, Settings2, Wallet,
  Star, ChevronDown, CheckCircle2, Gauge, Calendar, FileCheck, Sparkles,
  Phone, Mail, Clock,
} from 'lucide-react';
import { Reveal } from '@/components/ui/reveal';
import { SectionEyebrow, CountUp, BRAND } from '@/features/marketing/sections';

/**
 * Asset Partners — CatoDrive's primary acquisition page (v1 priority, per the
 * business). Someone who already owns an eligible car lists it here; CatoDrive runs
 * 100% of operations and pays them a monthly share. Host (self-managed listing)
 * and Corporate/Fleet remain as v2/v3 surfaces, unchanged by this page.
 *
 * All figures are business-supplied (owner economics, fleet revenue, vehicle
 * tiers, testimonials) — confirm before each campaign. "Apply Now" routes to
 * the dedicated Asset Partner intake form (/asset-partners/apply), which
 * submits a real application for admin review.
 */

const STATS = [
  { prefix: '$', value: 705, suffix: 'K+', decimals: 0, label: '2026 Fleet Revenue' },
  { prefix: '$1,029–$1,841', value: 0, suffix: '', decimals: 0, label: 'Net Monthly Per Vehicle', raw: true },
  { prefix: '', value: 80, suffix: '%', decimals: 0, label: 'Owner Share of Every Booking' },
  { prefix: '', value: 3626, suffix: '', decimals: 0, label: 'Trips Completed · 4.9★ All-Star Host', comma: true },
] as const;

const STEPS = [
  { n: '01', icon: Car, title: 'List the Car You Own', body: 'You already own an eligible vehicle — CatoDrive lists it, photographs it, and prices it dynamically. No purchase or financing required.' },
  { n: '02', icon: Camera, title: `${BRAND} Lists It`, body: 'We photograph, list, price dynamically, and manage your car. You do nothing. $0 additional effort.' },
  { n: '03', icon: ClipboardCheck, title: 'Guest Books Online', body: 'A vetted traveler books. CatoDrive screens every trip. You’re never involved.' },
  { n: '04', icon: Settings2, title: 'We Manage Everything', body: 'Valet pickup, terminal delivery, cleaning, maintenance coordination. Full white-glove service.' },
  { n: '05', icon: Wallet, title: 'You Get Paid', body: '80% of every booking hits your account monthly — check on the 5th or Zelle. No invoices. No chasing.', tag: 'Net $1,029–$1,841 / month' },
] as const;

const ECONOMICS: { label: string; value: string; muted?: boolean }[] = [
  { label: 'Average daily rate', value: '$65–$120/day' },
  { label: 'Target utilization (70–80%)', value: '~21–24 days/month' },
  { label: 'Gross monthly revenue', value: '$1,365–$2,028' },
  { label: 'Management fee (20%)', value: '−$273 to −$406', muted: true },
  { label: 'Roamly fleet insurance', value: '−$137', muted: true },
  { label: 'Professional detailing', value: '−$50', muted: true },
];

const TIERS = [
  { tier: 'Conservative', amount: '$1,029', vehicles: 'Kia Sportage, Buick Envista', tone: 'default' as const },
  { tier: 'Mid-range', amount: '$1,400', vehicles: 'VW Tiguan, Jeep Grand Cherokee', tone: 'primary' as const },
  { tier: 'Top performer', amount: '$1,841', vehicles: 'VW Atlas, Nissan Pathfinder', tone: 'success' as const },
] as const;

const GROWTH = [
  { year: '2023', value: '$1,574' },
  { year: '2025', value: '$307K' },
  { year: '2026', value: '$405K+' },
] as const;

const REQUIREMENTS = [
  { icon: Calendar, label: 'Model year', value: '2018 or newer' },
  { icon: Gauge, label: 'Mileage', value: 'Under 130,000 miles at onboarding' },
  { icon: FileCheck, label: 'Title', value: 'Clean only — no salvage, rebuilt, flood, or lien' },
  { icon: ShieldCheck, label: 'Condition', value: 'No major body, structural, rust or cosmetic damage' },
  { icon: CheckCircle2, label: 'Standards', value: 'Smoke-free · pet-free · 4/32" minimum tread' },
] as const;

const RISKS = [
  { scenario: 'Renter damages the vehicle', detail: 'Roamly commercial fleet insurance covers the vehicle during all non-trip periods in CatoDrive custody. Your deductible is capped at $1,000 per incident (Addendum No. 1) — CatoDrive absorbs any unrecovered deductible above that cap.', owner: 'CatoDrive' as const },
  { scenario: 'The car sits empty', detail: 'We manage pricing, listing optimization and the booking pipeline 24/7. Your exposure is zero.', owner: 'CatoDrive' as const },
  { scenario: 'Guest no-show or late return', detail: 'Our operations team handles all guest issues, rescheduling and late-fee recovery.', owner: 'CatoDrive' as const },
  { scenario: 'Routine maintenance', detail: 'Routine maintenance under $500 is handled without interrupting you. Anything above $500 requires your approval first.', owner: 'Shared' as const },
  { scenario: 'Regulatory / platform changes', detail: 'We monitor TOS, airport concession rules and P2P regulations proactively.', owner: 'CatoDrive' as const },
] as const;

/**
 * The four things every prospective partner asks, answered in CatoDrive's own
 * voice.
 *
 * This section used to be four testimonials — quotes attributed to a
 * "Portfolio Owner", a "DFW Investor" and a "Co-host Owner" who are not real
 * people, making specific financial claims ("$1,400 my first month",
 * "breakeven in 14 months", "insurance covered everything, I paid nothing").
 * Presenting those as customer endorsements is an FTC problem regardless of
 * whether the underlying economics are accurate, and the insurance one asserts
 * a claims outcome we cannot evidence.
 *
 * Every answer below is the same substance, stated as what the programme does
 * rather than as something a customer said. Each figure here is also published
 * elsewhere on this page (ECONOMICS, RISKS, FAQ), so there is one story.
 *
 * When real, attributable partner quotes exist, they belong here — with a real
 * name and consent, replacing this block.
 */
const PARTNER_ANSWERS = [
  {
    q: 'Do I have to do anything?',
    a: 'No. CatoDrive photographs the car, lists it, prices it, screens every guest, handles delivery and collection, and coordinates cleaning and maintenance. Your involvement after handover is approving anything over the maintenance threshold.',
  },
  {
    q: 'What does it actually pay?',
    a: 'You keep 80% of gross booking revenue. Insurance and detailing are itemised monthly, never bundled into a vague fee, and the full arithmetic is shown above before you apply.',
  },
  {
    q: 'What if a renter damages it?',
    a: 'Your exposure is capped per incident under Addendum No. 1 of the partner agreement, and CatoDrive absorbs unrecovered damage above that cap. The cap is stated in your agreement before you sign.',
  },
  {
    q: 'Can I get my car back?',
    a: 'It stays your car. Set blackout dates whenever you need it and it will not be booked during those windows. The exit terms are in the agreement, not buried in a policy page.',
  },
] as const;

const FAQ = [
  { q: 'What vehicles do you accept?', a: 'A 2018-or-newer model with a clean title, under 130,000 miles, no major body, structural or cosmetic damage, and it must be smoke-free, pet-free, with at least 4/32" of tread. AWD SUVs and crossovers with 5–7 seats, leather and Apple CarPlay are strongly preferred — that’s what performs best in the airport market. CatoDrive reserves the right to decline any vehicle that doesn’t meet these standards, which is what keeps quality consistent across every partner’s car.' },
  { q: 'How much will I actually earn?', a: 'Based on the active fleet, partners net $1,029–$1,841 per vehicle per month after the management fee, insurance and detailing are deducted — roughly $65–$120/day at 70–80% utilization. Where a specific car lands in that range depends mostly on the model: conservative performers like a Kia Sportage sit around $1,029/mo, mid-range vehicles like a VW Tiguan around $1,400/mo, and top performers like a VW Atlas or Nissan Pathfinder around $1,841/mo. These are illustrative examples from the real fleet, not a guarantee.' },
  { q: 'What does CatoDrive charge?', a: 'A 20% management fee on gross booking revenue — that covers listing, dynamic pricing, guest screening, valet delivery, cleaning coordination and 24/7 operations. Fleet insurance (Roamly) and professional detailing are itemized separately in your monthly statement.' },
  { q: 'What about insurance?', a: 'Every vehicle is covered by Roamly commercial fleet insurance for the entire time it’s in CatoDrive’s custody — not just during trips. If a renter causes damage, your out-of-pocket exposure is capped at $1,000 per incident; CatoDrive absorbs anything above that cap.' },
  { q: 'Do I need to buy a car to join?', a: 'No. The program is built for vehicles you already own. There’s no purchase or financing requirement to become an asset partner — your only ongoing responsibility is financing you may already carry on the car itself.' },
  { q: 'What are the program terms?', a: 'CatoDrive handles listing, pricing, guest screening, delivery, cleaning and maintenance coordination under the management fee described above. Maintenance decisions above $500 always come to you for approval first. Full terms are covered in your partner agreement at signup.' },
  { q: 'Can I still use my car?', a: 'Yes — CatoDrive works around blackout dates you set, so you can block off the days you need the car and it simply won’t be booked during those windows.' },
  { q: 'How fast do I get my first payout?', a: 'Payouts run monthly — on the 5th, by check or Zelle — covering trips completed the prior month. Most partners see their first payout within 30–45 days of their car going live, depending on when it starts booking.' },
] as const;

export default function AssetPartnersPage() {
  return (
    <div className="-mt-6">
      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="full-bleed relative isolate grain overflow-hidden hero-mesh">
        <div className="mx-auto max-w-6xl px-5 pb-20 pt-24 sm:pb-28 sm:pt-32">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-primary-soft backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> Become an Asset Partner
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="display mt-7 max-w-3xl text-[2.5rem] leading-[0.98] text-white sm:text-[3.6rem] lg:text-[4.4rem]">
              Put your car to work. We run it. You collect every month.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-7 max-w-2xl text-lg leading-relaxed text-white/70 sm:text-xl">
              {BRAND} asset partners net <span className="font-semibold text-white">$1,029–$1,841/month</span> per
              vehicle. We handle 100% of operations — listing, pricing, valet delivery, cleaning, maintenance and
              insurance. Your only job is cashing the check.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link href="/asset-partners/apply" className="group inline-flex h-14 items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-base font-bold text-primary-foreground shadow-xl shadow-primary/20 transition-transform hover:scale-[1.03] active:scale-95">
                Apply Now <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a href="#numbers" className="inline-flex h-14 items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-7 py-3.5 text-base font-bold text-white backdrop-blur transition-colors hover:bg-white/10">
                See the Numbers <ArrowDown className="h-4 w-4" />
              </a>
            </div>
          </Reveal>
          {/* Returning partners land on this page too — give them the way back
              to their own application and earnings rather than only a pitch. */}
          <Reveal delay={300}>
            <Link
              href="/asset-partners/dashboard"
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-soft hover:underline"
            >
              Already applied? Track your application <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-28 px-5 pb-24 pt-16 sm:pt-20">
        {/* ── VERIFIED PERFORMANCE ───────────────────────────────────── */}
        <section id="numbers" className="scroll-mt-24">
          <Reveal className="mx-auto max-w-2xl text-center">
            <SectionEyebrow>Verified performance</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">The numbers, unedited.</h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Real numbers from a real fleet — 4 years operating, All-Star Host, $0 outside capital.
            </p>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map((s, i) => (
              <Reveal key={s.label} delay={i * 90}>
                <StatCard {...s} />
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── FIVE STEPS ─────────────────────────────────────────────── */}
        <section>
          <Reveal className="max-w-3xl">
            <SectionEyebrow>How it works</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">Five steps. Zero headaches. Income in 30 days.</h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              Owner responsibility: vehicle financing only. {BRAND} handles 100% of operations from list to payout.
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

        {/* ── OWNER ECONOMICS ────────────────────────────────────────── */}
        <section>
          <Reveal className="max-w-3xl">
            <SectionEyebrow>Step 01 · Owner economics</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">Here’s exactly what stays in your pocket.</h2>
          </Reveal>

          <div className="mt-12 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            <Reveal>
              <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
                <div className="divide-y divide-border px-6">
                  {ECONOMICS.map((e) => (
                    <div key={e.label} className="flex items-center justify-between py-3.5 text-sm">
                      <span className={e.muted ? 'text-muted-foreground' : 'font-medium text-foreground'}>{e.label}</span>
                      <span className="numeric tabular-nums font-semibold text-foreground">{e.value}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-baseline justify-between bg-primary/[0.06] px-6 py-5">
                  <span className="text-base font-black text-foreground">Net monthly to partner</span>
                  <span className="numeric text-2xl font-black tabular-nums text-primary">$1,029–$1,841</span>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Verified from the active fleet — earnings examples are illustrative only; no income guarantees.
              </p>
            </Reveal>

            <Reveal delay={100}>
              <div className="flex h-full flex-col gap-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                  What partners actually earn, by vehicle
                </p>
                {TIERS.map((t) => (
                  <TierRow key={t.tier} {...t} />
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── TOP PERFORMERS ─────────────────────────────────────────── */}
        <section>
          <Reveal className="max-w-3xl">
            <SectionEyebrow>Step 02 · Top performers (2025)</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">Real revenue from real vehicles.</h2>
          </Reveal>

          <div className="mt-12 grid gap-4 lg:grid-cols-2">
            <Reveal>
              <div className="h-full rounded-3xl border border-border bg-card p-7 shadow-card">
                <ul className="space-y-3 text-sm text-foreground">
                  <li className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                    <span><span className="font-semibold">VW Atlas / Nissan Pathfinder</span> — top performers, ~$1,841/mo net</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span><span className="font-semibold">VW Tiguan / Jeep Grand Cherokee</span> — mid-range, ~$1,400/mo net</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                    <span><span className="font-semibold">Kia Sportage / Buick Envista</span> — conservative, ~$1,029/mo net</span>
                  </li>
                </ul>
                <div className="mt-6 rounded-2xl bg-primary/5 p-4 ring-1 ring-primary/15">
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">Sweet spot vehicles</p>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    AWD SUVs and crossovers, 5–7 seats, leather interiors, Apple CarPlay — 2018 or newer, under
                    130,000 miles, clean title only.
                  </p>
                </div>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <div className="h-full rounded-3xl border border-border bg-card p-7 shadow-card">
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Fleet revenue growth</p>
                <div className="mt-4 flex items-end justify-between gap-4">
                  {GROWTH.map((g, i) => (
                    <div key={g.year} className="flex flex-1 flex-col items-center gap-2">
                      <div
                        className="w-full rounded-t-xl bg-gradient-to-t from-primary/40 to-primary"
                        style={{ height: `${44 + i * 34}px` }}
                      />
                      <p className="numeric text-lg font-black text-foreground">{g.value}</p>
                      <p className="text-xs text-muted-foreground">{g.year}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">$405K+ earned in 2026</span> across 100 managed
                  vehicles, with $0 outside capital. The airport market is strong and proven.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── VEHICLE REQUIREMENTS ───────────────────────────────────── */}
        <section>
          <Reveal className="max-w-3xl">
            <SectionEyebrow>Step 03 · Vehicle requirements</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">Does your car qualify?</h2>
          </Reveal>

          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {REQUIREMENTS.map((r, i) => (
              <Reveal key={r.label} delay={i * 60}>
                <div className="flex items-start gap-3.5 rounded-2xl border border-border bg-card p-5 shadow-card">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <r.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{r.label}</p>
                    <p className="mt-0.5 text-sm font-semibold text-foreground">{r.value}</p>
                  </div>
                </div>
              </Reveal>
            ))}
            <Reveal delay={REQUIREMENTS.length * 60}>
              <div className="flex items-start gap-3.5 rounded-2xl border border-primary/20 bg-primary/5 p-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                  <Star className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">Strongly preferred</p>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">
                    SUVs and crossovers, 5–7 seats, leather, Apple CarPlay
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
          <Reveal delay={(REQUIREMENTS.length + 1) * 60}>
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              {BRAND} holds the right to reject any vehicle that doesn’t meet standards. This protects every partner
              on the platform.
            </p>
          </Reveal>
        </section>

        {/* ── RISK & RESPONSIBILITY ──────────────────────────────────── */}
        <section>
          <Reveal className="max-w-3xl">
            <SectionEyebrow>Risk &amp; responsibility</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">Every risk has an owner. Most of them are us.</h2>
          </Reveal>
          <div className="mt-12 overflow-hidden rounded-3xl border border-border">
            {RISKS.map((r, i) => (
              <Reveal key={r.scenario} delay={i * 60}>
                <RiskRow {...r} first={i === 0} />
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── WHAT PARTNERS ASK ──────────────────────────────────────── */}
        <section>
          <Reveal className="mx-auto max-w-2xl text-center">
            <SectionEyebrow>Straight answers</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">The four questions everyone asks.</h2>
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {PARTNER_ANSWERS.map((t, i) => (
              <Reveal key={t.q} delay={i * 80}>
                <AnswerCard {...t} />
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── FAQ ─────────────────────────────────────────────────────── */}
        <section>
          <Reveal className="mx-auto max-w-2xl text-center">
            <SectionEyebrow>Asset Partner FAQ</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">Common questions from prospective partners.</h2>
          </Reveal>
          <div className="mx-auto mt-12 max-w-3xl divide-y divide-border overflow-hidden rounded-3xl border border-border">
            {FAQ.map((f, i) => (
              <FaqRow key={f.q} {...f} defaultOpen={i === 0} />
            ))}
          </div>
        </section>

        {/* ── CONTACT ─────────────────────────────────────────────────── */}
        <section>
          <Reveal className="max-w-3xl">
            <SectionEyebrow>Questions?</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">Talk to the partnerships team.</h2>
          </Reveal>
          <Reveal delay={80}>
            <div className="mt-10 grid gap-px overflow-hidden rounded-3xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
              <ContactCell icon={Phone} label="Call / Text" value="(214) 814-0402" href="tel:+12148140402" />
              <ContactCell icon={Mail} label="Email" value="shoaib@catodrive.com" href="mailto:shoaib@catodrive.com" />
              <ContactCell icon={Clock} label="Response Time" value="We review every application and respond within 2–3 business days." />
              <ContactCell icon={ClipboardCheck} label="Eligibility" value="2018+ · under 130,000 mi · clean title · SUV preferred" />
            </div>
          </Reveal>
          <Reveal delay={140}>
            <Link href="/contact?interest=asset_partner" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
              Or send us a message <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Reveal>
        </section>

        {/* ── CLOSING CTA ────────────────────────────────────────────── */}
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
                List the vehicle you already own — {BRAND} does the rest.
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Link href="/asset-partners/apply" className="group inline-flex h-14 items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-base font-bold text-primary-foreground shadow-xl shadow-primary/20 transition-transform hover:scale-[1.03] active:scale-95">
                  Apply Now <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
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

function StatCard({ prefix = '', value, suffix = '', decimals = 0, comma, label, raw }: {
  prefix?: string; value: number; suffix?: string; decimals?: number; comma?: boolean; label: string; raw?: boolean;
}) {
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-card transition-all duration-500 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10">
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/10 blur-2xl transition-opacity duration-500 group-hover:opacity-80" />
      <p className="numeric text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
        {raw ? prefix : <>{prefix}<CountUp value={value} decimals={decimals} comma={comma} />{suffix}</>}
      </p>
      <p className="mt-3 text-sm font-medium text-foreground">{label}</p>
    </div>
  );
}

function StepRow({ n, icon: Icon, title, body, tag, last }: {
  n: string; icon: typeof Car; title: string; body: string; tag?: string; last: boolean;
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
        {tag && (
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <CheckCircle2 className="h-3.5 w-3.5" /> {tag}
          </span>
        )}
      </div>
    </div>
  );
}

function TierRow({ tier, amount, vehicles, tone }: { tier: string; amount: string; vehicles: string; tone: 'default' | 'primary' | 'success' }) {
  const tones = {
    default: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/10 text-primary ring-1 ring-primary/20',
    success: 'bg-success/10 text-success ring-1 ring-success/20',
  } as const;
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-card">
      <div>
        <p className="text-sm font-semibold text-foreground">{tier}</p>
        <p className="text-xs text-muted-foreground">{vehicles}</p>
      </div>
      <span className={`numeric shrink-0 rounded-full px-3 py-1.5 text-sm font-black tabular-nums ${tones[tone]}`}>
        {amount}/mo
      </span>
    </div>
  );
}

function RiskRow({ scenario, detail, owner, first }: {
  scenario: string; detail: string; owner: 'CatoDrive' | 'Shared'; first: boolean;
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
        <ShieldCheck className="h-3.5 w-3.5" /> {isCato ? `${BRAND} covers this` : 'Shared responsibility'}
      </span>
    </div>
  );
}

/**
 * A question and CatoDrive's answer to it. Replaces the old TestimonialCard,
 * which framed company claims as quotes from partners who do not exist.
 *
 * The card is quieter than the one it replaces: no hover lift, no coloured
 * shadow, no gradient-filled avatar disc. This is reference material someone
 * reads before committing their car — it should hold still while they read it.
 */
function AnswerCard({ q, a }: { q: string; a: string }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-7 shadow-soft">
      <h3 className="text-base font-semibold text-foreground">{q}</h3>
      <p className="mt-3 flex-1 text-[15px] leading-relaxed text-muted-foreground">{a}</p>
    </div>
  );
}

function FaqRow({ q, a, defaultOpen }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-muted/30"
      >
        <span className="text-[15px] font-semibold text-foreground">{q}</span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 ${open ? 'rotate-180 text-primary' : ''}`} />
      </button>
      <div className={`grid transition-all duration-300 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <p className="px-6 pb-5 text-sm leading-relaxed text-muted-foreground">{a}</p>
        </div>
      </div>
    </div>
  );
}

function ContactCell({ icon: Icon, label, value, href }: {
  icon: typeof Phone; label: string; value: string; href?: string;
}) {
  const content = (
    <>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <p className="mt-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-[15px] leading-snug text-foreground ${href ? 'font-semibold' : ''}`}>{value}</p>
    </>
  );
  return href ? (
    <a href={href} className="bg-card p-6 transition-colors hover:bg-primary/[0.04]">{content}</a>
  ) : (
    <div className="bg-card p-6">{content}</div>
  );
}
