'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, TrendingUp, Briefcase, Building2, Users } from 'lucide-react';
import { Reveal } from '@/components/ui/reveal';

/**
 * Shared CatoDrive marketing sections, so the homepage and the About page show
 * the same social proof and audience story from ONE source — change it once,
 * it changes everywhere. Figures are business-supplied marketing copy.
 */

export const BRAND = 'CatoDrive';

export function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-primary">
      <span className="h-px w-6 bg-primary/50" /> {children}
    </span>
  );
}

/* ── Traction / social-proof stats ─────────────────────────────────────── */

const STATS = [
  { prefix: '$', value: 307, suffix: 'K', decimals: 0, label: '2025 Fleet Revenue' },
  { prefix: '', value: 4.96, suffix: '★', decimals: 2, label: 'Rating', sub: '2,053 reviews' },
  { prefix: '', value: 75, suffix: '+', decimals: 0, label: 'Vehicles Managed' },
  { prefix: '', value: 2607, suffix: '+', decimals: 0, label: 'Trips Completed', comma: true },
] as const;

export function TractionStats({ heading = 'The numbers, unedited.' }: { heading?: string }) {
  return (
    <section>
      <Reveal className="mx-auto max-w-2xl text-center">
        <SectionEyebrow>Proven traction · Zero outside capital</SectionEyebrow>
        <h2 className="display mt-4 text-4xl sm:text-5xl">{heading}</h2>
        <p className="mt-4 text-lg text-muted-foreground">Real figures from a real fleet — 100% bootstrapped.</p>
      </Reveal>
      <div className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STATS.map((s, i) => (
          <Reveal key={s.label} delay={i * 90}>
            <StatCard {...s} />
          </Reveal>
        ))}
      </div>
    </section>
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

/* ── Who we serve — image cards ────────────────────────────────────────── */

const AUDIENCES = [
  { icon: TrendingUp, image: '/newsections/asset_partners.webp', title: 'Asset Partners', body: 'List a vehicle you already own. Net $1,066–$1,878/month — you keep 80% of every booking.', href: '/host', cta: 'Become a partner' },
  { icon: Briefcase, image: '/newsections/business_travels.webp', title: 'Business Travelers', body: 'Car delivered to your terminal at DFW or Love Field, 5–15% below market rate. Paperless end-to-end. Zero friction.', href: '/search', cta: 'Book a car' },
  { icon: Building2, image: '/newsections/corporate_accounts.webp', title: 'Corporate Accounts', body: 'B2B fleet accounts for enterprises and staffing agencies, auto-repair loaner programs, and white-glove SUV delivery to private terminals.', href: '/corporate', cta: 'Talk to us' },
  { icon: Users, image: '/newsections/enterprise_volume.webp', title: 'Enterprise & Volume', body: 'Volume pricing, dedicated account management, consolidated billing, and priority terminal delivery for regular DFW travel.', href: '/corporate', cta: 'Corporate portal' },
] as const;

export function AudienceSection({ heading = 'Two sides of one platform.' }: { heading?: string }) {
  return (
    <section>
      <Reveal className="max-w-3xl">
        <SectionEyebrow>Who {BRAND} serves</SectionEyebrow>
        <h2 className="display mt-4 text-4xl sm:text-5xl">{heading}</h2>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">Travel without hassle. Earn without effort.</p>
      </Reveal>
      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {AUDIENCES.map((a, i) => (
          <Reveal key={a.title} delay={i * 80}>
            <AudienceCard {...a} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function AudienceCard({ icon: Icon, image, title, body, href, cta }: {
  icon: typeof Users; image: string; title: string; body: string; href: string; cta: string;
}) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-card transition-all duration-500 hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-2xl hover:shadow-primary/10"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden">
        <Image
          src={image}
          alt={title}
          fill
          sizes="(min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
        />
        {/* Scrim + floating icon badge so the label reads on any photo. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
        <span className="absolute left-4 top-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-md">
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="display absolute bottom-4 left-5 right-5 text-2xl text-white drop-shadow">{title}</h3>
      </div>
      <div className="flex flex-1 flex-col p-6">
        <p className="flex-1 text-[15px] leading-relaxed text-muted-foreground">{body}</p>
        <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
          {cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}

/* ── Count up on scroll ────────────────────────────────────────────────── */

export function CountUp({ value, decimals = 0, comma, durationMs = 1300 }: {
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

  return (
    <span ref={ref}>
      {display.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping: !!comma,
      })}
    </span>
  );
}
