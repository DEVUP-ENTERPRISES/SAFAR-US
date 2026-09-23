'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ShieldCheck, Route as RouteIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils/cn';
import { formatMoney } from '@/lib/utils/format';
import { useVehicle } from '@/features/vehicles/hooks';
import { vehicleApi } from '@/features/vehicles/api';
import { PricingPanel } from '@/features/vehicles/components/pricing-panel';

export default function PricingDiscountsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const notify = useToast();
  const [editing, setEditing] = useState(false);

  const { data: v, isPending: vPending, isError: vError, refetch: refetchV } = useVehicle(id);
  const { data: preview, isPending: pPending, isError: pError, refetch: refetchP } = useQuery({
    queryKey: ['pricing-preview', id],
    queryFn: () => vehicleApi.pricingPreview(id),
  });
  const comps = useQuery({
    queryKey: ['price-suggestion', id, v?.location.coordinates, v?.category],
    queryFn: () =>
      vehicleApi.priceSuggestion({
        lng: v!.location.coordinates[0],
        lat: v!.location.coordinates[1],
        category: v!.category,
        fuelType: v!.fuelType,
      }),
    enabled: !!v,
  });

  const updatePricing = useMutation({
    mutationFn: (patch: Record<string, unknown>) => vehicleApi.updatePricing(id, patch),
    onSuccess: () => {
      notify({ tone: 'success', title: 'Pricing updated' });
      qc.invalidateQueries({ queryKey: ['vehicle', id] });
      qc.invalidateQueries({ queryKey: ['pricing-preview', id] });
      setEditing(false);
    },
    onError: () => notify({ tone: 'error', title: 'Could not save that' }),
  });

  if (vPending || pPending) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (vError || !v) return <ErrorState message="Couldn't load this vehicle." retry={() => refetchV()} />;
  if (pError || !preview) return <ErrorState message="Couldn't load pricing." retry={() => refetchP()} />;

  // Where this car's own rate lands against the market for its category/area —
  // the same comps Smart Price already computes, read as a 4-bar dial instead
  // of a single "suggested" number.
  const competitiveness = (() => {
    if (!comps.data) return 0;
    const nightly = v.pricing.dailyPrice; // the base rate — tier discounts don't change how it reads on the market
    if (nightly <= comps.data.p25) return 4;
    if (nightly <= comps.data.median) return 3;
    if (nightly <= comps.data.p75) return 2;
    return 1;
  })();

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-10">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <h1 className="display text-2xl">Pricing &amp; discounts</h1>

      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">Attract longer trips</p>
        <div className="space-y-3">
          {preview.tiers.map((t) => (
            <Card key={t.key}>
              <CardContent className="space-y-3 py-5">
                <div className="flex items-start justify-between">
                  <p className="text-lg font-semibold">{t.label}</p>
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums">
                    {formatMoney({ amount: t.takeHome, currency: t.currency })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t.days}-day take-home earnings{t.discountPct > 0 ? ` · ${t.discountPct}% off` : ''}
                  </p>
                </div>
                {t.distanceKm != null && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <RouteIcon className="h-3.5 w-3.5" /> Distance included
                    </span>
                    <span className="font-medium tabular-nums">
                      {Math.round(t.distanceKm * 0.621371).toLocaleString()} mi
                    </span>
                  </div>
                )}
                <div>
                  <p className="mb-1.5 text-sm text-muted-foreground">Competitiveness</p>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className={cn(
                          'h-1.5 flex-1 rounded-full',
                          i <= competitiveness
                            ? competitiveness >= 3
                              ? 'bg-emerald-500'
                              : 'bg-amber-500'
                            : 'bg-muted',
                        )}
                      />
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">Lock in your earnings</p>
        <Card>
          <CardContent className="space-y-2 py-5">
            <p className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" /> Non-refundable discount
            </p>
            <p className="text-sm text-muted-foreground">
              Every listing offers a discount for trips booked at least 4 days in advance (your early-bird
              rate, set below). It protects your earnings if a guest cancels close to the trip — the discount
              is what they paid for booking ahead, not a refund CatoDrive owes back.
            </p>
          </CardContent>
        </Card>
      </div>

      {editing ? (
        <Card>
          <CardContent className="p-0">
            <PricingPanel vehicle={v} onSave={(patch) => updatePricing.mutate(patch)} saving={updatePricing.isPending} />
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" className="w-full" onClick={() => setEditing(true)}>
          Edit pricing
        </Button>
      )}
    </div>
  );
}
