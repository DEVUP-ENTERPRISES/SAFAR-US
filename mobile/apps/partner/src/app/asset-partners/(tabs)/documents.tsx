import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Camera, FileText, ImageIcon } from 'lucide-react-native';
import { BottomSheet, Button, Card, Chip, DateRangeCalendar, Divider, EmptyState, ErrorState, Screen, ScreenHeader, SkeletonList, Text, space, useTheme, useToast } from '@catodrive/ui';
import { pickPhotos, uploadPhotos, type PickSource } from '@catodrive/core';
import { documentsApi } from '@catodrive/core/web/features/documents/api';
import { EXPIRY_WARNING_DAYS, PARTNER_DOC_CATEGORIES, daysUntil, type PartnerDocCategory } from '@catodrive/core/web/features/asset-partners/status';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { formatDay } from '@catodrive/core/web/lib/utils/format';
import { DocumentRow } from '@/features/asset-partners/DocumentRow';
import { safeMessage } from '@catodrive/core/web/lib/utils/safe-message';

/** The website's /asset-partners/documents: upload insurance and registration, see what is about to lapse. */
export default function PartnerDocumentsScreen() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const toast = useToast();
  const [category, setCategory] = useState<PartnerDocCategory>('insurance');
  const [expiresAt, setExpiresAt] = useState('');
  const [picking, setPicking] = useState(false);
  const q = useQuery({ queryKey: ['partner-documents'], queryFn: () => documentsApi.list() });

  const upload = useMutation({
    meta: { silentError: true },
    mutationFn: async (source: PickSource) => {
      const photos = await pickPhotos(source);
      if (!photos?.length) return null;
      const [uploaded] = await uploadPhotos(category, photos.slice(0, 1));
      return documentsApi.create({ category, url: uploaded.url, key: uploaded.key, expiresAt: expiresAt || undefined });
    },
    onSuccess: (doc) => {
      if (!doc) return;
      void qc.invalidateQueries({ queryKey: ['partner-documents'] });
      setExpiresAt('');
      toast({ tone: 'success', title: 'Document uploaded' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : e instanceof Error ? safeMessage(e.message) : 'Upload failed' }),
  });

  const data = q.data;
  const expiring = (data ?? []).filter((d) => d.expiresAt && daysUntil(d.expiresAt) <= EXPIRY_WARNING_DAYS);

  return (
    <Screen
      header={<ScreenHeader large title="Documents" subtitle="Insurance, registration and title for the cars in your programme." />}
      onRefresh={() => void q.refetch()}
      refreshing={q.isRefetching}
    >
      {expiring.length > 0 ? (
        <Card style={{ borderColor: c.warning, backgroundColor: c.warningSoft }}>
          <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
            <AlertTriangle size={20} color={c.warning} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label">{expiring.length} document{expiring.length === 1 ? '' : 's'} expiring soon</Text>
              <Text variant="caption" tone="muted">Upload the renewal before it lapses - a car can’t stay on the road with expired cover.</Text>
            </View>
          </View>
        </Card>
      ) : null}

      <Card>
        <Text variant="heading">Upload a document</Text>
        <View style={{ gap: space.md, marginTop: space.md }}>
          <Text variant="label">What is it?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {PARTNER_DOC_CATEGORIES.map((x) => <Chip key={x.value} label={x.label} selected={category === x.value} onPress={() => setCategory(x.value)} />)}
          </View>
          <View style={{ gap: 4 }}>
            <Text variant="label">Expires on</Text>
            <Button title={expiresAt ? formatDay(expiresAt) : 'Choose a date'} variant="outline" onPress={() => setPicking(true)} />
            <Text variant="caption" tone="muted">Optional - we’ll remind you before it lapses.</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button title="Take photo" icon={<Camera size={16} color={c.primaryForeground} />} loading={upload.isPending && upload.variables === 'camera'} disabled={upload.isPending} onPress={() => upload.mutate('camera')} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="From library" variant="outline" icon={<ImageIcon size={16} color={c.foreground} />} loading={upload.isPending && upload.variables === 'library'} disabled={upload.isPending} onPress={() => upload.mutate('library')} />
            </View>
          </View>
          <Text variant="caption" tone="muted">Photograph the whole page so the dates are readable.</Text>
        </View>
      </Card>

      <Card>
        <Text variant="heading">Your documents</Text>
        {q.isPending ? <SkeletonList rows={2} height={56} /> : null}
        {q.isError && !data ? <ErrorState message="We couldn’t load your documents." onRetry={() => void q.refetch()} /> : null}
        {data && data.length === 0 ? (
          <EmptyState icon={<FileText size={28} color={c.primary} />} title="Nothing uploaded yet" body="Add your insurance policy and registration to keep the car road-legal." />
        ) : null}
        {data?.map((d, i) => (
          <View key={d._id}>
            {i > 0 ? <Divider /> : null}
            <DocumentRow doc={d} />
          </View>
        ))}
      </Card>

      <BottomSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title="Expires on"
        footer={
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button title="Clear" variant="ghost" onPress={() => { setExpiresAt(''); setPicking(false); }} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Done" onPress={() => setPicking(false)} />
            </View>
          </View>
        }
      >
        <DateRangeCalendar single from={expiresAt} to="" onChange={(from) => setExpiresAt(from)} />
      </BottomSheet>
    </Screen>
  );
}
