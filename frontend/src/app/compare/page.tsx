'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQueries } from '@tanstack/react-query';
import { X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { formatMoney } from '@/lib/utils/format';
import { vehicleApi } from '@/features/vehicles/api';
import { useCompareStore } from '@/features/vehicles/compare-store';
import type { Vehicle } from '@/features/vehicles/types';

function CompareInner() {
  const qp = useSearchParams();
  const { remove } = useCompareStore();
  const ids = (qp.get('ids') ?? '').split(',').filter(Boolean);

  const results = useQueries({
    queries: ids.map((id) => ({ queryKey: ['vehicle', id], queryFn: () => vehicleApi.getById(id) })),
  });

  if (results.some((r) => r.isLoading)) return <Skeleton className="h-96 w-full" />;
  const cars = results.map((r) => r.data).filter(Boolean) as Vehicle[];
  if (cars.length === 0) return <EmptyState title="Nothing to compare" description="Add cars from search to compare them." action={<Link href="/search"><Button>Browse cars</Button></Link>} />;

  const rows: { label: string; get: (v: Vehicle) => React.ReactNode }[] = [
    { label: 'Price / day', get: (v) => <span className="font-bold">{formatMoney({ amount: v.pricing.dailyPrice, currency: v.pricing.currency })}</span> },
    { label: 'Rating', get: (v) => (v.ratingCount ? `${v.ratingAvg} (${v.ratingCount})` : 'New') },
    { label: 'Superhost', get: (v) => (v.hostIsSuperhost ? <Check className="h-4 w-4 text-primary mx-auto" /> : '—') },
    { label: 'Category', get: (v) => <span className="capitalize">{v.category}</span> },
    { label: 'Seats', get: (v) => v.seats },
    { label: 'Transmission', get: (v) => <span className="capitalize">{v.transmission}</span> },
    { label: 'Fuel', get: (v) => <span className="uppercase">{v.fuelType}</span> },
    { label: 'Instant book', get: (v) => (v.listing.instantBook ? <Check className="h-4 w-4 text-primary mx-auto" /> : '—') },
    { label: 'Delivery', get: (v) => (v.listing.delivery && (v.listing.delivery.airport || v.listing.delivery.home || v.listing.delivery.hotel || v.listing.delivery.business) ? <Check className="h-4 w-4 text-primary mx-auto" /> : '—') },
    { label: 'City', get: (v) => v.location.city || '—' },
    { label: 'Features', get: (v) => <span className="text-xs">{v.features.slice(0, 6).join(', ') || '—'}</span> },
  ];

  return (
    <div className="space-y-5">
      <h1 className="display text-display-sm">Compare cars</h1>
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Feature</th>
              {cars.map((c) => (
                <th key={c._id} className="px-4 py-3 text-left align-top">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/vehicles/${c._id}`} className="font-semibold hover:text-primary">{c.make} {c.model}</Link>
                    <button onClick={() => remove(c._id)} className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-muted-foreground">{row.label}</td>
                {cars.map((c) => <td key={c._id} className="px-4 py-3">{row.get(c)}</td>)}
              </tr>
            ))}
            <tr>
              <td className="px-4 py-3" />
              {cars.map((c) => (
                <td key={c._id} className="px-4 py-3">
                  <Link href={`/vehicles/${c._id}`}><Button size="sm" className="w-full">Book</Button></Link>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ComparePage() {
  return <Suspense fallback={<Skeleton className="h-96 w-full" />}><CompareInner /></Suspense>;
}
