'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, ShieldCheck, Star, Zap, Clock, Check } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils/cn';
import { formatMoney } from '@/lib/utils/format';
import { bookingApi, type RebookingOption } from '@/features/bookings/api';
import { ApiError } from '@/lib/api/types';

function Rebook({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [picked, setPicked] = useState<string | null>(null);

  const data = useQuery({ queryKey: ['rebooking-options', id], queryFn: () => bookingApi.rebookingOptions(id), retry: false });

  const rebook = useMutation({
    mutationFn: (vehicleId: string) => bookingApi.rebook(id, vehicleId),
    onSuccess: (b) => {
      toast({ tone: 'success', title: 'You’re booked' });
      router.push(`/bookings/${b._id}`);
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not rebook' }),
  });

  if (data.isLoading) {
    return <div className="mx-auto max-w-3xl space-y-4 py-6"><Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  const d = data.data;
  const covered = d?.protection.enabled;
  const hoursLeft = d?.protection.expiresAt
    ? Math.max(0, Math.round((new Date(d.protection.expiresAt).getTime() - Date.now()) / 3_600_000))
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6 pb-28">
      <Link href={`/bookings/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to booking
      </Link>

      {/* The promise, stated before anything is asked of them. A guest arriving
          here has just been let down; the first thing they should read is that
          it will not cost them. */}
      <Card className={cn(covered ? 'border-primary/40 bg-primary/5' : 'border-border')}>
        <CardContent className="py-6">
          <div className="flex items-start gap-3">
            <ShieldCheck className={cn('mt-0.5 h-6 w-6 shrink-0', covered ? 'text-primary' : 'text-muted-foreground')} />
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                {covered ? 'We’ll cover the difference' : 'Find another car'}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {covered
                  ? 'Your host cancelled, so you shouldn’t pay more for the same trip. Pick any car below — we make up the difference, up to ' +
                    formatMoney({ amount: d!.protection.maxCoverageCents, currency: d!.originalTotal.currency }) +
                    '.'
                  : 'These cars are free for your original dates.'}
              </p>
              {covered && hoursLeft !== null && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                  <Clock className="h-3.5 w-3.5" />
                  {hoursLeft > 0 ? `Cover holds for another ${hoursLeft}h` : 'Cover expires shortly'}
                </p>
              )}
            </div>
          </div>
          {d && (
            <p className="mt-4 border-t border-border/60 pt-3 text-sm">
              You originally paid <span className="font-semibold">{formatMoney(d.originalTotal)}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {!d || d.options.length === 0 ? (
        <EmptyState
          title="No cars free for those dates"
          description="Nothing comparable is available right now. Our team can help you find something — or refund you in full."
        />
      ) : (
        <div className="space-y-3">
          {d.options.map((o) => (
            <OptionCard
              key={o.vehicle._id}
              option={o}
              selected={picked === o.vehicle._id}
              onSelect={() => setPicked(o.vehicle._id)}
            />
          ))}
        </div>
      )}

      {picked && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card p-4 shadow-[0_-8px_30px_rgb(0,0,0,0.10)]">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
            <div className="min-w-0 text-sm">
              <p className="font-semibold">
                You pay {formatMoney(d!.options.find((o) => o.vehicle._id === picked)!.youPay)}
              </p>
              <p className="text-muted-foreground">Same dates as your original trip</p>
            </div>
            <Button size="lg" loading={rebook.isPending} onClick={() => rebook.mutate(picked)}>
              Book this car
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function OptionCard({ option: o, selected, onSelect }: { option: RebookingOption; selected: boolean; onSelect: () => void }) {
  const v = o.vehicle;
  const photo = v.photos?.find((p) => p.isCover)?.url ?? v.photos?.[0]?.url;

  return (
    <button onClick={onSelect} className="block w-full text-start">
      <Card className={cn('transition-colors', selected ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/40')}>
        <CardContent className="flex gap-4 py-4">
          {photo ? (
            <img src={photo} alt="" className="h-24 w-32 shrink-0 rounded-xl object-cover" />
          ) : (
            <div className="h-24 w-32 shrink-0 rounded-xl bg-muted" />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate font-semibold">{v.year} {v.make} {v.model}</p>
              {selected && <Check className="h-5 w-5 shrink-0 text-primary" />}
            </div>

            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {v.ratingCount > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-current text-foreground" /> {v.ratingAvg.toFixed(1)}
                </span>
              ) : (
                <span>New listing</span>
              )}
              {v.listing?.instantBook && (
                <span className="inline-flex items-center gap-0.5 text-primary"><Zap className="h-3.5 w-3.5" /> Instant</span>
              )}
            </div>

            {/* The maths, in the open. A guest who was just let down will not
                take "trust us" — show the sticker price, what we absorb, and
                what actually leaves their account. */}
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              {o.covered > 0 ? (
                <>
                  <span className="text-sm text-muted-foreground line-through">{formatMoney(o.total)}</span>
                  <span className="text-lg font-bold">{formatMoney(o.youPay)}</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {o.fullyCovered
                      ? `We cover ${formatMoney({ amount: o.covered, currency: o.total.currency })}`
                      : `We cover ${formatMoney({ amount: o.covered, currency: o.total.currency })} of ${formatMoney({ amount: o.difference, currency: o.total.currency })}`}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-lg font-bold">{formatMoney(o.youPay)}</span>
                  {o.difference === 0 && (
                    <span className="text-xs font-medium text-muted-foreground">Same as your original price</span>
                  )}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGuard>
      <Rebook id={id} />
    </AuthGuard>
  );
}
