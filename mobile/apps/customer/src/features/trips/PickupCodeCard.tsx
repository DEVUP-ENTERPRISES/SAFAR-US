import { useState } from 'react';
import { View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react-native';
import { Button, Card, Text, useTheme, space } from '@catodrive/ui';
import { bookingApi } from '@catodrive/core/web/features/bookings/api';
import { ApiError } from '@catodrive/core/web/lib/api/types';

/** The code the guest shows the host at the car, generated on the spot. */
export function PickupCodeCard({ bookingId }: { bookingId: string }) {
  const { c } = useTheme();
  const [code, setCode] = useState<string | null>(null);
  const issue = useMutation({ meta: { silentError: true }, mutationFn: () => bookingApi.pickupCode(bookingId), onSuccess: (r) => setCode(r.code) });
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <KeyRound size={18} color={c.primary} />
        <Text variant="heading">Your pickup code</Text>
      </View>
      {code ? (
        <View style={{ gap: space.sm, marginTop: space.md }}>
          <Text variant="display" center style={{ letterSpacing: 8 }} accessibilityLabel={`Pickup code ${code.split('').join(' ')}`}>{code}</Text>
          <Text variant="caption" tone="muted" center>Show this to your host when you collect the car.</Text>
          <Button title="Get a new code" variant="ghost" size="sm" loading={issue.isPending} onPress={() => issue.mutate()} />
        </View>
      ) : (
        <View style={{ gap: space.md, marginTop: space.sm }}>
          <Text variant="caption" tone="muted">Generate this when you are at the car. Your host checks it before handing over the keys.</Text>
          <Button title="Show my code" loading={issue.isPending} onPress={() => issue.mutate()} />
        </View>
      )}
      {issue.isError ? <Text variant="caption" tone="destructive">{issue.error instanceof ApiError ? issue.error.message : 'Could not get a code'}</Text> : null}
    </Card>
  );
}
