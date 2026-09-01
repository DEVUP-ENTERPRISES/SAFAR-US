'use client';

import { useId, useState } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * One chart vocabulary for the whole app.
 *
 * Every panel used to hand-roll `<div>` bars with inline heights, which is why
 * the dashboards looked generated rather than designed. These SVG primitives
 * give admin, host and corporate the same marks, the same hover behaviour and
 * the same (colour-blind-validated) palette.
 *
 * Rules followed: thin marks with 4px rounded data-ends on the baseline; a
 * single series is primary-only (no legend); multi-series identity is carried
 * by direct labels + legend, never colour alone; one y-axis, never two.
 */

// Categorical palette — validated for the light surface (CVD normal-vision
// floor ≥ 15, chroma floor met). Identity is always reinforced with a label,
// which is what makes the floor band legal.
export const SERIES = ['#0f9d6a', '#6366f1', '#f59e0b', '#f43f5e', '#06b6d4'] as const;

const AXIS = 'hsl(var(--muted-foreground))';

function money(n: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: n % 100 === 0 ? 0 : 2,
  }).format(n / 100);
}

// ── Bar chart ──────────────────────────────────────────────────────────
export interface BarPoint {
  label: string;
  value: number;
}

export function BarChart({
  data,
  height = 200,
  format = (v: number) => String(v),
  currency,
  className,
}: {
  data: BarPoint[];
  height?: number;
  /** Formats the hover value. Ignored when `currency` is set. */
  format?: (v: number) => string;
  currency?: string;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const fmt = currency ? (v: number) => money(v, currency) : format;

  if (data.length === 0) return <Empty height={height} />;

  return (
    <div className={cn('relative', className)}>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => {
          const h = Math.max((d.value / max) * 100, d.value > 0 ? 2 : 0);
          const on = hover === i;
          return (
            <button
              key={`${d.label}-${i}`}
              className="group relative flex flex-1 flex-col items-center justify-end"
              style={{ height: '100%' }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              aria-label={`${d.label}: ${fmt(d.value)}`}
            >
              <span
                className={cn(
                  'w-full rounded-t-[4px] transition-colors',
                  on ? 'bg-primary' : 'bg-primary/60',
                )}
                style={{ height: `${h}%`, minHeight: d.value > 0 ? 2 : 0 }}
              />
              {on && (
                <span className="pointer-events-none absolute -top-9 z-10 whitespace-nowrap rounded-lg border border-border bg-card px-2 py-1 text-xs font-semibold shadow-float">
                  {fmt(d.value)}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5">
        {data.map((d, i) => (
          <span key={i} className="flex-1 truncate text-center text-[10px] tabular-nums text-muted-foreground">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Line chart (single series, with crosshair) ─────────────────────────
export function LineChart({
  data,
  height = 200,
  currency,
  format = (v: number) => String(v),
  className,
}: {
  data: BarPoint[];
  height?: number;
  currency?: string;
  format?: (v: number) => string;
  className?: string;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const w = 600;
  const h = height;
  const pad = 8;
  const max = Math.max(1, ...data.map((d) => d.value));
  const min = Math.min(0, ...data.map((d) => d.value));
  const fmt = currency ? (v: number) => money(v, currency) : format;

  if (data.length < 2) return <Empty height={height} />;

  const x = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.value)}`).join(' ');
  const area = `${line} L ${x(data.length - 1)} ${h} L ${x(0)} ${h} Z`;

  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const rel = ((e.clientX - rect.left) / rect.width) * w;
          const i = Math.round(((rel - pad) / (w - pad * 2)) * (data.length - 1));
          setHover(Math.max(0, Math.min(data.length - 1, i)));
        }}
      >
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.18" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#fill-${id})`} />
        <path d={line} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {hover != null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pad} y2={h - pad} stroke={AXIS} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <circle cx={x(hover)} cy={y(data[hover].value)} r="4" fill="hsl(var(--primary))" stroke="hsl(var(--card))" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {hover != null && (
        <div className="mt-1 text-center text-xs">
          <span className="font-semibold">{fmt(data[hover].value)}</span>
          <span className="ms-1.5 text-muted-foreground">{data[hover].label}</span>
        </div>
      )}
    </div>
  );
}

// ── Donut (composition) ────────────────────────────────────────────────
export interface Slice {
  label: string;
  value: number;
}

export function Donut({
  data,
  currency,
  size = 168,
  className,
}: {
  data: Slice[];
  currency?: string;
  size?: number;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2;
  const stroke = 22;
  const inner = r - stroke / 2;
  const circ = 2 * Math.PI * inner;

  if (total <= 0) return <Empty height={size} />;

  let offset = 0;
  const arcs = data.map((d, i) => {
    const frac = d.value / total;
    const seg = { d, i, frac, dash: frac * circ, offset };
    offset += frac * circ;
    return seg;
  });

  return (
    <div className={cn('flex flex-wrap items-center gap-6', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          {arcs.map((a) => (
            <circle
              key={a.i}
              cx={r}
              cy={r}
              r={inner}
              fill="none"
              stroke={SERIES[a.i % SERIES.length]}
              strokeWidth={hover === a.i ? stroke + 3 : stroke}
              strokeDasharray={`${a.dash} ${circ - a.dash}`}
              strokeDashoffset={-a.offset}
              className="cursor-pointer transition-[stroke-width]"
              onMouseEnter={() => setHover(a.i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold tabular-nums">
            {hover != null
              ? `${Math.round((data[hover].value / total) * 100)}%`
              : currency
                ? money(total, currency)
                : total}
          </span>
          <span className="max-w-[70%] truncate text-[11px] text-muted-foreground">
            {hover != null ? data[hover].label : 'Total'}
          </span>
        </div>
      </div>

      {/* Legend — identity is label + colour, never colour alone. */}
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((d, i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-3 text-sm"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums">
              {currency ? money(d.value, currency) : d.value}
              <span className="ms-1 text-xs text-muted-foreground">
                {Math.round((d.value / total) * 100)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Sparkline (inline trend) ───────────────────────────────────────────
export function Sparkline({ data, className }: { data: number[]; className?: string }) {
  const w = 100;
  const h = 28;
  if (data.length < 2) return <span className={cn('inline-block', className)} style={{ width: w, height: h }} />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * h}`)
    .join(' ');
  const up = data[data.length - 1] >= data[0];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn('inline-block', className)} style={{ width: w, height: h }} preserveAspectRatio="none">
      <polyline
        points={pts}
        fill="none"
        stroke={up ? 'hsl(var(--success))' : 'hsl(var(--destructive))'}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Empty({ height }: { height: number }) {
  return (
    <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
      No data yet.
    </div>
  );
}
