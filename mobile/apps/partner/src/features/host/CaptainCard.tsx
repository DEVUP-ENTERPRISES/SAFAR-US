import { Pressable, View } from 'react-native';
import { Car, Clock, Mail, Trash2 } from 'lucide-react-native';
import { Avatar, Badge, Button, Card, Text, space, useTheme } from '@catodrive/ui';
import { ABILITY_LABELS, type AssignableVehicle, type Captain } from '@catodrive/core/web/features/host/team-api';

/** One Captain: status, contact, what they can do and which cars; pause or remove their access. */
export function CaptainCard({ c, vehicles, busy, onToggle, onRemove }: { c: Captain; vehicles: AssignableVehicle[]; busy: boolean; onToggle: () => void; onRemove: () => void }) {
  const { c: t } = useTheme();
  const wholeFleet = c.vehicleIds.length === 0;
  const named = vehicles.filter((v) => c.vehicleIds.includes(v._id));
  const when = (iso: string) => new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' });
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Avatar name={c.name} size={44} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm }}>
            <Text variant="label">{c.name}</Text>
            <Badge label={c.status === 'invited' ? 'Invite pending' : c.status} tone={c.status === 'active' ? 'success' : c.status === 'invited' ? 'warning' : 'neutral'} />
          </View>
          {c.title ? <Text variant="caption" tone="muted">{c.title}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Mail size={12} color={t.mutedForeground} />
            <Text variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>{c.email}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Clock size={12} color={t.mutedForeground} />
            <Text variant="caption" tone="muted">{c.lastActiveAt ? `active ${when(c.lastActiveAt)}` : `invited ${when(c.invitedAt)}`}</Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${c.name}`} hitSlop={10} onPress={onRemove}>
          <Trash2 size={18} color={t.destructive} />
        </Pressable>
      </View>
      <View style={{ gap: space.sm, marginTop: space.md }}>
        <Text variant="small" tone="muted">CAN DO</Text>
        {c.abilities.map((a) => <Text key={a} variant="caption">• {ABILITY_LABELS[a]?.label ?? a}</Text>)}
        <Text variant="small" tone="muted" style={{ marginTop: space.xs }}>CARS</Text>
        {wholeFleet ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Car size={14} color={t.mutedForeground} />
            <Text variant="caption">Entire fleet, including cars added later</Text>
          </View>
        ) : named.length ? (
          named.map((v) => <Text key={v._id} variant="caption">• {v.year} {v.make} {v.model}</Text>)
        ) : (
          <Text variant="caption">{c.vehicleIds.length} car(s)</Text>
        )}
      </View>
      <Button title={c.status === 'suspended' ? 'Restore' : 'Pause access'} size="sm" variant="outline" loading={busy} style={{ marginTop: space.md }} onPress={onToggle} />
    </Card>
  );
}
