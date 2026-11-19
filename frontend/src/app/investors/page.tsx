"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowDown,
  ChevronDown,
  Building2,
  Wrench,
  Plane,
  Globe2,
  RefreshCw,
  FileBarChart,
  Eye,
  ShieldCheck,
  Scale,
  TrendingUp,
  Mail,
  AlertTriangle,
} from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import { SectionEyebrow, CountUp, BRAND } from "@/features/marketing/sections";
import { asOfDate, claimNote } from "@/features/legal/claims";
import { useSiteClaims, type ClaimKey, type SiteClaims } from "@/features/legal/api";
import { DISCLOSURE } from "@/features/legal/disclosures";
import { DisclosureNote } from "@/features/legal/disclosure-note";

/**
 * Investor Relations - built entirely in CatoDrive's own design system (hero-mesh,
 * primary teal, Archivo display type, Reveal motion, the same numbered-frame
 * and stat-card language as /asset-partners and /about) - not a skin ported
 * from the supplied copy. Same brand as the rest of the site: this is
 * CatoDrive's fundraising page, not a separate product.
 *
 * All figures are business-supplied. "Request the Full Deck" is a mailto:
 * to CatoDrive's Investor Relations contact for now - swap to the
 * Investment Inquiry application once that's built. The Reg D Notice and
 * IR contact are business-supplied verbatim.
 */

const ROUND_TERMS = [
  { value: "$504,000", label: "Total raise (SAFE · Late Seed)" },
  { value: "$16.8M", label: "Pre-money valuation" },
  { value: "$21,000", label: "Minimum investment (0.125% equity)" },
  { value: "~3%", label: "Total equity offered" },
] as const;

function tractionFor(c: SiteClaims) {
  return [
    { key: "fleet" as ClaimKey | null, value: c.fleet.value ?? 0, prefix: "", suffix: "+", comma: false, label: "Vehicles managed", note: claimNote(c.fleet) as string | undefined },
    { key: "revenue2026" as ClaimKey | null, value: c.revenue2026.value ?? 0, prefix: "$", suffix: "", comma: true, label: "2026 revenue to date", note: claimNote(c.revenue2026) },
    { key: "trips" as ClaimKey | null, value: c.trips.value ?? 0, prefix: "", suffix: "+", comma: true, label: `Completed trips · ${c.rating.display} on Turo`, note: claimNote(c.trips) },
    { key: null, value: 0, prefix: "$", suffix: "", comma: false, label: "Outside capital raised", note: undefined },
  ];
}

// Short labels on purpose: at 4 columns on a ~390px phone, each bar has
// roughly 60px to work with once page/card padding and gaps are subtracted -
// "2026 target" doesn't fit there, "Target" does. The surrounding heading and
// copy already establish "2026", so nothing is lost.
function growthFor(c: SiteClaims) {
  return [
    { key: "revenue2023" as ClaimKey, year: "2023", value: c.revenue2023.value ?? 0, display: c.revenue2023.display, target: false },
    { key: "revenue2025" as ClaimKey, year: "2025", value: c.revenue2025.value ?? 0, display: c.revenue2025.display, target: false },
    { key: "revenue2026" as ClaimKey, year: "YTD ’26", value: c.revenue2026.value ?? 0, display: c.revenue2026.display, target: false },
    { key: "target2026" as ClaimKey, year: "Forecast", value: c.target2026.value ?? 0, display: c.target2026.display, target: true },
  ];
}

const VISION = [
  {
    icon: Building2,
    title: "Corporate Clients",
    body: "B2B fleet accounts for enterprises & staffing agencies. Steadier utilization, lower churn.",
  },
  {
    icon: Wrench,
    title: "Auto Repair Shops",
    body: "Loaner-vehicle partnerships. Flat daily rates - zero-CAC recurring revenue.",
  },
  {
    icon: Plane,
    title: "Private Jet FBOs",
    body: "White-glove SUV delivery to private terminals. Premium pricing, premium clientele.",
  },
  {
    icon: Globe2,
    title: "National Expansion",
    body: "Beta live at ORD Chicago O’Hare with 3 vehicles - the same DFW playbook.",
  },
] as const;

const FUNDS = [
  { label: "Platform development (consumer app + white-label SaaS)", pct: 45 },
  { label: "Fleet staging facility (rent & operations)", pct: 35 },
  { label: "Marketing & working capital", pct: 20 },
] as const;

function finStatsFor(c: SiteClaims) {
  return [
    { key: "revenue2026" as ClaimKey, value: c.revenue2026.display, label: "2026 revenue to date", sub: claimNote(c.revenue2026) },
    { key: "target2026" as ClaimKey, value: c.target2026.display, label: "2026 full-year forecast", sub: "Management forecast, not earned revenue" },
    { key: "pipeline" as ClaimKey, value: c.pipeline.display, label: "Upcoming bookings", sub: `Scheduled as of ${asOfDate(c.pipeline)}; not yet completed or earned` },
    { key: "goal700" as ClaimKey, value: c.goal700.display, label: "700-vehicle revenue goal", sub: "Goal: 700 × $1,200/mo × 12, not a forecast" },
  ];
}

function trajectoryFor(c: SiteClaims) {
  return [
    { key: "revenue2025" as ClaimKey, value: c.revenue2025.display, meta: `2025 actual · ${c.fleet2025.display} vehicles` },
    { key: "target2026" as ClaimKey, value: c.target2026.display, meta: `2026 forecast · ${c.fleet.display} vehicles` },
    { key: "goal700" as ClaimKey, value: c.goal700.display, meta: "700-vehicle goal" },
  ];
}

const EXITS = [
  {
    label: "Base · 8×",
    moic: "3.8× MOIC",
    value: "$1.92M",
    detail: "$8M revenue → $64M enterprise value",
    strong: false,
  },
  {
    label: "Strong · 8×",
    moic: "4.8× MOIC",
    value: "$2.4M",
    detail: "$10M revenue → $80M enterprise value",
    strong: true,
  },
  {
    label: "Bull · 10×",
    moic: "7.1× MOIC",
    value: "$3.6M",
    detail: "$12M revenue → $120M enterprise value",
    strong: false,
  },
] as const;

const RIGHTS = [
  {
    icon: RefreshCw,
    title: "Pro-Rata on Future Rounds",
    body: "Maintain your ownership percentage in subsequent financings.",
  },
  {
    icon: FileBarChart,
    title: "Quarterly Financials",
    body: "Regular reporting on revenue, fleet size, and operating performance.",
  },
  {
    icon: Eye,
    title: "Board Observer at $100K+",
    body: "Investors at $100,000 and above receive board-observer rights.",
  },
  {
    icon: ShieldCheck,
    title: "Anti-Dilution Protection",
    body: "Protection against down-round dilution.",
  },
  {
    icon: Scale,
    title: "MFN Clause",
    body: "Most-favored-nation terms - you get the best terms offered in this round.",
  },
] as const;

/**
 * Composed strictly from facts already stated elsewhere on this page. The
 * accreditation answer now mirrors CatoDrive's own Reg D Notice verbatim
 * (see the RegDNotice component) rather than a hedged paraphrase.
 */
const FAQ_ITEMS = [
  {
    q: "What exactly am I investing in?",
    a: "A SAFE (Simple Agreement for Future Equity) - Late Seed stage, converting at a $16.8M pre-money valuation cap at the next priced round. CatoDrive is targeting a Series A in Q4 2026.",
  },
  {
    q: "Do I have to be an accredited investor?",
    a: "Certain investments are restricted to accredited investors. This page is an expression of interest only - not an offer or sale of securities. Eligibility is confirmed as part of the formal subscription process; request the full deck and speak with CatoDrive’s Investor Relations team to confirm your status before committing.",
  },
  {
    q: "What’s the minimum investment and what equity does it represent?",
    a: "The minimum investment is $21,000, representing approximately 0.125% equity. The round offers roughly 3% total equity.",
  },
  {
    q: "How is the $504,000 used?",
    a: "45% platform development (the consumer marketplace app and white-label SaaS), 35% a fleet staging facility (rent and operations), and 20% marketing and working capital.",
  },
  {
    q: "What rights do investors receive?",
    a: "Pro-rata rights on future rounds, quarterly financial reporting, anti-dilution protection, and a most-favored-nation (MFN) clause. Investors at $100,000 or above also receive board-observer rights.",
  },
  {
    q: "Is this an offer of securities?",
    a: "No. This page and any related materials are an expression of interest only and do not constitute an offer to sell, or a solicitation of an offer to buy, any securities. Any actual offer will be made only through definitive subscription documents to qualified investors, in compliance with applicable securities laws.",
  },
] as const;


export default function InvestorsPage() {
  const { c, has } = useSiteClaims();
  const TRACTION = tractionFor(c).filter((t) => !t.key || has(t.key));
  const GROWTH = growthFor(c).filter((g) => has(g.key));
  const FIN_STATS = finStatsFor(c).filter((f) => has(f.key));
  const TRAJECTORY = trajectoryFor(c).filter((t) => has(t.key));
  const fleet = has("fleet") ? ` ${c.fleet.display} vehicles` : "";
  const earned = has("revenue2026") ? `${c.revenue2026.display} earned in 2026` : "";
  return (
    <div className="-mt-6">
      {/* Compliance strip */}
      <div className="full-bleed flex items-center justify-center gap-2 border-b border-warning/20 bg-warning/10 px-4 py-2.5 text-center text-xs font-bold uppercase tracking-[0.15em] text-warning">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Expression of interest only - not an offer of securities
      </div>

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="full-bleed relative isolate grain overflow-hidden hero-mesh">
        <div className="mx-auto max-w-5xl px-4 pb-20 pt-14 sm:px-6 sm:pb-28 sm:pt-20">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white/80 backdrop-blur">
              <TrendingUp className="h-3.5 w-3.5" /> Investor Relations
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="display mt-6 max-w-3xl text-[2.4rem] leading-[0.98] text-white sm:text-[3.8rem] lg:text-[4.6rem]">
              Invest in a proven, profitable DFW fleet.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70 sm:mt-7 sm:text-xl">
              {BRAND} is bootstrapped, profitable, and operating -{fleet}
              at DFW International and Love Field{earned ? `, ${earned}` : ""} with $0
              outside capital. We’re raising a{" "}
              <span className="font-semibold text-white">$504,000 SAFE</span>{" "}
              (Late Seed) at a{" "}
              <span className="font-semibold text-white">
                $16.8M pre-money valuation
              </span>{" "}
              to build a direct Turo competitor and a white-label fleet SaaS.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-8 flex flex-wrap gap-4 sm:mt-10">
              {/* Routes through the trackable contact form (pre-selected to
                  "Investing") rather than a bare mailto:, so every deck
                  request is a durable, admin-visible lead - not just an
                  email that only ever lives in an inbox. */}
              <Link
                href="/contact?interest=investor"
                className="group inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-transform hover:scale-[1.03] active:scale-95 sm:h-14 sm:px-7 sm:text-base"
              >
                Request the Full Deck{" "}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#traction"
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 py-3 text-sm font-bold text-white backdrop-blur transition-colors hover:bg-white/10 sm:h-14 sm:px-7 sm:text-base"
              >
                See the Numbers <ArrowDown className="h-4 w-4" />
              </a>
            </div>
          </Reveal>

          <Reveal delay={300}>
            {has("revenue2026") && <RevenueCard c={c} />}
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-14 px-4 pb-16 pt-8 sm:space-y-16 sm:px-6 sm:pt-12">
        {/* ── THE ROUND ────────────────────────────────────────────────── */}
        <section>
          <Reveal className="max-w-3xl">
            <SectionEyebrow>The Round</SectionEyebrow>
            <h2 className="display mt-4 text-3xl sm:text-4xl lg:text-5xl">
              SAFE · Late Seed · converts at cap.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              Series A target Q4 2026.
            </p>
          </Reveal>
          <div className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {ROUND_TERMS.map((t, i) => (
              <Reveal key={t.label} delay={i * 80}>
                <div className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card p-5 transition-all duration-500 hover:-translate-y-1.5 hover:border-primary/40 sm:p-6">
                  <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/10 blur-2xl transition-opacity duration-500 group-hover:opacity-80" />
                  <p className="numeric text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
                    {t.value}
                  </p>
                  <p className="mt-3 text-sm font-medium text-muted-foreground">
                    {t.label}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <DisclosureNote ids={["investment"]} className="-mt-8" />

        {/* ── TRACTION ─────────────────────────────────────────────────── */}
        <section id="traction" className="scroll-mt-24">
          <Reveal className="mx-auto max-w-2xl text-center">
            <SectionEyebrow>Traction</SectionEyebrow>
            <h2 className="display mt-4 text-3xl sm:text-4xl lg:text-5xl">
              100% bootstrapped, profitable, operating.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              4 years operating across DFW International and Dallas Love Field.
            </p>
          </Reveal>
          <div className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {TRACTION.map((s, i) => (
              <Reveal key={s.label} delay={i * 90}>
                <div className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card p-5 transition-all duration-500 hover:-translate-y-1.5 hover:border-primary/40 sm:p-6">
                  <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/10 blur-2xl transition-opacity duration-500 group-hover:opacity-80" />
                  <p className="numeric text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
                    {s.prefix}
                    <CountUp
                      value={s.value}
                      comma={"comma" in s ? s.comma : false}
                    />
                    {s.suffix}
                  </p>
                  <p className="mt-3 text-sm font-medium text-foreground">
                    {s.label}
                  </p>
                  {s.note && <p className="mt-1 text-xs text-muted-foreground">{s.note}</p>}
                </div>
              </Reveal>
            ))}
          </div>
          <DisclosureNote ids={["statistics"]} className="mt-4" />
        </section>

        {/* ── COMPANY OVERVIEW ─────────────────────────────────────────── */}
        <section>
          <Reveal className="max-w-3xl">
            <SectionEyebrow>Step 01 · Company overview</SectionEyebrow>
            <h2 className="display mt-4 text-3xl sm:text-4xl lg:text-5xl">
              195× revenue growth - zero outside capital.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              {BRAND} is a bootstrapped, profitable fleet-management company
              operating{fleet} at DFW International and Love Field{earned ? ` - ${earned}` : ""} with zero outside capital. Four years of
              operations. Institutional-grade fleet management, All-Star Host
              status on Turo{has("trips") ? `, ${c.trips.display} trips completed` : ""}.
            </p>
          </Reveal>

          <Reveal delay={100}>
            <div className="mt-12 rounded-lg border border-border bg-card p-4 sm:p-8">
              <div
                className="flex items-end gap-2 sm:gap-8"
                style={{ height: 220 }}
              >
                {GROWTH.map((g) => (
                  <GrowthBar key={g.year} year={g.year} value={g.value} display={g.display} target={g.target} />
                ))}
              </div>
            </div>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 text-lg text-muted-foreground">
              That’s <span className="font-bold text-primary">195× growth</span>{" "}
              from 2023 to 2025 revenue - built entirely on operating cash flow.
            </p>
          </Reveal>
        </section>

        {/* ── PLATFORM VISION ──────────────────────────────────────────── */}
        <section>
          <Reveal className="max-w-3xl">
            <SectionEyebrow>Step 02 · Platform vision</SectionEyebrow>
            <h2 className="display mt-4 text-3xl sm:text-4xl lg:text-5xl">
              From fleet operator to platform company.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              Building a direct Turo competitor. This investment accelerates the{" "}
              {BRAND} consumer marketplace - a fully independent P2P rental
              platform that captures full booking margin and owns every customer
              relationship. The same platform, licensed to independent fleet
              operators nationwide, transforms {BRAND} into a platform company
              with recurring B2B revenue.
            </p>
            <p className="mt-3 text-lg text-muted-foreground">
              Revenue target (goal):{" "}
              <span className="font-bold text-primary">$10.08M</span> - 700
              vehicles × $1,200/mo × 12.
            </p>
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {VISION.map((v, i) => (
              <Reveal key={v.title} delay={i * 80}>
                <div className="group flex h-full flex-col rounded-lg border border-border bg-card p-7 transition-all duration-500 hover:-translate-y-1.5 hover:border-primary/40">
                  <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 transition-transform duration-500 group-hover:scale-110">
                    <v.icon className="h-6 w-6" />
                  </span>
                  <h3 className="display mt-5 text-xl">{v.title}</h3>
                  <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">
                    {v.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── FINANCIAL PERFORMANCE ────────────────────────────────────── */}
        <section>
          <Reveal className="max-w-3xl">
            <SectionEyebrow>Step 03 · Financial performance</SectionEyebrow>
            <h2 className="display mt-4 text-3xl sm:text-4xl lg:text-5xl">
              {[earned, has("target2026") ? `${c.target2026.display} full-year forecast` : ""].filter(Boolean).join(" · ") || "Financial performance"}.
            </h2>
          </Reveal>

          {/* Four figures, each its own labeled line - not a paragraph of
              run-on numbers a phone has to parse word by word. */}
          <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FIN_STATS.map((s, i) => (
              <Reveal key={s.label} delay={i * 70}>
                <div className="h-full rounded-lg border border-border bg-card p-5">
                  <p className="numeric text-2xl font-extrabold tracking-tight text-foreground sm:text-[1.7rem]">
                    {s.value}
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-foreground">
                    {s.label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {s.sub}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>

          {/* The trajectory, as a flow of milestones with a real arrow between
              them - reads top-to-bottom on a phone, left-to-right on desktop,
              instead of an arrow-separated run-on sentence. */}
          <Reveal delay={280}>
            <div className="mt-6 flex flex-col items-stretch gap-2 rounded-lg border border-border bg-card p-5 sm:flex-row sm:items-center sm:gap-3">
              {TRAJECTORY.map((t, i) => (
                <div
                  key={t.value}
                  className="flex flex-col items-stretch gap-2 sm:flex-1 sm:flex-row sm:items-center sm:gap-3"
                >
                  <div className="flex-1 rounded-xl bg-muted/50 px-4 py-3 text-center">
                    <p className="numeric text-xl font-extrabold text-foreground sm:text-2xl">
                      {t.value}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t.meta}
                    </p>
                  </div>
                  {i < TRAJECTORY.length - 1 && (
                    <span className="flex items-center justify-center text-primary">
                      <ArrowDown className="h-4 w-4 sm:hidden" />
                      <ArrowRight className="hidden h-4 w-4 sm:block" />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Reveal>

          <DisclosureNote ids={["statistics", "forward-looking"]} className="mt-4" />

          {/* Use of funds */}
          <Reveal delay={100}>
            <div className="mt-12 rounded-lg border border-border bg-card p-7">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Use of the $504,000
              </p>
              <div className="mt-4 flex h-3.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="bg-primary"
                  style={{ width: `${FUNDS[0].pct}%` }}
                />
                <div
                  className="bg-primary/60"
                  style={{ width: `${FUNDS[1].pct}%` }}
                />
                <div
                  className="bg-primary/25"
                  style={{ width: `${FUNDS[2].pct}%` }}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                {FUNDS.map((f, i) => (
                  <div
                    key={f.label}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${i === 0 ? "bg-primary" : i === 1 ? "bg-primary/60" : "bg-primary/25"}`}
                    />
                    <span>
                      <span className="font-semibold text-foreground">
                        {f.pct}%
                      </span>{" "}
                      - {f.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Exit scenarios */}
          <div className="mt-12">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Hypothetical 5-year exit scenarios at 3% equity
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Assumes the full $504,000 round buys 3% of the company with no later dilution, and a sale at the revenue and multiple shown. Real outcomes depend on the executed SAFE, later rounds and the market.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {EXITS.map((e, i) => (
                <Reveal key={e.label} delay={i * 80}>
                  <div
                    className={`h-full rounded-lg border p-6 ${e.strong ? "border-primary/40 bg-primary/[0.04]" : "border-border bg-card"}`}
                  >
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {e.label}
                    </p>
                    <p className="display mt-2 text-3xl text-primary">
                      {e.moic}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {e.value} return
                      <br />
                      {e.detail}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
            <DisclosureNote ids={["forward-looking", "investment"]} className="mt-4" />
          </div>

          {/* Investor rights */}
          <div className="mt-12">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Investor rights
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {RIGHTS.map((r, i) => (
                <Reveal key={r.title} delay={i * 60}>
                  <div className="flex items-start gap-3.5 rounded-lg border border-border bg-card p-5">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <r.icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {r.title}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {r.body}
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── CONTACT + COMPLIANCE ────────────────────────────────────── */}
        <section>
          <Reveal className="max-w-3xl">
            <SectionEyebrow>Investor Relations</SectionEyebrow>
            <h2 className="display mt-4 text-3xl sm:text-4xl lg:text-5xl">
              Talk to the team behind the round.
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <Reveal>
              <div className="flex h-full flex-col justify-between rounded-lg border border-border bg-card p-7">
                <div>
                  <p className="text-lg font-bold text-foreground">
                    Shoaib Mirza Baig
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Head of Investor Relations
                  </p>
                </div>
                <div className="mt-6 space-y-3">
                  <a
                    href="mailto:shoaib@catodrive.com"
                    className="flex items-center gap-3 rounded-xl border border-border p-3.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/[0.04]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Mail className="h-4 w-4" />
                    </span>
                    shoaib@catodrive.com
                  </a>
                </div>
                <p className="mt-5 rounded-xl bg-muted/50 p-3.5 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    The Round:{" "}
                  </span>
                  $504,000 SAFE · Late Seed · $16.8M pre-money · $21,000
                  minimum.
                </p>
              </div>
            </Reveal>

            <Reveal delay={80}>
              <RegDNotice />
            </Reveal>
          </div>
        </section>

        {/* ── FAQ ─────────────────────────────────────────────────────── */}
        <section>
          <Reveal className="mx-auto max-w-2xl text-center">
            <SectionEyebrow>Investor FAQ</SectionEyebrow>
            <h2 className="display mt-4 text-3xl sm:text-4xl lg:text-5xl">
              Common questions from prospective investors.
            </h2>
          </Reveal>
          <div className="mx-auto mt-12 max-w-3xl divide-y divide-border overflow-hidden rounded-lg border border-border">
            {FAQ_ITEMS.map((item) => (
              <FaqRow key={item.q} {...item} />
            ))}
          </div>
        </section>

        {/* ── DISCLAIMER ──────────────────────────────────────────────── */}
        <section aria-labelledby="investor-disclosures" className="mx-auto max-w-3xl space-y-4 rounded-lg border border-border bg-card p-6 text-sm leading-relaxed text-muted-foreground">
          <h2 id="investor-disclosures" className="text-base font-semibold text-foreground">Important disclosures</h2>
          {[DISCLOSURE.investment, DISCLOSURE["forward-looking"], DISCLOSURE.statistics].map((d) => (
            <div key={d.id} className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">{d.title}</h3>
              {d.body.map((p) => <p key={p}>{p}</p>)}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────── */

function RevenueCard({ c }: { c: SiteClaims }) {
  return (
    <div className="mt-14 max-w-xl rounded-lg border border-white/15 bg-white/[0.06] p-7 backdrop-blur">
      <span className="text-xs font-bold uppercase tracking-[0.15em] text-white/70">
        2026 revenue to date
      </span>
      <p className="numeric mt-2 text-[2.1rem] font-black leading-none tracking-tight text-white sm:text-5xl lg:text-6xl">
        {c.revenue2026.display}
      </p>
      <p className="mt-3 text-xs leading-relaxed text-white/75">
        {claimNote(c.revenue2026)}. The {c.target2026.display} full-year figure is a management forecast, not earned revenue.
      </p>
    </div>
  );
}

function GrowthBar({
  year,
  value,
  display,
  target,
}: {
  year: string;
  value: number;
  display: string;
  target: boolean;
}) {
  const maxSqrt = Math.sqrt(1_200_000);
  const heightPct = Math.max((Math.sqrt(value) / maxSqrt) * 100, 4);
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-end gap-1.5 sm:gap-2.5">
      <span
        className={`numeric whitespace-nowrap text-xs font-bold sm:text-sm ${target ? "text-primary" : "text-foreground"}`}
      >
        {display}
      </span>
      <div
        className={
          target
            ? "w-full rounded-t-xl border-2 border-dashed border-primary/50 bg-primary/[0.06] transition-all duration-1000 ease-out"
            : "w-full rounded-t-xl bg-gradient-to-t from-primary to-primary/70 transition-all duration-1000 ease-out"
        }
        style={{ height: `${heightPct}%` }}
      />
      <span className="whitespace-nowrap text-xs text-muted-foreground sm:text-xs">
        {year}
      </span>
    </div>
  );
}

/** CatoDrive's own Reg D Notice, verbatim - not paraphrased. */
function RegDNotice() {
  return (
    <div className="flex h-full flex-col rounded-lg border border-warning/25 bg-warning/[0.05] p-7">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/15 text-warning">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <p className="mt-4 text-sm font-bold uppercase tracking-wider text-warning">
        Reg D Notice
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-foreground">
        Certain investments are restricted to accredited investors. Expression
        of interest only - not an offer or sale of securities.
      </p>
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
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 ${open ? "rotate-180 text-primary" : ""}`}
        />
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          <p className="px-6 pb-5 text-sm leading-relaxed text-muted-foreground">
            {a}
          </p>
        </div>
      </div>
    </div>
  );
}
