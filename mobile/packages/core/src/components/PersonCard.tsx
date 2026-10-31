import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Avatar, Badge, Card, Skeleton, Text, space, useTheme } from '@catodrive/ui';
import { IDENTITY_LABEL, PERSON_KIND_LABEL, type PersonSummary } from '../web/features/people/types';

const since = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : undefined);

/** The app's version of the website's Person card: who is asking, their trust and history, contact only for CatoDrive staff. */
export function PersonCard({ person, isLoading, isError, title = 'Who’s asking' }: { person?: PersonSummary; isLoading?: boolean; isError?: boolean; title?: string }) {
  const { c } = useTheme();
  if (isLoading) return <Skeleton height={120} />;
  if (isError || !person) return <Card><Text tone="muted">We couldn’t load who this is.</Text></Card>;
  const t = person.trips;
  const blocked = person.deleted || !person.canBook;
  const stats: [string, string][] = [
    ['Trips done', String(t.completed)],
    ['Upcoming', String(t.upcoming)],
    ['They cancelled', String(t.cancelledByGuest)],
    ['Rating', person.rating ? `${person.rating.average} (${person.rating.count})` : 'None yet'],
  ];
  return (
    <Card>
      <View style={styles.gap} accessibilityLabel={title}>
        <Text variant="small" tone="muted">{title.toUpperCase()}</Text>
        <View style={styles.row}>
          <Avatar uri={person.avatar} name={person.name} />
          <View style={styles.flex}>
            <Text variant="heading" numberOfLines={1}>{person.name}</Text>
            {person.memberSince ? <Text variant="caption" tone="muted">Member since {since(person.memberSince)}</Text> : null}
          </View>
        </View>
        <View style={styles.badges}>
          <Badge label={PERSON_KIND_LABEL[person.kind]} />
          <Badge label={IDENTITY_LABEL[person.identity]} tone={person.identity === 'verified' ? 'success' : 'warning'} />
          {blocked ? <Badge label={person.deleted ? 'Account deleted' : 'Can’t book right now'} tone="destructive" /> : null}
          {person.licenceValid === false ? <Badge label="Licence expired" tone="destructive" /> : null}
        </View>
        <View style={styles.stats}>
          {stats.map(([label, value]) => (
            <View key={label} style={styles.stat}>
              <Text variant="caption" tone="muted">{label}</Text>
              <Text variant="label" style={{ fontVariant: ['tabular-nums'] }}>{value}</Text>
            </View>
          ))}
        </View>
        {person.contact?.phone || person.contact?.email ? (
          <View style={[styles.contact, { borderTopColor: c.border }]}>
            {person.contact.phone ? (
              <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`tel:${person.contact!.phone}`)} hitSlop={8}>
                <Text variant="label" style={{ color: c.primary }}>Call {person.contact.phone}</Text>
              </Pressable>
            ) : null}
            {person.contact.email ? (
              <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`mailto:${person.contact!.email}`)} hitSlop={8}>
                <Text variant="label" style={{ color: c.primary }} numberOfLines={1}>{person.contact.email}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1, minWidth: 0 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.sm },
  stat: { width: '50%' },
  contact: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.md, gap: space.sm },
});
