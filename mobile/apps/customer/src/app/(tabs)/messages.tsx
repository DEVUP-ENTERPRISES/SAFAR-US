import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MessageSquare } from 'lucide-react-native';
import { Avatar, Card, EmptyState, ErrorState, ScreenHeader, SkeletonList, Text, useTheme, radius, space } from '@catodrive/ui';
import { useConversations, type Conversation } from '@catodrive/core/web/features/messaging/hooks';
import { useAuthStore } from '@catodrive/core/web/features/auth/store';
import { SignedOutPrompt } from '@/features/account/SignedOutPrompt';

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d` : `${Math.floor(d / 7)}w`;
}

/** The website's /messages: every conversation with hosts, newest first. */
function Inbox() {
  const { c } = useTheme();
  const router = useRouter();
  const q = useConversations();
  const open = (x: Conversation) => router.push({ pathname: '/messages/[bookingId]', params: { bookingId: x.bookingId, name: x.counterpart.name, title: x.vehicle.title } });
  return (
    <FlatList
      data={q.data ?? []}
      keyExtractor={(x) => x.bookingId}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
      onRefresh={() => void q.refetch()}
      refreshing={q.isRefetching}
      renderItem={({ item: x }) => (
        <Card onPress={() => open(x)} accessibilityLabel={`${x.counterpart.name}, ${x.vehicle.title}${x.unread ? `, ${x.unread} unread` : ''}`}>
          <View style={styles.row}>
            <Avatar uri={x.counterpart.avatar} name={x.counterpart.name} size={48} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.top}>
                <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>{x.counterpart.name}</Text>
                <Text variant="caption" tone="muted">{timeAgo(x.last.at)}</Text>
              </View>
              <Text variant="caption" tone="muted" numberOfLines={1}>{x.vehicle.title}</Text>
              <Text variant="caption" numberOfLines={1} style={x.unread ? { fontWeight: '600' } : undefined}>
                {x.last.fromMe ? 'You: ' : ''}{x.last.system && !x.last.preview ? 'Trip update' : x.last.preview || '-'}
              </Text>
            </View>
            {x.unread > 0 ? (
              <View style={[styles.unread, { backgroundColor: c.primary }]}>
                <Text variant="small" style={{ color: c.primaryForeground }}>{x.unread}</Text>
              </View>
            ) : null}
          </View>
        </Card>
      )}
      ListEmptyComponent={
        q.isPending ? (
          <SkeletonList rows={4} height={80} />
        ) : q.isError ? (
          <ErrorState onRetry={() => void q.refetch()} />
        ) : (
          <EmptyState icon={<MessageSquare size={28} color={c.primary} />} title="No messages yet" body="When you book a car or someone books yours, your conversation shows up here." />
        )
      }
    />
  );
}

export default function MessagesTab() {
  const { c } = useTheme();
  const status = useAuthStore((s) => s.status);
  if (status === 'unauthenticated') {
    return <SignedOutPrompt title="Messages" heading="Your conversations" body="Sign in to message your hosts about your trips." returnTo="/messages" />;
  }
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title="Messages" subtitle="Every conversation with your hosts, in one place." large />
      {status === 'authenticated' ? <Inbox /> : <View style={styles.list}><SkeletonList rows={4} height={80} /></View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.lg, paddingBottom: space.xxxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  unread: { minWidth: 22, height: 22, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
});
