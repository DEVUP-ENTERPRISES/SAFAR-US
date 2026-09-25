'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { AuthGuard } from '@/components/layout/auth-guard';
import { formatMoney, formatDateRange, formatDate } from '@/lib/utils/format';
import { bookingApi, type Receipt as ReceiptData } from '@/features/bookings/api';
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

/** One receipt: its own lines, which add up to its own total. */
function ReceiptCard({ r, currency, paid, hidden, onPrint }: { r: ReceiptData; currency: string; paid: boolean; hidden: boolean; onPrint: () => void }) {
  const m = (amount: number) => formatMoney({ amount: Math.abs(amount), currency });
  return (
    <div id={r.receiptNo} className={`overflow-hidden rounded-2xl border border-border bg-card print:break-inside-avoid ${hidden ? 'print:hidden' : ''}`}>
      <div className="border-b border-border bg-subtle px-6 py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {r.kind === 'original' ? 'Receipt' : 'Extension receipt'}
            </p>
            <h2 className="mt-1 font-mono text-lg font-bold">{r.receiptNo}</h2>
          </div>
          <Button variant="outline" size="sm" className="print:hidden" onClick={onPrint}>
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{formatDateRange(r.period.start, r.period.end)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Issued {formatDate(r.issuedAt)}
          {r.paymentRef ? ` · Payment ref ${r.paymentRef}` : ''}
        </p>
      </div>
      <div className="px-6 py-2">
        {r.lines.map((l, i) => (
          <Line key={`${l.label}-${i}`} label={l.label} value={`${l.amount < 0 ? '−' : ''}${m(l.amount)}`} muted={i > 0} />
        ))}
        <div className="border-t border-border">
          <Line label={paid ? 'Total paid' : 'Total due'} value={formatMoney(r.total)} strong />
        </div>
      </div>
    </div>
  );
}

function Receipt() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [only, setOnly] = useState<string | null>(null);
  const booking = useQuery({ queryKey: ['booking', id], queryFn: () => bookingApi.getById(id) });
  const receipts = useQuery({ queryKey: ['receipts', id], queryFn: () => bookingApi.receipts(id) });
  const b = booking.data;

  // The car — best-effort: a receipt still renders if the listing was later delisted.
  const vehicle = useQuery({
    queryKey: ['vehicle', b?.vehicleId],
    queryFn: () => vehicleApi.getById(b!.vehicleId),
    enabled: !!b?.vehicleId,
  });

  if (booking.isLoading || receipts.isLoading) return <Skeleton className="h-[70vh] w-full rounded-2xl" />;
  if (booking.isError || receipts.isError || !b || !receipts.data) return <ErrorState message="Booking not found." />;

  const { receipts: list, summary, currency } = receipts.data;
  const v = vehicle.data;
  const pb = b.priceBreakdown;
  const paid = ['paid', 'confirmed', 'in_progress', 'completed'].includes(b.status);

  // Print one receipt alone, or everything (null).
  const print = (receiptNo: string | null) => {
    setOnly(receiptNo);
    setTimeout(() => {
      window.print();
      setOnly(null);
    }, 50);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 print:max-w-none">
      <div className="flex items-center justify-between print:hidden">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <Button variant="outline" size="sm" onClick={() => print(null)}>
          <Printer className="h-4 w-4" /> Print all
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Booking</p>
            <h1 className="mt-1 font-mono text-lg font-bold">{b.code}</h1>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold capitalize text-primary">
            {b.status.replace(/_/g, ' ')}
          </span>
        </div>
        {v && <p className="mt-2 text-sm font-medium">{v.make} {v.model} {v.year}</p>}
        <p className="mt-0.5 text-sm text-muted-foreground">{formatDateRange(summary.period.start, summary.period.end)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Issued {formatDate(b.createdAt)}</p>
      </div>

      {list.map((r) => (
        <ReceiptCard key={r.receiptNo} r={r} currency={currency} paid={paid} hidden={only !== null && only !== r.receiptNo} onPrint={() => print(r.receiptNo)} />
      ))}

      {/* The whole trip in one place: every receipt above adds up to this total. */}
      {list.length > 1 && (
        <div className={`overflow-hidden rounded-2xl border border-border bg-card px-6 py-2 ${only !== null ? 'print:hidden' : ''}`}>
          <p className="pt-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Final summary · {summary.days} days</p>
          {list.map((r) => (
            <Line key={r.receiptNo} label={`${r.receiptNo} · ${r.kind === 'original' ? 'Original booking' : 'Extension'}`} value={formatMoney(r.total)} muted />
          ))}
          <div className="border-t border-border">
            <Line label={paid ? 'Total paid' : 'Total due'} value={formatMoney(summary.total)} strong />
          </div>
        </div>
      )}

      {(pb.surgeDays || pb.delivery?.amount || (pb.memberSavings && pb.memberSavings.amount > 0)) && (
        <div className="rounded-2xl border border-border bg-subtle px-6 py-4 text-xs text-muted-foreground">
          {pb.surgeDays ? (
            <p>Demand pricing applied on {pb.surgeDays} day{pb.surgeDays === 1 ? '' : 's'}{pb.surgeSource && pb.surgeSource !== 'none' ? ` (${pb.surgeSource})` : ''}.</p>
          ) : null}
          {pb.memberSavings && pb.memberSavings.amount > 0 && <p>CatoDrive Plus saved you {formatMoney(pb.memberSavings)} on this trip.</p>}
          {b.delivery && <p>Delivered to {b.delivery.address} ({b.delivery.mode}).</p>}
          <p className="mt-1">Prices shown are what you were quoted and charged — CatoDrive does not change a price after booking.</p>
        </div>
      )}

      <p className="px-2 text-xs text-muted-foreground">
        Issued by {config.appName}. Any refundable security deposit is authorised separately and is not included in these totals.
      </p>
    </div>
  );
}

export default function ReceiptPage() {
  return <AuthGuard><Receipt /></AuthGuard>;
}
