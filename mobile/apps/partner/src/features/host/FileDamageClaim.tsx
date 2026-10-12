import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Camera, Check, ImageIcon, ShieldAlert } from 'lucide-react-native';
import { Button, Card, Checkbox, Input, Text, space, useConfirm, useTheme, useToast } from '@catodrive/ui';
import { pickPhotos, uploadPhotos, type PickSource } from '@catodrive/core';
import { claimsApi } from '@catodrive/core/web/features/claims/api';
import { tripApi } from '@catodrive/core/web/features/trips/api';

/** A host files a damage claim on a finished trip, with the return photos pre-selected as evidence. */
export function FileDamageClaim({ bookingId, tripId, currency = 'USD' }: { bookingId: string; tripId: string; currency?: string }) {
  const { c } = useTheme();
  const confirm = useConfirm();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [closeups, setCloseups] = useState<{ url: string; key: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [useReturnPhotos, setUseReturnPhotos] = useState(true);
  const trip = useQuery({ queryKey: ['trip', tripId], queryFn: () => tripApi.get(tripId), enabled: open && !!tripId });
  const returnPhotos = (trip.data?.photos ?? []).filter((p) => p.phase === 'post');

  const close = () => {
    setOpen(false);
    setDescription('');
    setAmount('');
    setCloseups([]);
  };

  const addCloseups = async (source: PickSource) => {
    const picked = await pickPhotos(source, { multiple: true });
    if (!picked?.length) return;
    setUploading(true);
    try {
      const uploaded = await uploadPhotos('trip_photo', picked);
      setCloseups((prev) => [...prev, ...uploaded.map((u) => ({ url: u.url, key: u.key }))]);
    } catch (err) {
      toast({ tone: 'error', title: 'Upload failed', body: err instanceof Error ? err.message : undefined });
    } finally {
      setUploading(false);
    }
  };

  const submit = useMutation({
    mutationFn: () =>
      claimsApi.create({
        type: 'damage',
        bookingId,
        tripId,
        description: description.trim(),
        amountClaimed: amount ? Math.round(Number(amount) * 100) : undefined,
        evidence: [
          ...(useReturnPhotos ? returnPhotos.map((p) => ({ url: p.url, kind: 'image' as const })) : []),
          ...closeups.map((x) => ({ url: x.url, kind: 'image' as const })),
        ],
      }),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Claim filed', body: 'Our team will review it and be in touch.' });
      setOpen(false);
    },
  });

  const evidenceCount = (useReturnPhotos ? returnPhotos.length : 0) + closeups.length;
  const doSubmit = async () => {
    const { ok } = await confirm({
      title: 'File this damage claim?',
      description: 'Our team reviews the evidence and, if the claim is upheld, charges the assessed amount to the guest’s security deposit. False claims can affect your account.',
      confirmLabel: 'File claim',
    });
    if (ok) submit.mutate();
  };

  if (submit.isSuccess) {
    return (
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Check size={18} color={c.success} />
          <Text variant="label" tone="success">Damage claim filed</Text>
        </View>
      </Card>
    );
  }

  return (
    <Card style={open ? { borderColor: c.destructive } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <ShieldAlert size={18} color={c.destructive} />
        <Text variant="heading" style={{ flex: 1 }}>Report damage</Text>
        {!open ? <Button title="File a claim" size="sm" variant="outline" full={false} onPress={() => setOpen(true)} /> : null}
      </View>
      {!open ? (
        <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>Found damage after this trip? File a claim against the guest’s security deposit.</Text>
      ) : (
        <View style={{ gap: space.md, marginTop: space.md }}>
          <Input label="What’s the damage?" value={description} onChangeText={setDescription} maxLength={2000} multiline placeholder="e.g. Deep scratch on the rear passenger door, not present at pickup." style={{ minHeight: 80, textAlignVertical: 'top' }} />
          <Input label={`Estimated repair cost (${currency})`} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="e.g. 350" />
          {trip.isPending ? (
            <Text variant="caption" tone="muted">Loading the trip’s return photos…</Text>
          ) : returnPhotos.length > 0 ? (
            <Checkbox
              checked={useReturnPhotos}
              onChange={setUseReturnPhotos}
            >
              <Text variant="label">Include the {returnPhotos.length} return inspection photo{returnPhotos.length === 1 ? '' : 's'} as evidence</Text>
              <Text variant="caption" tone="muted">These are the record of the car’s condition at drop-off.</Text>
            </Checkbox>
          ) : (
            <Text variant="caption" tone="warning">No return inspection photos were taken - add close-ups of the damage below to support your claim.</Text>
          )}
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button title="Take close-ups" variant="outline" icon={<Camera size={16} color={c.foreground} />} loading={uploading} onPress={() => void addCloseups('camera')} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="From library" variant="outline" icon={<ImageIcon size={16} color={c.foreground} />} disabled={uploading} onPress={() => void addCloseups('library')} />
            </View>
          </View>
          {closeups.length > 0 ? (
            <ScrollView horizontal contentContainerStyle={{ gap: space.sm }}>
              {closeups.map((x) => <Image key={x.key} source={{ uri: x.url }} style={{ width: 72, height: 72, borderRadius: 8 }} />)}
            </ScrollView>
          ) : null}
          <Button title="File claim" disabled={description.trim().length < 5 || evidenceCount === 0} loading={submit.isPending} onPress={() => void doSubmit()} />
          {evidenceCount === 0 && !trip.isPending ? <Text variant="caption" tone="muted">Add at least one photo as evidence.</Text> : null}
          <Button title="Cancel" variant="ghost" onPress={close} />
        </View>
      )}
    </Card>
  );
}
