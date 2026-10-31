import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShieldAlert } from 'lucide-react-native';
import { Badge, Button, Card, Chip, EmptyState, Input, Screen, ScreenHeader, SkeletonList, Text, useTheme, space } from '@catodrive/ui';
import { RequireAuth, pickPhotos, uploadPhotos } from '@catodrive/core';
import { useMyBookings } from '@catodrive/core/web/features/bookings/queries';
import { claimableTrips, tripLabel } from '@catodrive/core/web/features/claims/claim-trips';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { claimsApi } from '@catodrive/core/web/features/claims/api';
import { CLAIM_LIST_TONE } from '@catodrive/core/web/features/claims/status';
import { formatDate } from '@catodrive/core/web/lib/utils/format';
import { claimBadge } from '@/features/claims/claimTone';

type ClaimType = 'damage' | 'insurance' | 'dispute';
const TYPES: { key: ClaimType; label: string }[] = [
  { key: 'damage', label: 'Damage' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'dispute', label: 'Dispute' },
];

/** The website's /claims: file a claim and follow every claim's status. */
function Claims() {
  const { c } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const blank = { type: 'damage' as ClaimType, description: '', bookingId: '', amount: '' };
  const [form, setForm] = useState(blank);
  const [photos, setPhotos] = useState<{ url: string; key: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const list = useQuery({ queryKey: ['my-claims'], queryFn: () => claimsApi.list() });
  const trips = useMyBookings('guest');
  const options = claimableTrips(trips.data);
  const create = useMutation({
    meta: { silentError: true },
    mutationFn: () =>
      claimsApi.create({
        type: form.type,
        description: form.description.trim(),
        bookingId: form.bookingId,
        amountClaimed: form.amount ? Math.round(Number(form.amount) * 100) : undefined,
        evidence: photos.map((p) => ({ url: p.url, kind: 'image' as const })),
      }),
    onSuccess: () => {
      setOpen(false);
      setForm(blank);
      setPhotos([]);
      void qc.invalidateQueries({ queryKey: ['my-claims'] });
    },
  });
  const addPhotos = async (source: 'camera' | 'library') => {
    setUploadError(undefined);
    const picked = await pickPhotos(source, { multiple: source === 'library' });
    if (!picked?.length) return;
    setUploading(true);
    try {
      const ups = await uploadPhotos('claim', picked.slice(0, 10));
      setPhotos((p) => [...p, ...ups.map((u) => ({ url: u.url, key: u.key }))].slice(0, 20));
    } catch {
      setUploadError('Those photos didn’t upload. Try again.');
    } finally {
      setUploading(false);
    }
  };
  const needsPhoto = form.type === 'damage' && photos.length === 0;

  return (
    <Screen
      header={<ScreenHeader title="Claims" onBack={() => router.back()} right={<Button title="File a claim" size="sm" full={false} icon={<Plus size={16} color={c.primaryForeground} />} onPress={() => setOpen((v) => !v)} />} />}
      onRefresh={() => void list.refetch()}
      refreshing={list.isRefetching}
    >
      {open ? (
        <Card>
          <Text variant="heading">New claim</Text>
          <View style={{ gap: space.md, marginTop: space.md }}>
            <Text variant="label">Type</Text>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {TYPES.map((t) => <Chip key={t.key} label={t.label} selected={form.type === t.key} onPress={() => setForm({ ...form, type: t.key })} />)}
            </View>
            <Text variant="label">Which trip?</Text>
            {trips.isPending ? <SkeletonList rows={2} height={44} /> : null}
            {!trips.isPending && options.length === 0 ? <Text variant="caption" tone="muted">{trips.isError ? 'We couldn’t load your trips. Pull down to try again.' : 'You have no trips to claim about yet.'}</Text> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {options.slice(0, 12).map((b) => <Chip key={b._id} label={tripLabel(b)} selected={form.bookingId === b._id} onPress={() => setForm({ ...form, bookingId: b._id })} />)}
            </View>
            <Input label="What happened" value={form.description} onChangeText={(t) => setForm({ ...form, description: t })} multiline maxLength={2000} style={{ minHeight: 80, textAlignVertical: 'top' }} />
            <Input label="Amount you’re claiming (optional, USD)" value={form.amount} onChangeText={(t) => setForm({ ...form, amount: t.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" />
            <Text variant="label">{form.type === 'damage' ? 'Photos (at least one)' : 'Photos (optional)'}</Text>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button title="Take photo" size="sm" variant="outline" full={false} disabled={uploading} onPress={() => void addPhotos('camera')} />
              <Button title="Choose photos" size="sm" variant="outline" full={false} disabled={uploading} onPress={() => void addPhotos('library')} />
            </View>
            {uploading ? <Text variant="caption" tone="muted">Uploading…</Text> : null}
            {photos.length ? <Text variant="caption" tone="muted">{photos.length} photo{photos.length === 1 ? '' : 's'} added</Text> : null}
            {uploadError ? <Text variant="caption" tone="destructive">{uploadError}</Text> : null}
            {create.isError ? <Text variant="caption" tone="destructive">{create.error instanceof ApiError ? create.error.message : 'We couldn’t file that. Try again.'}</Text> : null}
            <Button title="Submit claim" disabled={!form.bookingId || form.description.trim().length < 5 || needsPhoto || uploading} loading={create.isPending} onPress={() => create.mutate()} />
          </View>
        </Card>
      ) : null}
      {list.isPending ? <SkeletonList rows={3} height={90} /> : null}
      {list.data && list.data.length === 0 ? <EmptyState icon={<ShieldAlert size={28} color={c.primary} />} title="No claims" body="Filed claims appear here with live status." /> : null}
      {list.data?.map((x) => (
        <Card key={x._id} onPress={() => router.push(`/claims/${x._id}`)}>
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label" style={{ textTransform: 'capitalize' }}>{x.type} claim</Text>
              <Text variant="caption" tone="muted" numberOfLines={2}>{x.description}</Text>
              <Text variant="caption" tone="muted">Filed {formatDate(x.createdAt)}</Text>
            </View>
            <Badge label={x.status} tone={claimBadge(CLAIM_LIST_TONE[x.status])} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}

export default function ClaimsScreen() {
  return (
    <RequireAuth>
      <Claims />
    </RequireAuth>
  );
}
