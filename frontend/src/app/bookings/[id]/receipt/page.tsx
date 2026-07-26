'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { AuthGuard } from '@/components/layout/auth-guard';
import { formatMoney, formatDateRange, formatDate } from '@/lib/utils/format';
import { bookingApi } from '@/features/bookings/api';
import { vehicleApi } from '@/features/vehicles/api';
import { config } from '@/lib/config';

function Line({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 text-sm ${strong ? 'font-semibold' : ''}`}>
      <span className={muted ? 'text-muted-foreground' : ''}>{label}</span>
      <span className={`tabular-nums ${muted ? 'text-muted-foreground' : ''}`}>{value}</span>
    </div>
  );
}

function Receipt() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: b, isLoading, isError } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => bookingApi.getById(id),
  });

  // The car — for the receipt line and the guest's records. Best-effort: a
  // receipt still renders if the listing was later delisted.
  const vehicle = useQuery({
    queryKey: ['vehicle', b?.vehicleId],
    queryFn: () => vehicleApi.getById(b!.vehicleId),
    enabled: !!b?.vehicleId,
  });

  if (isLoading) return <Skeleton className="h-[70vh] w-full rounded-2xl" />;
  if (isError || !b) return <ErrorState message="Booking not found." />;

  const pb = b.priceBreakdown;
  const cur = pb.currency;
  const v = vehicle.data;
  const paid = ['paid', 'confirmed', 'in_progress', 'completed'].includes(b.status);
  const m = (v: { amount: number; currency: string } | undefined) =>
    v ? formatMoney(v) : formatMoney({ amount: 0, currency: cur });

  return (
    <div className="mx-auto max-w-2xl space-y-6 print:max-w-none">
      <div className="flex items-center justify-between print:hidden">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {/* Header */}
        <div className="border-b border-border bg-subtle px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Receipt</p>
              <h1 className="mt-1 font-mono text-lg font-bold">{b.code}</h1>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold capitalize text-primary">
              {b.status.replace(/_/g, ' ')}
            </span>
          </div>
          {v && (
            <p className="mt-2 text-sm font-medium">
              {v.make} {v.model} {v.year}
            </p>
          )}
          <p className="mt-0.5 text-sm text-muted-foreground">{formatDateRange(b.period.start, b.period.end)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Issued {formatDate(b.createdAt)}</p>
        </div>

        {/* Itemised — every line comes from the price stored at booking time. */}
        <div className="divide-y divide-border px-6">
          <div className="py-2">
            <Line label={`Rental · ${pb.days} day${pb.days === 1 ? '' : 's'}`} value={m(pb.base)} />
            {pb.cleaningFee?.amount > 0 && <Line label="Cleaning fee" value={m(pb.cleaningFee)} muted />}
            {pb.delivery?.amount > 0 && <Line label="Delivery" value={m(pb.delivery)} muted />}
            {pb.selectedAddOns?.map((a) => <Line key={a.code} label={a.label} value={m(a.amount)} muted />)}
            {pb.protection?.amount > 0 && (
              <Line label={`Protection · ${pb.protectionPlan ?? ''}`} value={m(pb.protection)} muted />
            )}
            {pb.discount?.amount > 0 && (
              <Line label="Discounts" value={`−${formatMoney(pb.discount)}`} muted />
            )}
            {pb.memberSavings && pb.memberSavings.amount > 0 && (
              <Line label="CATO Plus savings" value={`−${formatMoney(pb.memberSavings)}`} muted />
            )}
          </div>

          {/* Subtotal and tax as their own lines, so the itemisation actually
              adds up to the total — a receipt whose lines don't sum reads as
              broken, however correct the total is. */}
          <div className="py-2">
            {pb.subtotal?.amount > 0 && <Line label="Subtotal" value={m(pb.subtotal)} muted />}
            {pb.tax?.amount > 0 && <Line label="Tax" value={m(pb.tax)} muted />}
            <Line label={paid ? 'Total paid' : 'Total due'} value={m(pb.total)} strong />
          </div>
        </div>

        {/* Why it was priced this way — the persisted rationale (audit trail). */}
        {(pb.surgeDays || pb.commissionSource || pb.delivery?.amount) && (
          <div className="border-t border-border bg-subtle px-6 py-4 text-xs text-muted-foreground">
            {pb.surgeDays ? (
              <p>Demand pricing applied on {pb.surgeDays} day{pb.surgeDays === 1 ? '' : 's'}{pb.surgeSource && pb.surgeSource !== 'none' ? ` (${pb.surgeSource})` : ''}.</p>
            ) : null}
            {b.delivery && <p>Delivered to {b.delivery.address} ({b.delivery.mode}).</p>}
            <p className="mt-1">Prices shown are what you were quoted and charged — CATO does not change a price after booking.</p>
          </div>
        )}

        {/* Issuer footer — a receipt is a financial document; it says who
            issued it. Any security deposit is authorised separately and is not
            part of this charge. */}
        <div className="border-t border-border px-6 py-4 text-xs text-muted-foreground">
          <p>
            Issued by {config.appName}. Any refundable security deposit is authorised separately and is
            not included in this total.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ReceiptPage() {
  return <AuthGuard><Receipt /></AuthGuard>;
}
