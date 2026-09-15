'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowDown, ChevronDown, Building2, Wrench, Plane, Globe2, RefreshCw, FileBarChart, Eye, ShieldCheck, Scale, TrendingUp } from 'lucide-react';
import { Reveal } from '@/components/ui/reveal';
import { SectionEyebrow, CountUp, BRAND } from '@/features/marketing/sections';

/**
 * Investor Relations — built entirely in CATO's own design system (hero-mesh,
 * primary teal, Archivo display type, Reveal motion, the same numbered-frame
 * and stat-card language as /asset-partners and /about) — not a skin ported
 * from the supplied copy. Same brand as the rest of the site: this is
 * CATO's fundraising page, not a separate product.
 *
 * The centerpiece is a revenue figure that visibly climbs while an investor
 * watches — labeled honestly as an illustrative YTD-pace calculation (see
 * LiveTicker), because a page asking for $21K+ checks can't afford to imply a
 * live-data capability that doesn't exist.
 *
 * All figures are business-supplied. "Request the Full Deck" is a mailto:
 * for now — swap to the Investment Inquiry application once that's built.
 * The accredited-investor FAQ answer is deliberately hedged (see FAQ_ITEMS)
 * and should be reviewed by securities counsel before this page is used to
 * solicit real investment.
 */

const ROUND_TERMS = [
  { value: '$504,000', label: 'Total raise (SAFE · Late Seed)' },
  { value: '$16.8M', label: 'Pre-money valuation' },
  { value: '$21,000', label: 'Minimum investment (0.125% equity)' },
  { value: '~3%', label: 'Total equity offered' },
] as const;

const TRACTION = [
  { value: 100, prefix: '', suffix: '', label: 'Vehicles managed' },
  { value: 716, prefix: '$', suffix: 'K+', label: '2026 YTD revenue' },
  { value: 3626, prefix: '', suffix: '', comma: true, label: 'Completed trips · 4.9★ All-Star Host' },
  { value: 0, prefix: '$', suffix: '', label: 'Outside capital raised' },
] as const;

const GROWTH = [
  { year: '2023', value: 1574, display: '$1,574', target: false },
  { year: '2025', value: 307000, display: '$307K', target: false },
  { year: '2026 YTD', value: 716755, display: '$716K+', target: false },
  { year: '2026 target', value: 1_200_000, display: '$1.2M', target: true },
] as const;

const VISION = [
  { icon: Building2, title: 'Corporate Clients', body: 'B2B fleet accounts for enterprises & staffing agencies. Guaranteed utilization, lower churn.' },
  { icon: Wrench, title: 'Auto Repair Shops', body: 'Loaner-vehicle partnerships. Flat daily rates — zero-CAC recurring revenue.' },
  { icon: Plane, title: 'Private Jet FBOs', body: 'White-glove SUV delivery to private terminals. Premium pricing, premium clientele.' },
  { icon: Globe2, title: 'National Expansion', body: 'Beta live at ORD Chicago O’Hare with 3 vehicles — the same DFW playbook.' },
] as const;

const FUNDS = [
  { label: 'Platform development (consumer app + white-label SaaS)', pct: 45 },
  { label: 'Fleet staging facility (rent & operations)', pct: 35 },
  { label: 'Marketing & working capital', pct: 20 },
] as const;

const EXITS = [
  { label: 'Base · 8×', moic: '3.8× MOIC', value: '$1.92M', detail: '$8M revenue → $64M enterprise value', strong: false },
  { label: 'Strong · 8×', moic: '4.8× MOIC', value: '$2.4M', detail: '$10M revenue → $80M enterprise value', strong: true },
  { label: 'Bull · 10×', moic: '7.1× MOIC', value: '$3.6M', detail: '$12M revenue → $120M enterprise value', strong: false },
] as const;

const RIGHTS = [
  { icon: RefreshCw, title: 'Pro-Rata on Future Rounds', body: 'Maintain your ownership percentage in subsequent financings.' },
  { icon: FileBarChart, title: 'Quarterly Financials', body: 'Regular reporting on revenue, fleet size, and operating performance.' },
  { icon: Eye, title: 'Board Observer at $100K+', body: 'Investors at $100,000 and above receive board-observer rights.' },
  { icon: ShieldCheck, title: 'Anti-Dilution Protection', body: 'Protection against down-round dilution.' },
  { icon: Scale, title: 'MFN Clause', body: 'Most-favored-nation terms — you get the best terms offered in this round.' },
] as const;

/**
 * Composed strictly from facts already stated elsewhere on this page, with
 * one deliberate exception (accreditation) — see the file header.
 */
const FAQ_ITEMS = [
  { q: 'What exactly am I investing in?', a: 'A SAFE (Simple Agreement for Future Equity) — Late Seed stage, converting at a $16.8M pre-money valuation cap at the next priced round. CatoDrive is targeting a Series A in Q4 2026.' },
  { q: 'Do I have to be an accredited investor?', a: 'Offerings of this kind are typically limited to accredited investors under SEC Regulation D. Eligibility is confirmed as part of the formal subscription process — request the full deck and speak with CatoDrive’s team to confirm your status before committing.' },
  { q: 'What’s the minimum investment and what equity does it represent?', a: 'The minimum investment is $21,000, representing approximately 0.125% equity. The round offers roughly 3% total equity.' },
  { q: 'How is the $504,000 used?', a: '45% platform development (the consumer marketplace app and white-label SaaS), 35% a fleet staging facility (rent and operations), and 20% marketing and working capital.' },
  { q: 'What rights do investors receive?', a: 'Pro-rata rights on future rounds, quarterly financial reporting, anti-dilution protection, and a most-favored-nation (MFN) clause. Investors at $100,000 or above also receive board-observer rights.' },
  { q: 'Is this an offer of securities?', a: 'No. This page and any related materials are an expression of interest only and do not constitute an offer to sell, or a solicitation of an offer to buy, any securities. Any actual offer will be made only through definitive subscription documents to qualified investors, in compliance with applicable securities laws.' },
] as const;

const YEAR_START = Date.UTC(2026, 0, 1);
const YTD_ANCHOR = 716_755;

export default function InvestorsPage() {
  return (
    <div className="-mt-6">
      {/* Compliance strip */}
      <div className="border-b border-border bg-muted/40 py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
        Expression of interest only — not an offer of securities
      </div>

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="full-bleed relative isolate grain overflow-hidden hero-mesh">
        <div className="mx-auto max-w-5xl px-5 py-20 sm:py-28">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-primary-soft backdrop-blur">
              <TrendingUp className="h-3.5 w-3.5" /> Investor Relations
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="display mt-7 max-w-3xl text-[2.5rem] leading-[0.98] text-white sm:text-[3.8rem] lg:text-[4.6rem]">
              Invest in a proven, profitable DFW fleet.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-7 max-w-2xl text-lg leading-relaxed text-white/70 sm:text-xl">
              {BRAND} is bootstrapped, profitable, and operating — 100 vehicles at DFW International and Love Field,
              $716K+ earned in 2026 with $0 outside capital. We’re raising a{' '}
              <span className="font-semibold text-white">$504,000 SAFE</span> (Late Seed) at a{' '}
              <span className="font-semibold text-white">$16.8M pre-money valuation</span> to build a direct Turo
              competitor and a white-label fleet SaaS.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-10 flex flex-wrap gap-3">
              <a href="mailto:invest@catodrive.com?subject=Request%20the%20CatoDrive%20Deck" className="group inline-flex h-14 items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-base font-bold text-primary-foreground shadow-xl shadow-primary/20 transition-transform hover:scale-[1.03] active:scale-95">
                Request the Full Deck <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
              <a href="#traction" className="inline-flex h-14 items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-7 py-3.5 text-base font-bold text-white backdrop-blur transition-colors hover:bg-white/10">
                See the Numbers <ArrowDown className="h-4 w-4" />
              </a>
            </div>
          </Reveal>

          <Reveal delay={300}>
            <LiveTicker />
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-28 px-5 pb-24 pt-16 sm:pt-20">
        {/* ── THE ROUND ────────────────────────────────────────────────── */}
        <section>
          <Reveal className="max-w-3xl">
            <SectionEyebrow>The Round</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">SAFE · Late Seed · converts at cap.</h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">Series A target Q4 2026.</p>
          </Reveal>
          <div className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {ROUND_TERMS.map((t, i) => (
              <Reveal key={t.label} delay={i * 80}>
                <div className="group relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-card transition-all duration-500 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10">
                  <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/10 blur-2xl transition-opacity duration-500 group-hover:opacity-80" />
                  <p className="numeric text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">{t.value}</p>
                  <p className="mt-3 text-sm font-medium text-muted-foreground">{t.label}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── TRACTION ─────────────────────────────────────────────────── */}
        <section id="traction" className="scroll-mt-24">
          <Reveal className="mx-auto max-w-2xl text-center">
            <SectionEyebrow>Traction</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">100% bootstrapped, profitable, operating.</h2>
            <p className="mt-4 text-lg text-muted-foreground">4 years operating across DFW International and Dallas Love Field.</p>
          </Reveal>
          <div className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {TRACTION.map((s, i) => (
              <Reveal key={s.label} delay={i * 90}>
                <div className="group relative overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-card transition-all duration-500 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10">
                  <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/10 blur-2xl transition-opacity duration-500 group-hover:opacity-80" />
                  <p className="numeric text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
                    {s.prefix}<CountUp value={s.value} comma={'comma' in s ? s.comma : false} />{s.suffix}
                  </p>
                  <p className="mt-3 text-sm font-medium text-foreground">{s.label}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── COMPANY OVERVIEW ─────────────────────────────────────────── */}
        <section>
          <Reveal className="max-w-3xl">
            <SectionEyebrow>Step 01 · Company overview</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">195× revenue growth — zero outside capital.</h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              {BRAND} is a bootstrapped, profitable fleet-management company operating 100 vehicles at DFW
              International and Love Field — $716,755 earned in 2026 with zero outside capital. Four years of
              operations. Institutional-grade fleet management, All-Star Host status, 3,626 trips completed.
            </p>
          </Reveal>

          <Reveal delay={100}>
            <div className="mt-12 rounded-3xl border border-border bg-card p-8 shadow-card">
              <div className="flex items-end gap-4 sm:gap-8" style={{ height: 220 }}>
                {GROWTH.map((g) => (
                  <GrowthBar key={g.year} {...g} />
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 text-lg text-muted-foreground">
              That’s <span className="font-bold text-primary">195× growth</span> — built entirely on operating cash flow.
            </p>
          </Reveal>
        </section>

        {/* ── PLATFORM VISION ──────────────────────────────────────────── */}
        <section>
          <Reveal className="max-w-3xl">
            <SectionEyebrow>Step 02 · Platform vision</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">From fleet operator to platform company.</h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              Building a direct Turo competitor. This investment accelerates the {BRAND} consumer marketplace — a
              fully independent P2P rental platform that captures full booking margin and owns every customer
              relationship. The same platform, licensed to independent fleet operators nationwide, transforms{' '}
              {BRAND} into a platform company with recurring B2B revenue.
            </p>
            <p className="mt-3 text-lg text-muted-foreground">
              Revenue target (goal): <span className="font-bold text-primary">$10.08M</span> — 700 vehicles ×
              $1,200/mo × 12.
            </p>
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {VISION.map((v, i) => (
              <Reveal key={v.title} delay={i * 80}>
                <div className="group flex h-full flex-col rounded-3xl border border-border bg-card p-7 shadow-card transition-all duration-500 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 transition-transform duration-500 group-hover:scale-110">
                    <v.icon className="h-6 w-6" />
                  </span>
                  <h3 className="display mt-5 text-xl">{v.title}</h3>
                  <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">{v.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── FINANCIAL PERFORMANCE ────────────────────────────────────── */}
        <section>
          <Reveal className="max-w-3xl">
            <SectionEyebrow>Step 03 · Financial performance</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">$716K earned in 2026 · $1.2M full-year target.</h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              2026 YTD revenue: $716,755 (verified). Full-year projection: $1.2M+ (Q4 2026 target). Confirmed
              pipeline: $78,734 upcoming bookings. 700-vehicle revenue goal: $10.08M (700 × $1,200/mo × 12).
            </p>
            <p className="mt-3 text-lg text-muted-foreground">
              Trajectory: $307K (2025, 72 vehicles) → $1.2M (2026, 100+ vehicles) → $10.08M (700-vehicle target).
            </p>
          </Reveal>

          {/* Use of funds */}
          <Reveal delay={100}>
            <div className="mt-12 rounded-3xl border border-border bg-card p-7 shadow-card">
              <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Use of the $504,000</p>
              <div className="mt-4 flex h-3.5 overflow-hidden rounded-full bg-muted">
                <div className="bg-primary" style={{ width: `${FUNDS[0].pct}%` }} />
                <div className="bg-primary/60" style={{ width: `${FUNDS[1].pct}%` }} />
                <div className="bg-primary/25" style={{ width: `${FUNDS[2].pct}%` }} />
              </div>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                {FUNDS.map((f, i) => (
                  <div key={f.label} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${i === 0 ? 'bg-primary' : i === 1 ? 'bg-primary/60' : 'bg-primary/25'}`} />
                    <span><span className="font-semibold text-foreground">{f.pct}%</span> — {f.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Exit scenarios */}
          <div className="mt-12">
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Illustrative 5-year exit scenarios at 3% equity</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {EXITS.map((e, i) => (
                <Reveal key={e.label} delay={i * 80}>
                  <div className={`h-full rounded-3xl border p-6 shadow-card ${e.strong ? 'border-primary/40 bg-primary/[0.04]' : 'border-border bg-card'}`}>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{e.label}</p>
                    <p className="display mt-2 text-3xl text-primary">{e.moic}</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{e.value} return<br />{e.detail}</p>
                  </div>
                </Reveal>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Forward-looking projections involve risk and are not guaranteed.</p>
          </div>

          {/* Investor rights */}
          <div className="mt-12">
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Investor rights</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {RIGHTS.map((r, i) => (
                <Reveal key={r.title} delay={i * 60}>
                  <div className="flex items-start gap-3.5 rounded-2xl border border-border bg-card p-5 shadow-card">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <r.icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{r.title}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{r.body}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ─────────────────────────────────────────────────────── */}
        <section>
          <Reveal className="mx-auto max-w-2xl text-center">
            <SectionEyebrow>Investor FAQ</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">Common questions from prospective investors.</h2>
          </Reveal>
          <div className="mx-auto mt-12 max-w-3xl divide-y divide-border overflow-hidden rounded-3xl border border-border">
            {FAQ_ITEMS.map((item) => (
              <FaqRow key={item.q} {...item} />
            ))}
          </div>
        </section>

        {/* ── DISCLAIMER ──────────────────────────────────────────────── */}
        <Reveal>
          <p className="mx-auto max-w-3xl text-center text-xs leading-relaxed text-muted-foreground">
            This page is for informational purposes only and does not constitute an offer to sell, or a solicitation
            of an offer to buy, any security, and may not be relied upon in connection with any offer or sale of
            securities. Any offer will be made only by means of definitive subscription documents to qualified
            investors. Past performance is not indicative of future results; all revenue figures, projections, and
            exit scenarios are illustrative, forward-looking, and not guaranteed.
          </p>
        </Reveal>
      </div>
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────── */

/**
 * A revenue figure that visibly climbs — computed as the stated $716,755 2026
 * YTD figure plus a rate derived from elapsed time since Jan 1, 2026, i.e. an
 * ILLUSTRATIVE run-rate, not a live feed of real bookings. The caption is not
 * decorative — a fundraising page cannot imply a capability it doesn't have.
 */
function LiveTicker() {
  const [value, setValue] = useState(YTD_ANCHOR);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const now = Date.now();
    const elapsedMs = Math.max(now - YEAR_START, 1000);
    const perMs = YTD_ANCHOR / elapsedMs;

    const tick = () => {
      const elapsed = Date.now() - YEAR_START;
      setValue(YTD_ANCHOR + perMs * (elapsed - elapsedMs));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);

  const formatted = value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="mt-14 max-w-xl rounded-3xl border border-white/15 bg-white/[0.06] p-7 backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-[0.15em] text-white/60">2026 Revenue Pace</span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-success">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          Live pace
        </span>
      </div>
      <p className="numeric mt-2 text-5xl font-black tracking-tight text-white sm:text-6xl">{formatted}</p>
      <p className="mt-3 text-xs leading-relaxed text-white/50">
        Illustrative — calculated from {BRAND}’s verified 2026 year-to-date revenue ($716,755), extrapolated at a constant run-rate since January 1, 2026.
      </p>
    </div>
  );
}

function GrowthBar({ year, value, display, target }: { year: string; value: number; display: string; target: boolean }) {
  const maxSqrt = Math.sqrt(1_200_000);
  const heightPct = Math.max((Math.sqrt(value) / maxSqrt) * 100, 4);
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-end gap-2.5">
      <span className={`numeric text-sm font-bold ${target ? 'text-primary' : 'text-foreground'}`}>{display}</span>
      <div
        className={
          target
            ? 'w-full rounded-t-xl border-2 border-dashed border-primary/50 bg-primary/[0.06] transition-all duration-1000 ease-out'
            : 'w-full rounded-t-xl bg-gradient-to-t from-primary to-primary/70 transition-all duration-1000 ease-out'
        }
        style={{ height: `${heightPct}%` }}
      />
      <span className="text-xs text-muted-foreground">{year}</span>
    </div>
  );
}

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
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
