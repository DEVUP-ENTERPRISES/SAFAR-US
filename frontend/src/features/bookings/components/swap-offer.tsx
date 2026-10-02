'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Shuffle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/types';
import { bookingApi } from '../api';
import type { Booking } from '../types';

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

/** The booked car is running late from its previous trip: switch to a similar car at the same price, or keep the booking. */
export function SwapOffer({ booking }: { booking: Booking }) {
  const toast = useToast();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['booking', booking._id] });
  const accept = useMutation({
    mutationFn: () => bookingApi.acceptSwapOffer(booking._id),
    onSuccess: () => { toast({ tone: 'success', title: 'Done. Your trip is now on the new car, same dates and price.' }); void refresh(); },
    onError: (e) => { toast({ tone: 'error', title: errorText(e) }); void refresh(); },
  });
  const decline = useMutation({
    mutationFn: () => bookingApi.declineSwapOffer(booking._id),
    onSuccess: () => { toast({ tone: 'info', title: 'You kept your booking. We will tell you when the car is back.' }); void refresh(); },
    onError: (e) => { toast({ tone: 'error', title: errorText(e) }); void refresh(); },
  });

  const offer = booking.swapOffer;
  if (offer?.status !== 'open') return null;
  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start gap-3">
          <Shuffle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-semibold">Your car may not be back in time</p>
            <p className="mt-0.5 text-muted-foreground">
              It is running late from its previous trip. You can switch to a <strong className="text-foreground">{offer.toName}</strong> for the same dates at no extra cost, or keep your booking and wait for it.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="sm:flex-1" loading={accept.isPending} disabled={decline.isPending} onClick={() => accept.mutate()}>
            Switch to the {offer.toName}
          </Button>
          <Button variant="outline" className="sm:flex-1" loading={decline.isPending} disabled={accept.isPending} onClick={() => decline.mutate()}>
            Keep my booking
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
