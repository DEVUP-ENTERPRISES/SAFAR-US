'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, ShieldCheck, Car, CalendarDays, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Logo } from '@/components/layout/logo';
import { hostTripsApi } from '@/features/host/trips.api';
import { formatMoney, formatDateRange, formatDate, kmToMiles, perKmToPerMile } from '@/lib/utils/format';

function Line({ label, value, muted, sign }: { label: string; value: string; muted?: boolean; sign?: '-' | '+' }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 text-sm">
      <span className={muted ? 'text-muted-foreground' : 'font-medium'}>{label}</span>
      <span className={`numeric tabular-nums ${muted ? 'text-muted-foreground' : 'font-medium'}`}>
        {sign === '-' ? '−' : sign === '+' ? '+' : ''}{value}
      </span>
    </div>
  );
}

function Receipt() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const router = useRouter();
  const { data: t, isLoading, isError } = useQuery({
    queryKey: ['host-trip', bookingId],
    queryFn: () => hostTripsApi.one(bookingId),
  });
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/verify/${bookingId}`;
    // Dynamically imported and fully guarded: a QR failure must never take the
    // receipt down.
    import('qrcode')
      .then((QR) => QR.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: 'M', color: { dark: '#12100e', light: '#ffffff' } }))
      .then(setQr)
      .catch(() => setQr(null));
  }, [bookingId]);

  if (isLoading) return <Skeleton className="h-[80vh] w-full rounded-2xl" />;
  if (isError || !t) return <ErrorState message="Receipt not found." />;

  // The detailed breakdown is a newer API field. If the backend serving this
  // hasn't shipped it yet, fall back to what every version returns (the host's
  // earnings) so the receipt still renders instead of crashing.
  const hasBreakdown = !!t.receipt;
  const r = t.receipt ?? {
    issuedAt: t.period.start,
    days: 0,
    base: 0, cleaningFee: 0, delivery: 0, protection: 0, protectionPlan: undefined as string | undefined,
    discount: 0, subtotal: t.earnings, commission: 0, tax: 0,
    hostEarnings: t.earnings, total: t.earnings,
  };
  const m = (n: number) => formatMoney({ amount: n, currency: t.currency });
  const paid = ['paid', 'confirmed', 'in_progress', 'completed'].includes(t.status);

  return (
    <div className="mx-auto max-w-2xl px-1 py-2 print:py-0">
      {/* Actions (not printed) */}
      <div className="mb-5 flex items-center justify-between print:hidden">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <Button size="sm" onClick={() => window.print()}>
          <Download className="h-4 w-4" /> Download
        </Button>
      </div>

      {/* The receipt document */}
      <div className="overflow-hidden rounded-[1.5rem] border border-border bg-card shadow-xl shadow-black/5 print:border-0 print:shadow-none">
        {/* Brand header */}
        <div className="relative isolate grain overflow-hidden hero-mesh px-7 py-7 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-black/40 ring-1 ring-white/15">
                  <Logo className="h-7 w-7" />
                </span>
                <div>
                  <p className="text-[15px] font-black leading-none tracking-tight">CatoDrive</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-white/60">Trip receipt</p>
                </div>
              </div>
              <p className="mt-5 font-mono text-2xl font-bold">{t.code}</p>
              <p className="mt-1 text-xs text-white/60">Issued {formatDate(r.issuedAt)}</p>
            </div>
            {/* QR — verify authenticity */}
            <div className="shrink-0 text-center">
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="Verification QR code" className="h-24 w-24 rounded-lg bg-white p-1.5" />
              )}
              <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/60">Scan to verify</p>
            </div>
          </div>
          <span className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${paid ? 'bg-emerald-400/20 text-emerald-300' : 'bg-white/15 text-white'}`}>
            <ShieldCheck className="h-3.5 w-3.5" /> {paid ? 'Paid' : t.status.replace(/_/g, ' ')}
          </span>
        </div>

        {/* Parties + trip */}
        <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2">
          <Cell icon={<Car className="h-4 w-4" />} label="Vehicle" value={`${t.vehicle.make} ${t.vehicle.model} ${t.vehicle.year}`} sub={t.vehicle.plate} />
          <Cell icon={<CalendarDays className="h-4 w-4" />} label="Trip dates" value={formatDateRange(t.period.start, t.period.end)} sub={hasBreakdown ? `${r.days} day${r.days === 1 ? '' : 's'}` : undefined} />
          <Cell label="Guest" value={t.guest.name} sub={`Guest ID · ${t.guest._id.slice(0, 8)}`} />
          <Cell icon={<Gauge className="h-4 w-4" />} label="Mileage" value={t.mileage.includedKm === 0 ? 'Unlimited' : `${kmToMiles(t.mileage.includedKm)} miles included`} sub={t.mileage.overageFeePerKm ? `${m(perKmToPerMile(t.mileage.overageFeePerKm))}/mile over` : undefined} />
        </div>

        {/* Financials */}
        <div className="px-7 py-5">
          {hasBreakdown && (
            <>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Guest charges</p>
              <Line label={`Rental · ${r.days} day${r.days === 1 ? '' : 's'}`} value={m(r.base)} />
              {r.cleaningFee > 0 && <Line label="Cleaning fee" value={m(r.cleaningFee)} muted />}
              {r.delivery > 0 && <Line label="Delivery" value={m(r.delivery)} muted />}
              {r.protection > 0 && <Line label={`Protection${r.protectionPlan ? ` · ${r.protectionPlan}` : ''}`} value={m(r.protection)} muted />}
              {r.discount > 0 && <Line label="Discounts" value={m(r.discount)} muted sign="-" />}
              <div className="my-1 border-t border-dashed border-border" />
              {r.tax > 0 && <Line label="Tax collected" value={m(r.tax)} muted />}
              <Line label="Guest total" value={m(r.total)} />

              <p className="mb-1 mt-5 text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Your payout</p>
              <Line label="Trip subtotal" value={m(r.subtotal)} muted />
              <Line label="Platform commission" value={m(r.commission)} muted sign="-" />
              <div className="my-2 border-t-2 border-dashed border-border" />
            </>
          )}
          <div className="flex items-baseline justify-between">
            <span className="text-base font-black">Your earnings</span>
            <span className="numeric text-2xl font-black tabular-nums text-primary">{m(r.hostEarnings)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border bg-subtle px-7 py-4 text-[11px] leading-relaxed text-muted-foreground">
          <p className="font-mono">Booking ID · {t.bookingId}</p>
          <p className="mt-1">
            Issued by CatoDrive. Figures are the price locked at booking and never change afterward. Any refundable
            security deposit is authorised separately and not included here. Scan the QR to confirm this receipt is genuine.
          </p>
        </div>
      </div>
    </div>
  );
}

function Cell({ icon, label, value, sub }: { icon?: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card px-7 py-4">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function HostReceiptPage() {
  return (
    <AuthGuard>
      <Receipt />
    </AuthGuard>
  );
}
