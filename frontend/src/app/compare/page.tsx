'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQueries } from '@tanstack/react-query';
import { X, Check, Star, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { vehicleApi } from '@/features/vehicles/api';
import { useCompareStore } from '@/features/vehicles/compare-store';
import type { Vehicle } from '@/features/vehicles/types';
import { COMPARE_ROWS, type CompareValue } from '@/features/vehicles/compare';

// ── Row definitions ──────────────────────────────────────────────────────────

type Row = { label: string; get: (v: Vehicle) => React.ReactNode };

const dash = <Minus className="h-4 w-4 text-muted-foreground/40" />;

/** The shared comparison rows, drawn with this page's styling. */
function renderValue(val: CompareValue): React.ReactNode {
  if ('yes' in val) return val.yes ? <Check className="h-5 w-5 text-primary" /> : dash;
  if ('rating' in val) {
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold">
        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
        {val.rating}
        <span className="text-xs font-normal text-muted-foreground">({val.count})</span>
      </span>
    );
  }
  if ('tags' in val) {
    if (val.tags.length === 0) return dash;
    return (
      <div className="flex flex-wrap gap-1.5">
        {val.tags.map((f) => (
          <span
            key={f}
            className="rounded-md border border-border bg-muted/60 px-2 py-0.5 text-xs font-medium text-foreground"
          >
            {f}
          </span>
        ))}
        {val.more > 0 && <span className="text-xs text-muted-foreground">+{val.more} more</span>}
      </div>
    );
  }
  if (val.muted) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
        {val.text}
      </span>
    );
  }
  if (val.strong) return <span className="text-lg font-bold text-foreground">{val.text}</span>;
  return <span className={val.capitalize ? 'capitalize font-medium' : 'font-medium'}>{val.text}</span>;
}

function buildRows(): Row[] {
  return COMPARE_ROWS.map((r) => ({ label: r.label, get: (v: Vehicle) => renderValue(r.get(v)) }));
}

// ── Page ─────────────────────────────────────────────────────────────────────

function CompareInner() {
  const qp = useSearchParams();
  const { remove } = useCompareStore();
  const ids = (qp.get('ids') ?? '').split(',').filter(Boolean);

  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['vehicle', id],
      queryFn: () => vehicleApi.getById(id),
    })),
  });

  if (results.some((r) => r.isLoading)) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-[600px] w-full rounded-lg" />
      </div>
    );
  }

  const cars = results.map((r) => r.data).filter(Boolean) as Vehicle[];

  if (cars.length === 0) {
    return (
      <EmptyState
        title="Nothing to compare"
        description="Add cars from search to compare them side by side."
        action={
          <Link href="/search">
            <Button>Browse cars</Button>
          </Link>
        }
      />
    );
  }

  const rows = buildRows();

  return (
    <div className="space-y-6 px-0">
      <div>
        <h1 className="display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Compare cars
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {cars.length} vehicle{cars.length === 1 ? '' : 's'} selected
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">

            {/* ── Car header row ── */}
            <thead>
              <tr className="border-b-2 border-border">
                {/* empty label cell */}
                <th className="sticky start-0 z-20 min-w-[150px] bg-card px-5 py-5 text-start" />

                {cars.map((c) => {
                  const cover =
                    c.photos?.find((p) => p.isCover)?.url ?? c.photos?.[0]?.url;
                  return (
                    <th
                      key={c._id}
                      className="min-w-[220px] px-5 py-5 text-start align-top"
                    >
                      {/* Photo */}
                      <div className="relative mb-3 aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted">
                        {cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={cover}
                            alt={`${c.make} ${c.model}`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/60 to-primary/20 text-3xl font-black text-white/80">
                            {c.make[0]}{c.model[0]}
                          </div>
                        )}
                        <button
                          onClick={() => remove(c._id)}
                          aria-label="Remove from compare"
                          className="absolute end-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Name */}
                      <Link
                        href={`/vehicles/${c._id}`}
                        className="group/link block"
                      >
                        <p className="font-bold text-base leading-tight text-foreground group-hover/link:text-primary transition-colors">
                          {c.make} {c.model}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {c.year} · {c.location.city || '—'}
                        </p>
                      </Link>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* ── Data rows ── */}
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr
                  key={row.label}
                  className={rowIdx % 2 === 0 ? 'bg-card' : 'bg-muted/30'}
                >
                  <td className="sticky start-0 z-10 border-e border-border px-5 py-4 font-medium text-muted-foreground"
                    style={{ background: rowIdx % 2 === 0 ? 'hsl(var(--card))' : 'hsl(var(--muted) / 0.3)' }}>
                    {row.label}
                  </td>
                  {cars.map((c) => (
                    <td key={c._id} className="border-e border-border/50 px-5 py-4 last:border-e-0">
                      {row.get(c)}
                    </td>
                  ))}
                </tr>
              ))}

              {/* ── CTA row ── */}
              <tr className="border-t-2 border-border bg-muted/20">
                <td className="sticky start-0 z-10 bg-muted/20 px-5 py-5" />
                {cars.map((c) => (
                  <td key={c._id} className="border-e border-border/50 px-5 py-5 last:border-e-0">
                    <Link href={`/vehicles/${c._id}`}>
                      <Button
                        size="lg"
                        className="w-full rounded-xl font-bold"
                      >
                        Book this car
                      </Button>
                    </Link>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<Skeleton className="h-[600px] w-full rounded-lg" />}>
      <CompareInner />
    </Suspense>
  );
}
