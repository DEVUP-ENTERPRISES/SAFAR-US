'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueries } from '@tanstack/react-query';
import { X, Check, Star, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { vehicleApi } from '@/features/vehicles/api';
import { useCompareStore } from '@/features/vehicles/compare-store';
import type { Vehicle } from '@/features/vehicles/types';
import { COMPARE_ROWS, type CompareValue } from '@/features/vehicles/compare';
import { formatMoney } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

const dash = <Minus className="h-4 w-4 text-muted-foreground/40" aria-label="No" />;

/** The shared comparison rows, drawn with this page's styling. */
function Value({ val }: { val: CompareValue }) {
  if ('yes' in val) return val.yes ? <Check className="h-5 w-5 text-primary" aria-label="Yes" /> : dash;
  if ('rating' in val) {
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums">
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
          <span key={f} className="rounded-sm border border-border bg-muted/60 px-2 py-0.5 text-xs font-medium text-foreground">{f}</span>
        ))}
        {val.more > 0 && <span className="text-xs text-muted-foreground">+{val.more} more</span>}
      </div>
    );
  }
  if (val.muted) return <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{val.text}</span>;
  if (val.strong) return <span className="text-base font-bold tabular-nums text-foreground">{val.text}</span>;
  return <span className={cn('font-medium', val.capitalize && 'capitalize')}>{val.text}</span>;
}

const coverOf = (c: Vehicle) => c.photos?.find((p) => p.isCover)?.url ?? c.photos?.[0]?.url;

function Photo({ c, onRemove }: { c: Vehicle; onRemove: () => void }) {
  const cover = coverOf(c);
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt={`${c.make} ${c.model}`} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center bg-primary/20 text-2xl font-black text-primary">{c.make[0]}{c.model[0]}</div>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${c.make} ${c.model} from compare`}
        className="absolute end-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white transition-colors hover:bg-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Phones: cars two per row; under each detail the values sit in the same positions as the cars above. */
function MobileCompare({ cars, remove }: { cars: Vehicle[]; remove: (id: string) => void }) {
  const named = cars.length > 2;
  return (
    <div className="space-y-4 md:hidden">
      <div className="grid grid-cols-2 gap-3">
        {cars.map((c) => (
          <div key={c._id} className="min-w-0 space-y-2">
            <Photo c={c} onRemove={() => remove(c._id)} />
            <Link href={`/vehicles/${c._id}`} className="block min-w-0">
              <p className="line-clamp-2 text-label font-bold leading-snug text-foreground">{c.make} {c.model}</p>
              <p className="truncate text-xs text-muted-foreground">{c.year} · {c.location.city || '—'}</p>
            </Link>
          </div>
        ))}
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {COMPARE_ROWS.map((row) => (
          <div key={row.label} className="space-y-2 p-3">
            <p className="text-xs font-semibold text-muted-foreground">{row.label}</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              {cars.map((c) => (
                <div key={c._id} className="min-w-0 text-sm">
                  {named && <p className="mb-0.5 truncate text-xs text-muted-foreground">{c.make} {c.model}</p>}
                  <Value val={row.get(c)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {cars.map((c) => (
          <Link key={c._id} href={`/vehicles/${c._id}`} className="min-w-0">
            <Button className="w-full">
              <span className="truncate">Book {named ? c.model : 'this car'}</span>
            </Button>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Tablets and up: a side-by-side table with the detail names frozen on the left. */
function TableCompare({ cars, remove }: { cars: Vehicle[]; remove: (id: string) => void }) {
  return (
    <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="sticky start-0 z-20 w-40 min-w-[140px] bg-card px-4 py-4 text-start"><span className="sr-only">Detail</span></th>
              {cars.map((c) => (
                <th key={c._id} scope="col" className="min-w-[180px] px-4 py-4 text-start align-top font-normal">
                  <Photo c={c} onRemove={() => remove(c._id)} />
                  <Link href={`/vehicles/${c._id}`} className="mt-3 block">
                    <p className="text-base font-bold leading-tight text-foreground transition-colors hover:text-primary">{c.make} {c.model}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{c.year} · {c.location.city || '—'} · {formatMoney({ amount: c.pricing.dailyPrice, currency: c.pricing.currency })}/day</p>
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((row, i) => (
              <tr key={row.label} className={i % 2 ? 'bg-subtle' : 'bg-card'}>
                <th scope="row" className={cn('sticky start-0 z-10 border-e border-border px-4 py-3 text-start font-medium text-muted-foreground', i % 2 ? 'bg-subtle' : 'bg-card')}>
                  {row.label}
                </th>
                {cars.map((c) => (
                  <td key={c._id} className="border-e border-border/50 px-4 py-3 last:border-e-0"><Value val={row.get(c)} /></td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-border">
              <td className="sticky start-0 z-10 bg-card px-4 py-4" />
              {cars.map((c) => (
                <td key={c._id} className="px-4 py-4">
                  <Link href={`/vehicles/${c._id}`}><Button className="w-full">Book this car</Button></Link>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompareInner() {
  const qp = useSearchParams();
  const router = useRouter();
  const { remove: forget } = useCompareStore();
  const ids = (qp.get('ids') ?? '').split(',').filter(Boolean);
  // The page shows the cars in the address, so removing one has to update it as well as the saved list.
  const remove = (id: string) => {
    forget(id);
    const rest = ids.filter((x) => x !== id);
    router.replace(rest.length ? `/compare?ids=${rest.join(',')}` : '/compare', { scroll: false });
  };

  const results = useQueries({
    queries: ids.map((id) => ({ queryKey: ['vehicle', id], queryFn: () => vehicleApi.getById(id) })),
  });

  if (results.some((r) => r.isLoading)) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-9 w-48" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {ids.map((id) => <Skeleton key={id} className="aspect-[4/3] w-full rounded-lg" />)}
        </div>
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  const cars = results.map((r) => r.data).filter(Boolean) as Vehicle[];
  const failed = results.filter((r) => r.isError);

  if (cars.length === 0 && failed.length) {
    return <ErrorState message="We couldn’t load these cars." retry={() => failed.forEach((r) => void r.refetch())} />;
  }
  if (cars.length === 0) {
    return (
      <EmptyState
        title="Nothing to compare"
        description="Tap Compare on up to four cars in search to see them side by side."
        action={<Link href="/search"><Button>Browse cars</Button></Link>}
      />
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="display text-2xl font-bold tracking-tight text-foreground md:text-3xl">Compare cars</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {cars.length} car{cars.length === 1 ? '' : 's'} selected{failed.length ? ` · ${failed.length} couldn’t be loaded` : ''}
        </p>
      </div>
      <MobileCompare cars={cars} remove={remove} />
      <TableCompare cars={cars} remove={remove} />
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
