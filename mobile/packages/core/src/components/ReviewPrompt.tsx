import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Star } from 'lucide-react-native';
import { Button, Card, Input, Text, useTheme, space } from '@catodrive/ui';
import { useAuthStore } from '../web/features/auth/store';
import { reviewsApi } from '../web/features/reviews/api';

const AMBER = '#f59e0b';

/** Rate the other side once the trip is done; shows the rating already given otherwise. */
export function ReviewPrompt({ bookingId, role, subjectName }: { bookingId: string; role: 'guest' | 'host'; subjectName?: string }) {
  const { c } = useTheme();
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const reviews = useQuery({ queryKey: ['reviews-booking', bookingId], queryFn: () => reviewsApi.forBooking(bookingId), enabled: !!bookingId });
  const mine = reviews.data?.find((r) => r.authorId === userId);
  const submit = useMutation({
    meta: { silentError: true },
    mutationFn: () => reviewsApi.create(bookingId, rating, comment.trim()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['reviews-booking', bookingId] }),
  });
  if (reviews.isPending) return null;
  const who = subjectName ?? (role === 'guest' ? 'your host' : 'your guest');

  if (mine) {
    return (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Check size={20} color={c.success} />
          <View style={{ flex: 1 }}>
            <Text variant="label">You rated {who} {mine.rating}★</Text>
            <Text variant="caption" tone="muted">Thanks - your review helps the community.</Text>
          </View>
        </View>
      </Card>
    );
  }
  return (
    <Card>
      <Text variant="heading">Rate {who}</Text>
      <View style={{ flexDirection: 'row', gap: space.sm, marginVertical: space.md }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`} hitSlop={6} onPress={() => setRating(n)}>
            <Star size={32} color={rating >= n ? AMBER : c.border} fill={rating >= n ? AMBER : 'transparent'} />
          </Pressable>
        ))}
      </View>
      <Input value={comment} onChangeText={setComment} maxLength={1000} multiline style={{ minHeight: 72, textAlignVertical: 'top' }} placeholder={role === 'guest' ? 'How was the car and the host? (optional)' : 'How was your guest? (optional)'} />
      <Button title="Submit review" disabled={rating === 0} loading={submit.isPending} onPress={() => submit.mutate()} style={{ marginTop: space.md }} />
      {submit.isError ? <Text variant="caption" tone="destructive">Couldn’t submit - try again.</Text> : null}
    </Card>
  );
}
