'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/features/auth/store';
import { reviewsApi } from '@/features/reviews/api';
import { cn } from '@/lib/utils/cn';

/**
 * The post-trip review prompt, for whichever party is looking at it.
 *
 * Reviews existed on the backend and were displayed on profiles, but nobody
 * could write one — there was no form anywhere. Both sides review each other
 * after a completed trip; this shows the prompt to the party who hasn't yet,
 * and confirmation once they have. Double-blind by nature: the backend keeps
 * the two directions separate, so seeing this does not reveal the other side's
 * review.
 */
export function ReviewPrompt({
  bookingId,
  role,
  subjectName,
}: {
  bookingId: string;
  /** Which side the viewer is — decides the copy and which direction to check. */
  role: 'guest' | 'host';
  subjectName?: string;
}) {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');

  const reviews = useQuery({
    queryKey: ['reviews-booking', bookingId],
    queryFn: () => reviewsApi.forBooking(bookingId),
    enabled: !!bookingId,
  });

  const mine = reviews.data?.find((r) => r.authorId === userId);

  const submit = useMutation({
    mutationFn: () => reviewsApi.create(bookingId, rating, comment.trim()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reviews-booking', bookingId] }),
  });

  if (reviews.isLoading) return null;

  const who = subjectName ?? (role === 'guest' ? 'your host' : 'your guest');

  if (mine) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 pt-6">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-success/15 text-success">
            <Check className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">You rated {who} {mine.rating}★</p>
            <p className="text-xs text-muted-foreground">Thanks — your review helps the community.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Rate {who}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n === 1 ? '' : 's'}`}
              onMouseEnter={() => setHover(n)}
              onClick={() => setRating(n)}
              className="p-0.5"
            >
              <Star
                className={cn(
                  'h-7 w-7 transition-colors',
                  (hover || rating) >= n ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40',
                )}
              />
            </button>
          ))}
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder={role === 'guest'
            ? 'How was the car and the host? (optional)'
            : 'How was your guest? (optional)'}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />

        <div className="flex items-center gap-3">
          <Button disabled={rating === 0} loading={submit.isPending} onClick={() => submit.mutate()}>
            Submit review
          </Button>
          {submit.isError && <span className="text-sm text-destructive">Couldn’t submit — try again.</span>}
        </div>
      </CardContent>
    </Card>
  );
}
