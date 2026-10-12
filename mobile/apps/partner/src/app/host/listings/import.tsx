import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, SkipForward, Upload, Wand2 } from 'lucide-react-native';
import { Badge, Button, Card, Input, Screen, ScreenHeader, Skeleton, Text, space, useTheme, type BadgeTone } from '@catodrive/ui';
import { LocationSearch, RequireAuth } from '@catodrive/core';
import { hostApi, type ImportResult, type RowPreview } from '@catodrive/core/web/features/host/api';
import { DEFAULT_IMPORT_ADDRESS, IMPORT_SAMPLE, importReadiness, parseImport, previewBadge, toImportRows } from '@catodrive/core/web/features/host/fleet-import';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { WheelbaseImport } from '@/features/listings/WheelbaseImport';

const TONE: Record<ReturnType<typeof previewBadge>['tone'], BadgeTone> = { default: 'primary', muted: 'neutral', destructive: 'destructive', warning: 'warning', success: 'success' };

/** The website's /host/listings/import: one shared address, one line per car, decoded from the VIN, then imported or updated. */
function ImportFleet() {
  const { c } = useTheme();
  const router = useRouter();
  const [text, setText] = useState('');
  const [address, setAddress] = useState(DEFAULT_IMPORT_ADDRESS);
  const [editingAddress, setEditingAddress] = useState(false);
  const [preview, setPreview] = useState<RowPreview[] | null>(null);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const { rows, errors } = useMemo(() => parseImport(text), [text]);

  const doPreview = useMutation({
    meta: { silentError: true },
    mutationFn: () => hostApi.importPreview(rows.map((r) => r.vin)),
    onSuccess: (d) => {
      setPreview(d);
      setResults(null);
    },
  });
  const doImport = useMutation({ mutationFn: () => hostApi.importFleet(toImportRows(rows, address)), onSuccess: setResults });
  const { ready, blocked, rowOf } = importReadiness(preview ?? [], rows);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/host/listings'));

  return (
    <Screen header={<ScreenHeader title="Import your fleet" subtitle="Set your address once, then paste one line per car." onBack={back} />}>
      <WheelbaseImport />
      <Card style={{ backgroundColor: c.primarySoft, borderColor: c.primary }}>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Wand2 size={18} color={c.primary} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label">Price isn’t typed here.</Text>
            <Text variant="caption" tone="muted">
              Year, make, model, trim, body type, fuel, transmission and seats are read from the VIN, and a starting price is suggested from comparable listings. Every new car also gets your standard delivery setup (both airports, the hotel, and a 20-mile custom radius) - adjust per car on the listing page. Set the real price, add photos and publish from there too. Re-pasting a VIN already in your fleet updates its plate, title or status instead of creating a duplicate.
            </Text>
          </View>
        </View>
      </Card>
      <Card>
        {editingAddress ? (
          <LocationSearch label="Address" hint="Applied to every car in this batch" placeholder={address} onPick={(p) => { setAddress(p.label); setEditingAddress(false); }} />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="small" tone="muted">ADDRESS</Text>
              <Text variant="label">{address}</Text>
              <Text variant="caption" tone="muted">Applied to every car in this batch</Text>
            </View>
            <Button title="Change" variant="ghost" size="sm" full={false} onPress={() => setEditingAddress(true)} />
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.md }}>
          <Text variant="label" style={{ flex: 1 }}>Your cars</Text>
          <Button title="Show me the format" variant="ghost" size="sm" full={false} onPress={() => setText(IMPORT_SAMPLE)} />
        </View>
        <Input
          value={text}
          onChangeText={(t) => {
            setText(t);
            setPreview(null);
            setResults(null);
          }}
          multiline
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder={`VIN, license plate, optional title, status\n${IMPORT_SAMPLE}`}
          style={{ minHeight: 180, textAlignVertical: 'top', fontSize: 14 }}
        />
        <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>
          {rows.length} car{rows.length === 1 ? '' : 's'} read
          {errors.length > 0 ? ` · ${errors.length} line(s) need fixing` : ''}
          {rows.length > 0 && !address ? ' · address required' : ''}
        </Text>
        {errors.slice(0, 8).map((e, i) => <Text key={i} variant="caption" tone="destructive">{e}</Text>)}
        {errors.length > 8 ? <Text variant="caption" tone="destructive">…and {errors.length - 8} more</Text> : null}
        <Button
          title={`Decode ${rows.length || ''} VIN${rows.length === 1 ? '' : 's'}`}
          icon={<Upload size={16} color={c.primaryForeground} />}
          disabled={rows.length === 0 || !address}
          loading={doPreview.isPending}
          style={{ marginTop: space.md }}
          onPress={() => doPreview.mutate()}
        />
        {doPreview.isError ? <Text variant="caption" tone="destructive" style={{ marginTop: space.sm }}>{doPreview.error instanceof ApiError ? doPreview.error.message : 'Could not decode those VINs'}</Text> : null}
      </Card>

      {doPreview.isPending ? <Skeleton height={160} /> : null}

      {preview && !results ? (
        <Card>
          <Text variant="heading">{ready} ready to import</Text>
          {blocked.length > 0 ? (
            <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
              {blocked.length} need{blocked.length === 1 ? 's' : ''} attention, but every car is still attempted - you’ll see the exact reason for each one below.
            </Text>
          ) : null}
          <Button title={`Import / update all ${rows.length} car${rows.length === 1 ? '' : 's'}`} disabled={rows.length === 0} loading={doImport.isPending} style={{ marginTop: space.md }} onPress={() => doImport.mutate()} />
          <View style={{ gap: space.md, marginTop: space.md }}>
            {preview.map((p) => {
              const row = rowOf(p.vin);
              const badge = previewBadge(p, row);
              return (
                <View key={p.vin} style={{ gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <Text variant="label" style={{ flex: 1 }}>{p.ok ? `${p.year} ${p.make} ${p.model}${p.trim ? ` ${p.trim}` : ''}` : p.vin}</Text>
                    <Badge label={badge.label} tone={TONE[badge.tone]} />
                  </View>
                  <Text variant="small" tone="muted">{p.vin}</Text>
                  {p.ok ? (
                    <Text variant="caption" tone="muted">
                      {[p.bodyType, p.fuelType, p.transmission, p.seats && `${p.seats} seats`].filter(Boolean).join(' · ')}
                      {row?.registrationNumber ? ` · ${row.registrationNumber}` : ''}
                      {row?.status ? ` · ${row.status}` : ''}
                    </Text>
                  ) : null}
                  {p.note ? <Text variant="caption" tone="warning">{p.note}</Text> : null}
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}

      {results ? (
        <Card>
          <Text variant="heading">
            {results.filter((r) => r.status === 'created').length} imported as drafts, {results.filter((r) => r.status === 'updated').length} updated
          </Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>New cars land as drafts - add photos, set a real price, then publish. A car without photos will not attract bookings.</Text>
          <View style={{ gap: space.sm, marginTop: space.md }}>
            {results.map((r) => {
              const good = r.status === 'created' || r.status === 'updated';
              return (
                <View key={r.vin} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="caption">{r.label ?? r.vin}</Text>
                    {r.reason ? <Text variant="small" tone="muted">{r.reason}</Text> : null}
                  </View>
                  {good ? <CheckCircle2 size={14} color={c.success} /> : r.status === 'skipped' ? <SkipForward size={14} color={c.mutedForeground} /> : <AlertTriangle size={14} color={c.destructive} />}
                  <Text variant="caption" tone={good ? 'success' : r.status === 'skipped' ? 'muted' : 'destructive'}>{r.status}</Text>
                </View>
              );
            })}
          </View>
          <Button title="Go add photos" style={{ marginTop: space.md }} onPress={() => router.replace('/host/listings')} />
        </Card>
      ) : null}
    </Screen>
  );
}

export default function ImportFleetScreen() {
  return (
    <RequireAuth>
      <ImportFleet />
    </RequireAuth>
  );
}
