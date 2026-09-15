'use client';

import { useEffect, useRef, useState } from 'react';
import { Fraunces, Inter } from 'next/font/google';
import {
  ArrowRight, ArrowDown, ChevronDown, Building2, Wrench, Plane, Globe2,
  RefreshCw, FileBarChart, Eye, ShieldCheck, Scale,
} from 'lucide-react';
import { Reveal } from '@/components/ui/reveal';
import { CountUp } from '@/features/marketing/sections';
import styles from './investors.module.css';

const fraunces = Fraunces({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-fraunces' });
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-inter' });

/**
 * Investor Relations — CatoDrive's SAFE (Late Seed) expression-of-interest
 * page. Its own institutional identity (dark/brass/serif, cooler than the
 * Asset Partner intake) since this is fundraising material with real
 * securities-law exposure, not a marketing page.
 *
 * The centerpiece is a LIVE revenue ticker that visibly climbs while an
 * investor watches — the "numbers should keep increasing" ask — but it is
 * deliberately labeled as an illustrative YTD-pace calculation, not a real
 * revenue feed. A page asking someone to wire $21K+ cannot afford to imply a
 * capability ("live revenue") that doesn't exist; the honest version is what
 * actually lands as credible with a sophisticated investor anyway.
 *
 * All figures are business-supplied. "Request the Full Deck" is a mailto:
 * for now — swap to the Investment Inquiry application once that's built.
 * The accredited-investor FAQ answer is deliberately hedged (see comment on
 * FAQ_ITEMS) and should be reviewed by securities counsel before this goes
 * live — this is the one place on the site where wrong copy is a legal risk,
 * not just a bad look.
 */

const ROUND_TERMS = [
  { value: '$504,000', label: 'Total raise (SAFE · Late Seed)' },
  { value: '$16.8M', label: 'Pre-money valuation' },
  { value: '$21,000', label: 'Minimum investment (0.125% equity)' },
  { value: '~3%', label: 'Total equity offered' },
] as const;

const TRACTION = [
  { value: 100, prefix: '', suffix: '', label: 'Vehicles managed' },
  { value: 405, prefix: '$', suffix: 'K+', label: '2026 YTD revenue' },
  { value: 3626, prefix: '', suffix: '', comma: true, label: 'Completed trips · 4.9★ All-Star Host' },
  { value: 0, prefix: '$', suffix: '', label: 'Outside capital raised' },
] as const;

const GROWTH = [
  { year: '2023', value: 1574, display: '$1,574', target: false },
  { year: '2025', value: 307000, display: '$307K', target: false },
  { year: '2026 YTD', value: 405507, display: '$405K+', target: false },
  { year: '2026 target', value: 1_200_000, display: '$1.2M', target: true },
] as const;

const VISION = [
  { icon: Building2, title: 'Corporate Clients', body: 'B2B fleet accounts for enterprises & staffing agencies. Guaranteed utilization, lower churn.' },
  { icon: Wrench, title: 'Auto Repair Shops', body: 'Loaner-vehicle partnerships. Flat daily rates — zero-CAC recurring revenue.' },
  { icon: Plane, title: 'Private Jet FBOs', body: 'White-glove SUV delivery to private terminals. Premium pricing, premium clientele.' },
  { icon: Globe2, title: 'National Expansion', body: 'Beta live at ORD Chicago O’Hare with 3 vehicles — the same DFW playbook.' },
] as const;

const FUNDS = [
  { label: 'Platform development (consumer app + white-label SaaS)', pct: 45, cls: 'fundsSeg1' as const },
  { label: 'Fleet staging facility (rent & operations)', pct: 35, cls: 'fundsSeg2' as const },
  { label: 'Marketing & working capital', pct: 20, cls: 'fundsSeg3' as const },
];

const EXITS = [
  { label: 'Base · 8×', moic: '3.8× MOIC', value: '$1.92M', detail: '$8M revenue → $64M enterprise value', strong: false },
  { label: 'Strong · 8×', moic: '4.8× MOIC', value: '$2.4M', detail: '$10M revenue → $80M enterprise value', strong: true },
  { label: 'Bull · 10×', moic: '7.1× MOIC', value: '$3.6M', detail: '$12M revenue → $120M enterprise value', strong: false },
];

const RIGHTS = [
  { icon: RefreshCw, title: 'Pro-Rata on Future Rounds', body: 'Maintain your ownership percentage in subsequent financings.' },
  { icon: FileBarChart, title: 'Quarterly Financials', body: 'Regular reporting on revenue, fleet size, and operating performance.' },
  { icon: Eye, title: 'Board Observer at $100K+', body: 'Investors at $100,000 and above receive board-observer rights.' },
  { icon: ShieldCheck, title: 'Anti-Dilution Protection', body: 'Protection against down-round dilution.' },
  { icon: Scale, title: 'MFN Clause', body: 'Most-favored-nation terms — you get the best terms offered in this round.' },
];

/**
 * Answers composed strictly from what's already stated elsewhere on this page
 * (round terms, use of funds, investor rights) — except the accreditation
 * question, which is deliberately hedged rather than asserting a specific
 * Reg D exemption this page doesn't state. FLAG FOR REVIEW: have counsel
 * confirm/replace that one answer before this page is used to solicit real
 * investment.
 */
const FAQ_ITEMS = [
  { q: 'What exactly am I investing in?', a: 'A SAFE (Simple Agreement for Future Equity) — Late Seed stage, converting at a $16.8M pre-money valuation cap at the next priced round. CatoDrive is targeting a Series A in Q4 2026.' },
  { q: 'Do I have to be an accredited investor?', a: 'Offerings of this kind are typically limited to accredited investors under SEC Regulation D. Eligibility is confirmed as part of the formal subscription process — request the full deck and speak with CatoDrive’s team to confirm your status before committing.' },
  { q: 'What’s the minimum investment and what equity does it represent?', a: 'The minimum investment is $21,000, representing approximately 0.125% equity. The round offers roughly 3% total equity.' },
  { q: 'How is the $504,000 used?', a: '45% platform development (the consumer marketplace app and white-label SaaS), 35% a fleet staging facility (rent and operations), and 20% marketing and working capital.' },
  { q: 'What rights do investors receive?', a: 'Pro-rata rights on future rounds, quarterly financial reporting, anti-dilution protection, and a most-favored-nation (MFN) clause. Investors at $100,000 or above also receive board-observer rights.' },
  { q: 'Is this an offer of securities?', a: 'No. This page and any related materials are an expression of interest only and do not constitute an offer to sell, or a solicitation of an offer to buy, any securities. Any actual offer will be made only through definitive subscription documents to qualified investors, in compliance with applicable securities laws.' },
];

const YEAR_START = Date.UTC(2026, 0, 1); // Jan 1, 2026 UTC
const YTD_ANCHOR = 405_507;

export default function InvestorsPage() {
  return (
    <div className={`${styles.wrap} ${fraunces.variable} ${inter.variable} ${styles.sans}`}>
      <div className={styles.grain} />

      <div className={styles.eyebrowBar}>EXPRESSION OF INTEREST ONLY — NOT AN OFFER OF SECURITIES</div>

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.mark}>
            <span className={`${styles.markBadge} ${styles.serif}`}>C</span>
            <span className={`${styles.markWord} ${styles.serif}`}>Cato<b>Drive</b></span>
          </div>

          <h1 className={`${styles.h1} ${styles.serif}`}>Invest in a proven, profitable DFW fleet.</h1>
          <p className={styles.lede}>
            CatoDrive is bootstrapped, profitable, and operating — 100 vehicles at DFW International and Love Field,
            $405K+ earned in 2026 with $0 outside capital. We’re raising a $504,000 SAFE (Late Seed) at a $16.8M
            pre-money valuation to build a direct Turo competitor and a white-label fleet SaaS.
          </p>

          <div className={styles.heroCtas}>
            <a href="mailto:invest@catodrive.com?subject=Request%20the%20CatoDrive%20Deck" className={`${styles.btn} ${styles.btnPrimary}`}>
              Request the Full Deck <ArrowRight className="h-4 w-4" />
            </a>
            <a href="#traction" className={`${styles.btn} ${styles.btnGhost}`}>
              See the Numbers <ArrowDown className="h-4 w-4" />
            </a>
          </div>

          <Reveal>
            <LiveTicker />
          </Reveal>
        </div>
      </section>

      {/* ── THE ROUND ────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>The Round</div>
        <h2 className={`${styles.sectionH2} ${styles.serif}`}>SAFE · Late Seed · converts at cap.</h2>
        <p className={styles.sectionP}>Series A target Q4 2026.</p>
        <div className={styles.termsGrid}>
          {ROUND_TERMS.map((t) => (
            <div key={t.label} className={styles.termCell}>
              <span className={`val ${styles.serif}`}>{t.value}</span>
              <span className="lbl">{t.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── TRACTION ─────────────────────────────────────────────────── */}
      <section id="traction" className={styles.section} style={{ scrollMarginTop: '2rem' }}>
        <div className={styles.sectionEyebrow}>Traction</div>
        <h2 className={`${styles.sectionH2} ${styles.serif}`}>100% bootstrapped, profitable, operating.</h2>
        <p className={styles.sectionP}>4 years operating across DFW International and Dallas Love Field.</p>
        <div className={styles.statGrid}>
          {TRACTION.map((s) => (
            <Reveal key={s.label}>
              <div className={styles.statCard}>
                <p className={`num ${styles.serif}`}>
                  {s.prefix}<CountUp value={s.value} comma={'comma' in s ? s.comma : false} />{s.suffix}
                </p>
                <p className="lbl">{s.label}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── STEP 01 — COMPANY OVERVIEW ──────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Step 01 · Company overview</div>
        <h2 className={`${styles.sectionH2} ${styles.serif}`}>195× revenue growth in three years — zero outside capital.</h2>
        <p className={styles.sectionP}>
          CatoDrive is a bootstrapped, profitable fleet-management company operating 100 vehicles at DFW
          International and Love Field — $405,507 earned in 2026 with zero outside capital. Four years of
          operations. Institutional-grade fleet management, All-Star Host status, 3,626 trips completed.
        </p>

        <Reveal>
          <div className={styles.chart}>
            {GROWTH.map((g) => (
              <GrowthBar key={g.year} {...g} />
            ))}
          </div>
        </Reveal>
        <p className={styles.sectionP} style={{ marginTop: 20 }}>
          That’s <span style={{ color: 'var(--brass-bright)', fontWeight: 600 }}>195× growth</span> — built entirely
          on operating cash flow.
        </p>
      </section>

      {/* ── STEP 02 — PLATFORM VISION ───────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Step 02 · Platform vision</div>
        <h2 className={`${styles.sectionH2} ${styles.serif}`}>From fleet operator to platform company.</h2>
        <p className={styles.sectionP}>
          Building a direct Turo competitor. This investment accelerates the CatoDrive consumer marketplace — a
          fully independent P2P rental platform that captures full booking margin and owns every customer
          relationship. The same platform, licensed to independent fleet operators nationwide, transforms CatoDrive
          into a platform company with recurring B2B revenue.
        </p>
        <p className={styles.sectionP} style={{ marginTop: 10 }}>
          Revenue target (goal): <span style={{ color: 'var(--brass-bright)', fontWeight: 600 }}>$10.08M</span> — 700
          vehicles × $1,200/mo × 12.
        </p>

        <div className={styles.visionGrid}>
          {VISION.map((v, i) => (
            <Reveal key={v.title} delay={i * 60}>
              <div className={styles.visionCard}>
                <v.icon className="h-5 w-5" style={{ color: 'var(--brass-bright)', marginBottom: 8 }} />
                <h3>{v.title}</h3>
                <p>{v.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── STEP 03 — FINANCIAL PERFORMANCE ─────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Step 03 · Financial performance</div>
        <h2 className={`${styles.sectionH2} ${styles.serif}`}>$405K earned in 2026 · $1.2M full-year target.</h2>
        <p className={styles.sectionP}>
          2026 YTD revenue: $405,507 (verified). Full-year projection: $1.2M+ (Q4 2026 target). Confirmed pipeline:
          $69,717 upcoming bookings. 700-vehicle revenue goal: $10.08M (700 × $1,200/mo × 12).
        </p>
        <p className={styles.sectionP} style={{ marginTop: 10 }}>
          Trajectory: $307K (2025, 72 vehicles) → $1.2M (2026, 100+ vehicles) → $10.08M (700-vehicle target).
        </p>

        <div style={{ marginTop: 32 }}>
          <p className={styles.sectionEyebrow} style={{ marginBottom: 0 }}>Use of the $504,000</p>
          <div className={styles.fundsBar}>
            {FUNDS.map((f) => (
              <div key={f.label} className={styles[f.cls]} style={{ width: `${f.pct}%` }} />
            ))}
          </div>
          <div className={styles.fundsLegend}>
            {FUNDS.map((f) => (
              <div key={f.label} className={styles.fundsLegendItem}>
                <span className={styles.fundsSwatch} style={{ background: `var(${f.cls === 'fundsSeg3' ? '--muted2' : f.cls === 'fundsSeg2' ? '--brass' : '--brass-bright'})` }} />
                {f.pct}% — {f.label}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 40 }}>
          <p className={styles.sectionEyebrow} style={{ marginBottom: 0 }}>Illustrative 5-year exit scenarios at 3% equity</p>
          <div className={styles.exitGrid}>
            {EXITS.map((e) => (
              <div key={e.label} className={`${styles.exitCard} ${e.strong ? styles.strong : ''}`}>
                <p className={styles.exitLabel}>{e.label}</p>
                <p className={`${styles.exitMoic} ${styles.serif}`}>{e.moic}</p>
                <p className={styles.exitDetail}>{e.value} return<br />{e.detail}</p>
              </div>
            ))}
          </div>
          <p className={styles.tickerCaption} style={{ marginTop: 16 }}>
            Forward-looking projections involve risk and are not guaranteed.
          </p>
        </div>

        <div style={{ marginTop: 40 }}>
          <p className={styles.sectionEyebrow} style={{ marginBottom: 0 }}>Investor rights</p>
          <div className={styles.rightsGrid}>
            {RIGHTS.map((r) => (
              <div key={r.title} className={styles.rightCard}>
                <span className={styles.rightIc}><r.icon className="h-4 w-4" /></span>
                <div>
                  <h4>{r.title}</h4>
                  <p>{r.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.sectionEyebrow}>Investor FAQ</div>
        <h2 className={`${styles.sectionH2} ${styles.serif}`}>Common questions from prospective investors.</h2>
        <div className={styles.faqList}>
          {FAQ_ITEMS.map((item) => (
            <FaqRow key={item.q} {...item} />
          ))}
        </div>
      </section>

      <div className={styles.disclaimer}>
        This page is for informational purposes only and does not constitute an offer to sell, or a solicitation of
        an offer to buy, any security, and may not be relied upon in connection with any offer or sale of securities.
        Any offer will be made only by means of definitive subscription documents to qualified investors. Past
        performance is not indicative of future results; all revenue figures, projections, and exit scenarios are
        illustrative, forward-looking, and not guaranteed.
      </div>

      <footer className={styles.footer}>CatoDrive, Inc. · Dallas–Fort Worth, Texas · Investor Relations</footer>
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────── */

/**
 * A revenue figure that visibly climbs — the "keep increasing" centerpiece.
 * Computed as $405,507 (the stated 2026 YTD figure) plus a rate derived from
 * elapsed time since Jan 1, 2026, i.e. an ILLUSTRATIVE run-rate, not a live
 * feed of real bookings. Labeled as such — the caption is not decorative.
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
    <div className={styles.tickerCard}>
      <div className={styles.tickerTop}>
        <span className={styles.tickerLabel}>2026 Revenue Pace</span>
        <span className={styles.liveDot}>LIVE PACE</span>
      </div>
      <p className={`${styles.tickerValue} ${styles.serif}`}>{formatted}</p>
      <p className={styles.tickerCaption}>
        Illustrative — calculated from CatoDrive’s verified 2026 year-to-date revenue ($405,507) extrapolated at a
        constant run-rate since January 1, 2026. Not a live feed of actual bookings, a projection, or a guarantee of
        future performance.
      </p>
    </div>
  );
}

function GrowthBar({ year, value, display, target }: { year: string; value: number; display: string; target: boolean }) {
  const maxSqrt = Math.sqrt(1_200_000);
  const heightPct = Math.max((Math.sqrt(value) / maxSqrt) * 100, 3);
  return (
    <div className={styles.chartBar}>
      <span className={`${styles.chartVal} ${target ? styles.serif : ''}`}>{display}</span>
      <div
        className={target ? styles.chartFillTarget : styles.chartFill}
        style={{ height: `${heightPct}%` }}
      />
      <span className={styles.chartYear}>{year}</span>
    </div>
  );
}

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.faqRow}>
      <button className={styles.faqQ} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>{q}</span>
        <ChevronDown className={`h-4 w-4 ${styles.faqChevron} ${open ? styles.faqChevronOpen : ''}`} />
      </button>
      <div className={styles.faqA} style={{ gridTemplateRows: open ? '1fr' : '0fr' }}>
        <div className={styles.faqAInner}><p>{a}</p></div>
      </div>
    </div>
  );
}
