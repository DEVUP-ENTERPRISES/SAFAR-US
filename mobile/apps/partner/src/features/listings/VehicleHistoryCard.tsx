import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, FileSearch, ShieldCheck } from 'lucide-react-native';
import { Badge, Card, Skeleton, Text, space, useTheme } from '@catodrive/ui';
import { titleUnavailableText, vehicleHistory } from '@catodrive/core/web/features/vehicles/listing-form';

/** Safety recalls (per model year - may already be fixed on this car) and title history; "not checked" is never shown as clean. */
export function VehicleHistoryCard({ vehicleId }: { vehicleId: string }) {
  const { c } = useTheme();
  const [expanded, setExpanded] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['vehicle-history', vehicleId], queryFn: () => vehicleHistory(vehicleId), staleTime: 60 * 60 * 1000, retry: false });
  if (q.isPending) return <Skeleton height={120} />;
  if (q.isError || !q.data) return null;
  const { recalls, title, titleUnavailableReason } = q.data;
  const hasRecalls = recalls.length > 0;

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {hasRecalls ? <AlertTriangle size={16} color={c.warning} /> : <ShieldCheck size={16} color={c.success} />}
        <Text variant="heading">Safety & history</Text>
      </View>
      <View style={{ gap: space.sm, marginTop: space.sm }}>
        {hasRecalls ? (
          <>
            <Text variant="caption">
              <Text variant="caption" style={{ fontWeight: '600' }}>{recalls.length} open recall{recalls.length === 1 ? '' : 's'} for this model year.</Text>{' '}
              <Text variant="caption" tone="muted">Recalls are published per model year, so this may already have been fixed on this car. Your dealer does recall work free of charge.</Text>
            </Text>
            {recalls.slice(0, 5).map((r) => {
              const open = expanded === r.campaignNumber;
              return (
                <View key={r.campaignNumber} style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12 }}>
                  <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setExpanded(open ? null : r.campaignNumber)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md }}>
                    <View style={{ flex: 1 }}>
                      <Text variant="label" style={{ textTransform: 'capitalize' }}>{r.component.toLowerCase()}</Text>
                      <Text variant="small" tone="muted">{r.campaignNumber}</Text>
                    </View>
                    <ChevronDown size={16} color={c.mutedForeground} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
                  </Pressable>
                  {open ? (
                    <View style={{ gap: 4, paddingHorizontal: space.md, paddingBottom: space.md }}>
                      <Text variant="caption">{r.summary}</Text>
                      {r.consequence ? <Text variant="caption" tone="muted"><Text variant="caption" style={{ fontWeight: '600' }}>Risk:</Text> {r.consequence}</Text> : null}
                      {r.remedy ? <Text variant="caption" tone="muted"><Text variant="caption" style={{ fontWeight: '600' }}>Fix:</Text> {r.remedy}</Text> : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </>
        ) : (
          <Text variant="caption" tone="muted">No open safety recalls for this make, model and year.</Text>
        )}
        {title ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs }}>
            <Badge label={title.clean ? 'Clean title' : 'Branded title'} tone={title.clean ? 'success' : 'destructive'} />
            {title.brands.map((b) => <Badge key={b} label={b} tone="warning" />)}
            {title.stolen ? <Badge label="Reported stolen" tone="destructive" /> : null}
            {title.odometerSuspect ? <Badge label="Odometer inconsistent" tone="warning" /> : null}
            {title.odometerMiles != null ? <Text variant="caption" tone="muted">{title.odometerMiles.toLocaleString('en-US')} mi on record</Text> : null}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <FileSearch size={14} color={c.mutedForeground} />
            <Text variant="caption" tone="muted" style={{ flex: 1 }}>{titleUnavailableText(titleUnavailableReason)}</Text>
          </View>
        )}
      </View>
    </Card>
  );
}
