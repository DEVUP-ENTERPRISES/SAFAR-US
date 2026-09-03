'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Car, CheckCircle2, KeyRound, MapPin, Send, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils/cn';
import { tripApi, type ApproachLeg } from '@/features/trips/api';

const clock = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null;

/**
 * The approach: who has set off, who has arrived, and how to find the car.
 *
 * This exists to end a specific conversation. An hour before handover a guest
 * asks "where are you?", gets no reply because the host is driving, asks again,
 * then calls. Nothing on either screen answers it, so the only tool available
 * is the other person's attention.
 *
 * So the state is stated without anyone being asked for it. "Not set off yet"
 * and "stuck in traffic" look identical on a map and feel completely different
 * to someone waiting, which is why the departure signal is its own thing rather
 * than something inferred from position.
 */
export function ApproachStrip({ bookingId, role }: { bookingId: string; role: 'guest' | 'host' }) {
  const qc = useQueryClient();
  const toast = useToast();

  const q = useQuery({
    queryKey: ['approach', bookingId],
    queryFn: () => tripApi.approach(bookingId),
    refetchInterval: 45_000,
    retry: false,
  });

  const onWay = useMutation({
    mutationFn: () => tripApi.onMyWay(bookingId),
    onSuccess: () => {
      toast({ tone: 'success', title: 'They have been told you are on the way' });
      qc.invalidateQueries({ queryKey: ['approach', bookingId] });
    },
    onError: () => toast({ tone: 'error', title: 'Could not send that' }),
  });

  if (q.isLoading) return <Skeleton className="h-32 w-full" />;
  if (q.isError || !q.data) return null;

  const mine: ApproachLeg = role === 'guest' ? q.data.guest : q.data.host;
  const theirs: ApproachLeg = role === 'guest' ? q.data.host : q.data.guest;
  const themLabel = role === 'guest' ? 'Your host' : 'Your guest';
  const pickup = q.data.pickup;

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        {/* Their status — the thing the messages were asking about. */}
        <div className="flex items-start gap-3">
          {theirs.arrivedAt ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          ) : theirs.onWayAt ? (
            <Car className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          ) : (
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <p className="font-semibold">
              {theirs.arrivedAt
                ? `${themLabel} is here`
                : theirs.onWayAt
                  ? `${themLabel} is on the way`
                  : `${themLabel} has not set off yet`}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {theirs.arrivedAt
                ? `Arrived at ${clock(theirs.arrivedAt)}.`
                : theirs.onWayAt
                  ? theirs.etaAt
                    ? `Expected around ${clock(theirs.etaAt)}. You will be told if that changes — no need to check.`
                    : 'Working out their arrival time.'
                  : 'You will be notified the moment they set off.'}
            </p>
          </div>
        </div>

        {/* My own signal. One tap, so it happens before driving rather than not at all. */}
        {!mine.onWayAt ? (
          <Button className="w-full" loading={onWay.isPending} onClick={() => onWay.mutate()}>
            <Send className="h-4 w-4" /> I&apos;m on my way
          </Button>
        ) : (
          <p className="flex items-center gap-1.5 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" />
            {mine.arrivedAt
              ? `You arrived at ${clock(mine.arrivedAt)}.`
              : `You told them you set off at ${clock(mine.onWayAt)}.`}
          </p>
        )}

        {/* Finding the car — the second most common message after "where are you". */}
        {role === 'guest' && pickup && (pickup.instructions || pickup.spotPhotoUrl || pickup.accessCode) && (
          <div className="border-t border-border pt-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <MapPin className="h-4 w-4 text-primary" /> Finding the car
            </p>
            {pickup.instructions && (
              <p className="mt-1.5 text-sm text-muted-foreground">{pickup.instructions}</p>
            )}
            {pickup.spotPhotoUrl && (
              // A photo of the bay beats any sentence describing it.
              <img
                src={pickup.spotPhotoUrl}
                alt="Where the car is parked"
                className="mt-3 h-40 w-full rounded-xl object-cover"
              />
            )}
            {pickup.accessCode && (
              <p className={cn('mt-3 flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2.5 text-sm')}>
                <KeyRound className="h-4 w-4 shrink-0 text-primary" />
                <span>
                  Access code <span className="numeric font-bold tracking-wider">{pickup.accessCode}</span>
                </span>
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
