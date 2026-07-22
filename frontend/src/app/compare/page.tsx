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
    <div className="space-y-6">
      <h1 className="display text-3xl sm:text-4xl font-extrabold tracking-tight">Compare cars</h1>
      
      {/* Scrollable table container */}
      <div className="relative rounded-2xl border border-border bg-card shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto hide-scrollbar">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="sticky left-0 z-20 bg-card/95 backdrop-blur px-4 py-4 sm:px-6 font-semibold text-foreground border-r border-border min-w-[140px] shadow-[4px_0_12px_rgb(0,0,0,0.02)]">
                  Feature
                </th>
                {cars.map((c) => (
                  <th key={c._id} className="px-5 py-4 align-top min-w-[200px]">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/vehicles/${c._id}`} className="font-bold text-base hover:text-primary transition-colors leading-tight">
                        {c.make} <br className="hidden sm:block" /><span className="font-medium text-muted-foreground">{c.model}</span>
                      </Link>
                      <button onClick={() => remove(c._id)} className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.label} className="group hover:bg-muted/20 transition-colors">
                  <td className="sticky left-0 z-20 bg-card/95 backdrop-blur px-4 py-4 sm:px-6 font-medium text-muted-foreground border-r border-border group-hover:bg-muted/40 shadow-[4px_0_12px_rgb(0,0,0,0.02)]">
                    {row.label}
                  </td>
                  {cars.map((c) => (
                    <td key={c._id} className="px-5 py-4 text-foreground font-medium">
                      {row.get(c)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-muted/10">
                <td className="sticky left-0 z-20 bg-card/95 backdrop-blur px-4 py-5 sm:px-6 border-r border-border shadow-[4px_0_12px_rgb(0,0,0,0.02)]" />
                {cars.map((c) => (
                  <td key={c._id} className="px-5 py-5">
                    <Link href={`/vehicles/${c._id}`}>
                      <Button size="lg" className="w-full font-bold shadow-md hover:shadow-lg transition-all rounded-xl">
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
  return <Suspense fallback={<Skeleton className="h-96 w-full" />}><CompareInner /></Suspense>;
}
