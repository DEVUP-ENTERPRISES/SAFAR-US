import { useState } from 'react';
import { View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, ShieldAlert, ShieldCheck } from 'lucide-react-native';
import { Button, OtpInput, Text, space, useTheme } from '@catodrive/ui';
import { tripApi } from '@catodrive/core/web/features/trips/api';
import { ApiError } from '@catodrive/core/web/lib/api/types';

/** The host types the six-digit code the guest shows in their app; a wrong-code lock asks the guest for a new one. */
export function VerifyPickup({ tripId, bookingId, locked = false, onVerified }: { tripId?: string; bookingId?: string; locked?: boolean; onVerified?: () => void }) {
  const { c } = useTheme();
  const [code, setCode] = useState('');
  const [ok, setOk] = useState(false);
  const [lockedNow, setLockedNow] = useState(false);
  const verify = useMutation({
    meta: { silentError: true },
    mutationFn: () => tripApi.verifyPickup({ tripId, bookingId }, code),
    onSuccess: () => {
      setOk(true);
      onVerified?.();
    },
    onError: (e) => {
      setCode('');
      if (e instanceof ApiError && e.code === 'PICKUP_CODE_LOCKED') setLockedNow(true);
    },
  });

  if (ok) {
    return (
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        <ShieldCheck size={18} color={c.success} />
        <Text variant="label" tone="success">Guest verified - you can hand over the keys.</Text>
      </View>
    );
  }
  if (locked || lockedNow) {
    return (
      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <ShieldAlert size={16} color={c.destructive} />
          <Text variant="label" tone="destructive">Code locked</Text>
        </View>
        <Text variant="caption" tone="muted">Too many wrong codes were entered. Ask the guest to generate a new code in their app, then enter it here.</Text>
        <Button
          title="Guest made a new code"
          variant="outline"
          size="sm"
          full={false}
          onPress={() => {
            setLockedNow(false);
            onVerified?.();
          }}
        />
      </View>
    );
  }
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        <KeyRound size={16} color={c.primary} />
        <Text variant="label">Check your guest’s code</Text>
      </View>
      <Text variant="caption" tone="muted">Ask them to show the six-digit code in their app. This confirms you are handing the car to the right person.</Text>
      <OtpInput value={code} onChange={setCode} error={verify.isError ? (verify.error instanceof ApiError ? verify.error.message : 'That code did not match. Ask them to read it again.') : undefined} />
      <Button title="Verify" disabled={code.length !== 6} loading={verify.isPending} onPress={() => verify.mutate()} />
    </View>
  );
}
