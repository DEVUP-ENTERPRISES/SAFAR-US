import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, ChevronRight, LifeBuoy, Plus } from 'lucide-react-native';
import { Badge, Button, Card, EmptyState, Input, Screen, ScreenHeader, SkeletonList, Text, useTheme, space } from '@catodrive/ui';
import { supportApi } from '../web/features/support/api';
import { bookingApi } from '../web/features/bookings/api';
import { connectSocket } from '../web/lib/realtime/socket';

/** The website's /support: your tickets, and a new one (about a booking when opened from a trip). */
export function SupportScreen({ helpPath = '/help' }: { helpPath?: string }) {
  const { c } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { bookingId } = useLocalSearchParams<{ bookingId?: string }>();
  const [creating, setCreating] = useState(!!bookingId);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const list = useQuery({ queryKey: ['my-tickets'], queryFn: () => supportApi.list() });
  const about = useQuery({ queryKey: ['booking', bookingId], queryFn: () => bookingApi.getById(bookingId!), enabled: !!bookingId, retry: false });

  useEffect(() => {
    const socket = connectSocket();
    const onMsg = () => void qc.invalidateQueries({ queryKey: ['my-tickets'] });
    socket.on('ticket:message', onMsg);
    return () => {
      socket.off('ticket:message', onMsg);
    };
  }, [qc]);

  const create = useMutation({
    mutationFn: () => supportApi.create({ subject, body, ...(bookingId ? { relatedType: 'booking', relatedId: bookingId } : {}) }),
    onSuccess: (t) => {
      setCreating(false);
      setSubject('');
      setBody('');
      void qc.invalidateQueries({ queryKey: ['my-tickets'] });
      router.push({ pathname: '/support/[id]', params: { id: t._id } });
    },
  });

  return (
    <Screen
      header={<ScreenHeader title="Support" onBack={router.canGoBack() ? () => router.back() : undefined} right={!creating ? <Button title="New ticket" size="sm" full={false} icon={<Plus size={16} color={c.primaryForeground} />} onPress={() => setCreating(true)} /> : undefined} />}
      onRefresh={() => void list.refetch()}
      refreshing={list.isRefetching}
    >
      <Card onPress={() => router.push(helpPath as never)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <BookOpen size={20} color={c.primary} />
          <Text style={{ flex: 1 }}><Text variant="label">Browse the help centre</Text> - answers to common questions, no waiting.</Text>
          <ChevronRight size={18} color={c.mutedForeground} />
        </View>
      </Card>

      {creating ? (
        <Card>
          <Text variant="heading">New ticket</Text>
          {bookingId && about.data ? <Text variant="caption" tone="muted">About booking {about.data.code}</Text> : null}
          <View style={{ gap: space.md, marginTop: space.md }}>
            <Input label="Subject" value={subject} onChangeText={setSubject} />
            <Input label="How can we help?" value={body} onChangeText={setBody} multiline style={{ minHeight: 100, textAlignVertical: 'top' }} />
            <Button title="Submit" disabled={!subject || !body} loading={create.isPending} onPress={() => create.mutate()} />
            <Button title="Cancel" variant="ghost" onPress={() => setCreating(false)} />
          </View>
        </Card>
      ) : null}

      {list.isPending ? <SkeletonList rows={3} height={72} /> : null}
      {list.data && list.data.length === 0 && !creating ? <EmptyState icon={<LifeBuoy size={28} color={c.primary} />} title="No tickets yet" body="Open a ticket and our team will help." /> : null}
      {list.data?.map((t) => (
        <Card key={t._id} onPress={() => router.push({ pathname: '/support/[id]', params: { id: t._id } })}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Text variant="label">{t.subject}</Text>
              <Text variant="caption" tone="muted" style={{ textTransform: 'capitalize' }}>{t.status.replace(/_/g, ' ')}</Text>
            </View>
            <Badge label={t.priority} tone={t.status === 'resolved' ? 'success' : 'neutral'} />
          </View>
        </Card>
      ))}
    </Screen>
  );
}
