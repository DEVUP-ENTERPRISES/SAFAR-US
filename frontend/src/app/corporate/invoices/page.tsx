'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { formatMoney, formatDate } from '@/lib/utils/format';
import { corporateApi } from '@/features/corporate/api';

export default function InvoicesPage() {
  const { data, isLoading } = useQuery({ queryKey: ['corp-invoice'], queryFn: () => corporateApi.invoice() });
  if (isLoading || !data) return <Skeleton className="h-72 w-full" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="display text-display-sm">Consolidated invoice</h1>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-2xl font-bold">{formatMoney({ amount: data.total, currency: data.currency })}</p>
        </div>
      </div>

      {data.lines.length === 0 && <EmptyState title="No billable trips yet" description="Booked corporate trips appear here." />}

      {data.byCostCenter.length > 0 && (
        <Card>
          <CardHeader><CardTitle>By cost center</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.byCostCenter.map((c) => (
              <div key={c.costCenterId} className="flex justify-between text-sm">
                <span>{c.name}</span>
                <span className="font-semibold">{formatMoney({ amount: c.amount, currency: data.currency })}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data.lines.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-soft">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Booking</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Cost center</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l) => (
                <tr key={l.bookingCode} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{l.bookingCode}</td>
                  <td className="px-4 py-3">{formatDate(l.date)}</td>
                  <td className="px-4 py-3">{l.costCenter}</td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">{l.status.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatMoney({ amount: l.amount, currency: data.currency })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
