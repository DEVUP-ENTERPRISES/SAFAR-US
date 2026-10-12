import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BadgeCheck, Clock, MessageSquare } from 'lucide-react-native';
import { Avatar, Badge, Card, Skeleton, Text, useTheme, space } from '@catodrive/ui';
import { joinedLabel, responseTimeLabel, useHostPublicProfile } from '@catodrive/core/web/features/host/public-profile';

/** The "Hosted by" block: real host, real trip count and rating, links to the host's page. */
export function HostCard({ hostId }: { hostId: string }) {
  const { c } = useTheme();
  const router = useRouter();
  const { data: h, isPending, isError } = useHostPublicProfile(hostId);
  if (isPending) return <Skeleton height={88} />;
  if (isError || !h) return null;
  const facts = [
    h.ratingCount > 0 && `${h.ratingCount} review${h.ratingCount === 1 ? '' : 's'}`,
    h.totalTrips > 0 && `${h.totalTrips} trip${h.totalTrips === 1 ? '' : 's'}`,
    `Joined ${joinedLabel(h.joinedAt)}`,
  ].filter(Boolean) as string[];
  return (
    <Card onPress={() => router.push(`/hosts/${h._id}`)} accessibilityLabel={`Hosted by ${h.displayName}`}>
      <View style={styles.row}>
        <Avatar uri={h.avatarUrl} name={h.displayName} size={56} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.name}>
            <Text variant="heading">{h.displayName}</Text>
            {h.isSuperhost ? <Badge label="All-Star Host" tone="warning" /> : null}
          </View>
          <Text variant="caption" tone="muted">{facts.join(' · ')}</Text>
          {h.ratingAvg !== null ? <Text variant="caption">★ {h.ratingAvg.toFixed(1)}</Text> : null}
        </View>
      </View>
      <View style={styles.facts}>
        {h.responseRatePct !== null ? (
          <View style={styles.fact}>
            <MessageSquare size={14} color={c.mutedForeground} />
            <Text variant="caption" tone="muted">Responds to {h.responseRatePct}% of messages</Text>
          </View>
        ) : null}
        {h.responseTimeMinutes !== null ? (
          <View style={styles.fact}>
            <Clock size={14} color={c.mutedForeground} />
            <Text variant="caption" tone="muted">Usually replies in {responseTimeLabel(h.responseTimeMinutes)}</Text>
          </View>
        ) : null}
        {h.verifications.identity ? (
          <View style={styles.fact}>
            <BadgeCheck size={14} color={c.success} />
            <Text variant="caption" tone="muted">Identity verified</Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  name: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  facts: { marginTop: space.md, gap: 6 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
