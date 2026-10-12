import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BadgeCheck, CheckCircle2, Clock, ScanFace } from 'lucide-react-native';
import { Badge, BottomSheet, Button, Card, Input, Text, space, useTheme, useToast } from '@catodrive/ui';
import { TimedViewer } from '@catodrive/core';
import { guestPhotoApi, type TimedView } from '@catodrive/core/web/features/trips/guest-photo-api';
import { ApiError } from '@catodrive/core/web/lib/api/types';

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

/** Before the pickup code: the host sees who is coming and confirms it is the same person. Hidden once the trip starts. */
export function GuestIdentityCard({ bookingId }: { bookingId: string }) {
  const { c } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<TimedView | null>(null);
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState('');
  const { data: s } = useQuery({ queryKey: ['guest-photo', bookingId], queryFn: () => guestPhotoApi.status(bookingId), retry: false, refetchInterval: 60_000 });

  const open = useMutation({
    meta: { silentError: true },
    mutationFn: () => guestPhotoApi.open(bookingId),
    onSuccess: setView,
    onError: (e) => toast({ tone: 'error', title: errorText(e) }),
  });
  const check = useMutation({
    meta: { silentError: true },
    mutationFn: (result: 'match' | 'mismatch') => guestPhotoApi.check(bookingId, result, note.trim() || undefined),
    onSuccess: (r) => {
      setReporting(false);
      toast(r.result === 'match' ? { tone: 'success', title: 'Thanks. Now enter the guest’s pickup code.' } : { tone: 'info', title: 'Trip on hold. Our team has been alerted and will contact you.' });
      void qc.invalidateQueries({ queryKey: ['guest-photo', bookingId] });
    },
    onError: (e) => toast({ tone: 'error', title: errorText(e) }),
  });

  if (!s || s.started) return null;
  const opensAt = new Date(s.opensAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
        <ScanFace size={20} color={c.primary} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading">Who’s picking up</Text>
          <Text variant="caption" tone="muted">Check the person at the car is the verified guest before you enter their pickup code.</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, marginTop: space.md }}>
        <Text variant="label">{s.verifiedName ?? 'Name not verified yet'}</Text>
        {s.age !== undefined ? <Text variant="caption" tone="muted">Age {s.age}</Text> : null}
        {s.verified ? <Badge label="ID verified" tone="success" /> : null}
      </View>
      <View style={{ marginTop: space.md, gap: space.sm }}>
        {s.check?.result === 'mismatch' ? (
          <Line icon={<AlertTriangle size={16} color={c.destructive} />} tone="destructive" text="You reported this is not the same person. The trip is on hold while our team checks. Don’t hand over the keys." />
        ) : s.check?.result === 'match' ? (
          <Line icon={<CheckCircle2 size={16} color={c.success} />} tone="success" text="You confirmed it’s the guest. Enter their pickup code next." />
        ) : !s.open ? (
          <Line icon={<Clock size={16} color={c.mutedForeground} />} tone="muted" text={`The guest’s photo appears ${opensAt}.`} />
        ) : (
          <>
            {s.photoAvailable ? (
              <Button title="See the guest’s photo" variant="outline" icon={<ScanFace size={16} color={c.foreground} />} loading={open.isPending} onPress={() => open.mutate()} />
            ) : (
              <Text variant="caption" tone="muted">The guest’s photo isn’t available. Compare their name with their driving licence in person.</Text>
            )}
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Button title="Yes, it’s them" loading={check.isPending && check.variables === 'match'} onPress={() => check.mutate('match')} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Not the same person" variant="outline" onPress={() => setReporting(true)} />
              </View>
            </View>
          </>
        )}
      </View>
      {view ? (
        <TimedViewer
          title="Guest’s verified photo"
          subtitle="For the pickup identity check only · every view is recorded"
          seconds={view.viewSeconds}
          items={view.items}
          load={() => guestPhotoApi.file(bookingId, view.token)}
          onClose={() => setView(null)}
        />
      ) : null}
      <BottomSheet
        visible={reporting}
        onClose={() => setReporting(false)}
        title="Not the same person?"
        footer={<Button title="Report and hold trip" variant="destructive" loading={check.isPending} onPress={() => check.mutate('mismatch')} />}
      >
        <View style={{ gap: space.md }}>
          <Text tone="muted">The trip goes on hold and our team is alerted right away. Don’t hand over the keys until we confirm.</Text>
          <Input value={note} onChangeText={setNote} maxLength={300} multiline placeholder="What didn’t match? (optional)" style={{ minHeight: 72, textAlignVertical: 'top' }} />
        </View>
      </BottomSheet>
    </Card>
  );
}

function Line({ icon, text, tone }: { icon: React.ReactNode; text: string; tone: 'success' | 'destructive' | 'muted' }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
      <View style={{ marginTop: 2 }}>{icon}</View>
      <Text variant="caption" tone={tone} style={{ flex: 1 }}>{text}</Text>
    </View>
  );
}
