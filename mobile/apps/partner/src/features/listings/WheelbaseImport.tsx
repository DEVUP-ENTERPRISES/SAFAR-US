import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, DownloadCloud, PlusCircle, RefreshCw, SkipForward } from 'lucide-react-native';
import { Badge, Button, Card, Text, space, useTheme } from '@catodrive/ui';
import { hostApi, type WheelbaseImportResult, type WheelbasePreview } from '@catodrive/core/web/features/host/api';
import { WHEELBASE_FILL_LABEL } from '@catodrive/core/web/features/host/fleet-import';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { formatMoney } from '@catodrive/core/web/lib/utils/format';

/** Brings the CatoDrive fleet account's Wheelbase cars in; hidden for every other host. */
export function WheelbaseImport() {
  const { c } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const access = useQuery({ queryKey: ['wheelbase-import-available'], queryFn: () => hostApi.wheelbaseAvailable(), staleTime: 10 * 60_000 });
  const [preview, setPreview] = useState<WheelbasePreview | null>(null);
  const [results, setResults] = useState<WheelbaseImportResult[] | null>(null);
  const load = useMutation({
    meta: { silentError: true },
    mutationFn: () => hostApi.wheelbasePreview(),
    onSuccess: (p) => {
      setPreview(p);
      setResults(null);
    },
  });
  const run = useMutation({
    meta: { silentError: true },
    mutationFn: () => hostApi.wheelbaseImport(),
    onSuccess: (r) => {
      setResults(r);
      setPreview(null);
      void qc.invalidateQueries({ queryKey: ['my-vehicles'] });
      void qc.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });
  const error = load.error ?? run.error;
  if (!access.data?.available) return null;
  const count = (o: WheelbaseImportResult['outcome']) => results?.filter((r) => r.outcome === o).length ?? 0;

  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <DownloadCloud size={20} color={c.primary} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label">Import from Wheelbase</Text>
          <Text variant="caption" tone="muted">
            Cars you already have here are filled in with their Wheelbase photos, description and features, and linked to their insurance. Anything you set yourself is kept. Cars not here yet come in as drafts. Nothing is duplicated.
          </Text>
        </View>
      </View>
      <Button title="Preview what will be imported" variant="outline" icon={<RefreshCw size={16} color={c.foreground} />} loading={load.isPending} style={{ marginTop: space.md }} onPress={() => load.mutate()} />
      {error ? <Text variant="caption" tone="destructive" style={{ marginTop: space.sm }}>{error instanceof ApiError ? error.message : 'Wheelbase could not be reached. Please try again.'}</Text> : null}
      {preview ? (
        <View style={{ gap: space.md, marginTop: space.md }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, alignItems: 'center' }}>
            <Badge label={`${preview.toUpdate} car${preview.toUpdate === 1 ? '' : 's'} to fill in`} tone="success" />
            <Badge label={`${preview.toCreate} new draft${preview.toCreate === 1 ? '' : 's'}`} tone="primary" />
            {preview.toChoose > 0 ? <Badge label={`${preview.toChoose} need a choice`} tone="warning" /> : null}
            <Text variant="caption" tone="muted">from {preview.listings} Wheelbase listings</Text>
          </View>
          {preview.rows.map((r) => (
            <View key={r.listingId} style={{ flexDirection: 'row', gap: space.sm }}>
              {r.action === 'update' ? <CheckCircle2 size={16} color={c.success} /> : r.action === 'create' ? <PlusCircle size={16} color={c.primary} /> : <AlertTriangle size={16} color={c.warning} />}
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label">
                  {r.name}
                  <Text variant="caption" tone="muted"> · {r.photos} photos{r.pricePerDayCents ? ` · ${formatMoney({ amount: r.pricePerDayCents, currency: 'USD' })}/day on Wheelbase` : ''}</Text>
                </Text>
                {r.action === 'update'
                  ? r.cars.map((car) => (
                      <Text key={car.id} variant="caption" tone="muted">
                        {car.name} ({car.status}): {car.fills.length ? `adds ${car.fills.map((f) => WHEELBASE_FILL_LABEL[f] ?? f).join(', ')}` : 'already complete'}
                      </Text>
                    ))
                  : null}
                {r.action === 'create' ? <Text variant="caption" tone="muted">Not on CatoDrive yet: a new draft will be created.</Text> : null}
                {r.note ? <Text variant="caption" tone="warning">{r.note}</Text> : null}
              </View>
            </View>
          ))}
          <Button title={`Import ${preview.toUpdate + preview.toCreate} car${preview.toUpdate + preview.toCreate === 1 ? '' : 's'}`} icon={<DownloadCloud size={16} color={c.primaryForeground} />} loading={run.isPending} onPress={() => run.mutate()} />
        </View>
      ) : null}
      {results ? (
        <View style={{ gap: space.sm, marginTop: space.md }}>
          <Text variant="label">
            Done: {count('updated')} filled in, {count('created')} created{count('failed') ? `, ${count('failed')} failed` : ''}.
          </Text>
          {results.map((r) => (
            <View key={r.listingId} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
              {r.outcome === 'failed' ? <AlertTriangle size={14} color={c.destructive} /> : r.outcome === 'skipped' ? <SkipForward size={14} color={c.mutedForeground} /> : <CheckCircle2 size={14} color={c.success} />}
              <Text variant="caption" style={{ flex: 1 }}>{r.name}: {r.outcome}{r.detail ? ` · ${r.detail}` : ''}</Text>
              {r.vehicleIds.length === 1 ? <Button title="Open" variant="ghost" size="sm" full={false} onPress={() => router.push(`/host/listings/${r.vehicleIds[0]}`)} /> : null}
            </View>
          ))}
          <Text variant="caption" tone="muted">New cars are drafts: set the price and location, then submit them for review from Listings.</Text>
        </View>
      ) : null}
    </Card>
  );
}
