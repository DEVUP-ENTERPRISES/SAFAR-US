import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, IdCard, Mail, Phone } from 'lucide-react-native';
import { Button, Card, Input, Text, useTheme, useToast, space } from '@catodrive/ui';
import { eligibilityApi } from '@catodrive/core/web/features/account/eligibility-api';
import { ApiError } from '@catodrive/core/web/lib/api/types';

function ContactStep({ channel, onDone }: { channel: 'email' | 'phone'; onDone: () => void }) {
  const { c } = useTheme();
  const toast = useToast();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const fail = (e: unknown) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'That did not work' });
  const send = useMutation({
    meta: { silentError: true },
    mutationFn: () => eligibilityApi.send(channel),
    onSuccess: (r) => {
      if (r.message) toast({ tone: r.sent ? 'info' : 'success', title: r.message });
      if (!r.sent) return onDone();
      setSentTo(r.to);
      if (r.devCode) setCode(r.devCode);
    },
    onError: fail,
  });
  const confirm = useMutation({
    meta: { silentError: true },
    mutationFn: () => eligibilityApi.confirm(channel, code),
    onSuccess: () => {
      toast({ tone: 'success', title: channel === 'email' ? 'Email confirmed' : 'Mobile number confirmed' });
      onDone();
    },
    onError: fail,
  });
  const Icon = channel === 'email' ? Mail : Phone;
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon size={16} color={c.primary} />
        <Text variant="label">Confirm your {channel === 'email' ? 'email address' : 'mobile number'}</Text>
      </View>
      {!sentTo ? (
        <Button title="Send me a code" size="sm" full={false} loading={send.isPending} onPress={() => send.mutate()} />
      ) : (
        <View style={{ gap: space.sm }}>
          <Input placeholder="6-digit code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" />
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <Button title="Confirm" size="sm" full={false} disabled={code.length !== 6} loading={confirm.isPending} onPress={() => confirm.mutate()} />
            <Button title="Resend" size="sm" variant="ghost" full={false} onPress={() => send.mutate()} />
          </View>
          <Text variant="caption" tone="muted">Sent to {sentTo}</Text>
        </View>
      )}
    </View>
  );
}

/** What's left before the guest can drive: confirm email and phone, verify identity. */
export function BookingReadiness({ hideWhenReady = true }: { hideWhenReady?: boolean }) {
  const { c } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['eligibility'], queryFn: () => eligibilityApi.get(), retry: false, refetchOnMount: 'always' });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['eligibility'] });
    void qc.invalidateQueries({ queryKey: ['booking'] });
    void qc.invalidateQueries({ queryKey: ['bookings'] });
  };
  if (!q.data || (hideWhenReady && q.data.eligible)) return null;
  const b = q.data.blockers;
  const steps = [
    { key: 'email', done: !b.includes('email_unverified'), body: <ContactStep channel="email" onDone={refresh} />, doneLabel: 'Email confirmed' },
    { key: 'phone', done: !b.includes('phone_unverified'), body: <ContactStep channel="phone" onDone={refresh} />, doneLabel: 'Mobile number confirmed' },
    {
      key: 'identity',
      done: !b.some((x) => x.startsWith('identity_') || x === 'licence_expired'),
      doneLabel: 'Identity verified',
      body: (
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <IdCard size={16} color={c.primary} />
            <Text variant="label">Verify your licence and identity</Text>
          </View>
          <Button title={b.includes('identity_pending') ? 'Check status' : 'Verify now'} size="sm" full={false} onPress={() => router.push('/account/verify-identity')} />
        </View>
      ),
    },
  ];
  const other = q.data.messages.filter((_, i) => !['email_unverified', 'phone_unverified'].includes(b[i]) && !b[i].startsWith('identity_') && b[i] !== 'licence_expired');
  return (
    <Card>
      <Text variant="heading">{q.data.eligible ? 'You are ready to drive' : 'Finish these to get your car'}</Text>
      <Text variant="caption" tone="muted">Your trip is held while you do. Each step takes under a minute.</Text>
      <View style={{ gap: space.md, marginTop: space.md }}>
        {steps.map((s) => (
          <View key={s.key} style={{ flexDirection: 'row', gap: space.sm }}>
            {s.done ? <CheckCircle2 size={20} color={c.success} /> : <Circle size={20} color={c.mutedForeground} />}
            <View style={{ flex: 1 }}>{s.done ? <Text>{s.doneLabel}</Text> : s.body}</View>
          </View>
        ))}
        {other.map((m) => (
          <Text key={m} variant="caption" tone="warning">{m}</Text>
        ))}
      </View>
    </Card>
  );
}
