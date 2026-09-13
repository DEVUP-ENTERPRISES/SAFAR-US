'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { BadgeCheck, XCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Logo } from '@/components/layout/logo';
import { bookingApi } from '@/features/bookings/api';
import { formatMoney, formatDateRange, formatDate } from '@/lib/utils/format';

/**
 * Public receipt verification — the page a CATO Drive receipt's QR code opens.
 *
 * No login required and no PII shown: it only confirms that a receipt with this
 * reference is genuine and states its dates, status and total, so anyone holding
 * the receipt (an accountant, an employer, a tax office) can trust it.
 */
export default function VerifyReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ['verify-receipt', id],
    queryFn: () => bookingApi.verify(id),
    retry: false,
  });

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 py-10 text-center">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <Logo className="h-8 w-8" />
        <span className="display text-xl tracking-tight">CATO Drive</span>
      </Link>

      {isLoading ? (
        <Skeleton className="h-72 w-full rounded-3xl" />
      ) : data?.valid ? (
        <div className="w-full overflow-hidden rounded-3xl border border-border bg-card shadow-xl shadow-black/5">
          <div className="flex flex-col items-center gap-2 border-b border-border bg-success/5 px-6 py-8">
            <BadgeCheck className="h-14 w-14 text-success" />
            <p className="text-lg font-bold text-foreground">Genuine receipt</p>
            <p className="text-sm text-muted-foreground">This is a real CATO Drive booking.</p>
          </div>
          <dl className="divide-y divide-border px-6 text-sm">
            <Row label="Reference" value={<span className="font-mono">{data.code}</span>} />
            <Row label="Status" value={<span className="capitalize">{data.status?.replace(/_/g, ' ')}</span>} />
            {data.period && <Row label="Trip dates" value={formatDateRange(data.period.start, data.period.end)} />}
            {typeof data.total === 'number' && data.currency && (
              <Row label="Total" value={<span className="font-semibold">{formatMoney({ amount: data.total, currency: data.currency })}</span>} />
            )}
            {data.issuedAt && <Row label="Issued" value={formatDate(data.issuedAt)} />}
          </dl>
        </div>
      ) : (
        <div className="w-full rounded-3xl border border-border bg-card px-6 py-10 shadow-xl shadow-black/5">
          <XCircle className="mx-auto h-14 w-14 text-destructive" />
          <p className="mt-3 text-lg font-bold">Receipt not found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            We couldn’t verify a receipt with this reference. It may be mistyped, or the booking was removed.
          </p>
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Verified against CATO Drive’s live records. No personal details are shown here.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
