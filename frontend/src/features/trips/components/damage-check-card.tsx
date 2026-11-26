'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Eye, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { connectSocket } from '@/lib/realtime/socket';
import { tripApi } from '@/features/trips/api';

const time = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

/** The guest learns where they stand right after returning the car, instead of days later. */
export function DamageCheckCard({ bookingId }: { bookingId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['damage-check', bookingId],
    queryFn: () => tripApi.damageCheck(bookingId),
    retry: false,
    refetchInterval: (query) => (query.state.data?.status === 'checking' ? 10_000 : false),
  });

  useEffect(() => {
    const socket = connectSocket();
    socket.emit('booking:join', bookingId, () => undefined);
    const done = (e: { bookingId: string }) => {
      if (e.bookingId === bookingId) void qc.invalidateQueries({ queryKey: ['damage-check', bookingId] });
    };
    socket.on('damage:checked', done);
    return () => {
      socket.off('damage:checked', done);
    };
  }, [bookingId, qc]);

  const d = q.data;
  if (!d || d.status === 'unavailable' || d.status === 'waiting_photos') return null;

  if (d.status === 'checking') {
    return (
      <Card className="mt-4">
        <CardContent className="flex items-start gap-3 py-5" role="status">
          <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
          <div>
            <p className="font-semibold">Checking your return photos</p>
            <p className="mt-0.5 text-sm text-muted-foreground">We’re comparing them with the pickup photos. This usually takes under a minute.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const compared = d.photosCompared ? `${d.photosCompared.pre} pickup and ${d.photosCompared.post} return photos` : 'your photos';
  if (d.status === 'clear') {
    return (
      <Card className="mt-4 border-success/40 bg-success/5">
        <CardContent className="flex items-start gap-3 py-5">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <div>
            <p className="font-semibold">No new damage found</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              We compared {compared} on {time(d.checkedAt)}. You’re all set. This record stays on your trip.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-4">
      <CardContent className="flex items-start gap-3 py-5">
        <Eye className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div>
          <p className="font-semibold">Your host will take a look</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            We compared {compared} and flagged a spot or two for your host to check. You don’t need to do anything now. If they
            raise something, you’ll see the photos and can respond.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
