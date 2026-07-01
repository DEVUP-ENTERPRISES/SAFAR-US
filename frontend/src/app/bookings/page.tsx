'use client';

import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { BookingStatusBadge } from '@/features/bookings/components/status-badge';
import { useMyBookings, useCancelBooking } from '@/features/bookings/hooks';
import { formatMoney, formatDateRange } from '@/lib/utils/format';

function BookingsList() {
  const { data, isLoading, isError, refetch } = useMyBookings('guest');
  const cancel = useCancelBooking();

  if (isLoading)
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  if (isError) return <ErrorState message="Couldn't load your trips." retry={() => refetch()} />;
  if (!data || data.length === 0)
    return <EmptyState title="No trips yet" description="Book a vehicle to see it here." />;

  const cancellable = ['pending_approval', 'confirmed', 'paid'];

  return (
    <div className="space-y-3">
      {data.map((b) => (
        <Card key={b._id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{b.code}</span>
                <BookingStatusBadge status={b.status} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDateRange(b.period.start, b.period.end)}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{formatMoney(b.priceBreakdown.total)}</p>
              {cancellable.includes(b.status) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  loading={cancel.isPending}
                  onClick={() => cancel.mutate({ id: b._id, reason: 'Changed plans' })}
                >
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function BookingsPage() {
  return (
    <AuthGuard>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Your trips</h1>
        <BookingsList />
      </div>
    </AuthGuard>
  );
}
