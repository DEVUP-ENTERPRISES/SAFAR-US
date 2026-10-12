import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react-native';
import { Button, ErrorState, Input, Screen, ScreenHeader, Skeleton, Text, useTheme, radius, space } from '@catodrive/ui';
import { supportApi } from '../web/features/support/api';
import { useAuthStore } from '../web/features/auth/store';
import { connectSocket } from '../web/lib/realtime/socket';
import { formatDateTime } from '../web/lib/utils/format';

/** One support ticket: the conversation with our team, live, and a reply box until it's resolved. */
export function TicketScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const { id } = useLocalSearchParams<{ id: string }>();
  const [reply, setReply] = useState('');
  const ticket = useQuery({ queryKey: ['my-ticket', id], queryFn: () => supportApi.get(id) });

  useEffect(() => {
    const socket = connectSocket();
    const onMsg = () => void qc.invalidateQueries({ queryKey: ['my-ticket', id] });
    socket.on('ticket:message', onMsg);
    return () => {
      socket.off('ticket:message', onMsg);
    };
  }, [qc, id]);

  const send = useMutation({
    mutationFn: () => supportApi.reply(id, reply),
    onSuccess: () => {
      setReply('');
      void qc.invalidateQueries({ queryKey: ['my-ticket', id] });
    },
  });

  const t = ticket.data;
  return (
    <Screen
      header={<ScreenHeader title={t?.subject ?? 'Support'} subtitle={t ? t.status.replace(/_/g, ' ') : undefined} onBack={() => (router.canGoBack() ? router.back() : router.replace('/support'))} />}
      onRefresh={() => void ticket.refetch()}
      refreshing={ticket.isRefetching}
      footer={
        t && t.status !== 'resolved' ? (
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Input value={reply} onChangeText={setReply} placeholder="Reply…" multiline style={{ maxHeight: 120 }} />
            </View>
            <Button title="Send" full={false} icon={<Send size={16} color={c.primaryForeground} />} disabled={!reply.trim()} loading={send.isPending} onPress={() => send.mutate()} />
          </View>
        ) : undefined
      }
    >
      {ticket.isPending ? <Skeleton height={200} /> : null}
      {ticket.isError ? <ErrorState onRetry={() => void ticket.refetch()} /> : null}
      {t?.messages.filter((m) => !m.internal).map((m, i) => {
        const mine = m.authorId === me?.id;
        return (
          <View key={i} style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 2 }}>
            <View style={{ maxWidth: '85%', borderRadius: radius.xl, padding: space.md, backgroundColor: mine ? c.primary : c.card, borderWidth: mine ? 0 : 1, borderColor: c.border }}>
              <Text style={{ color: mine ? c.primaryForeground : c.foreground }}>{m.body}</Text>
            </View>
            <Text variant="small" tone="muted">{mine ? 'You' : 'CatoDrive support'} · {formatDateTime(m.at)}</Text>
          </View>
        );
      })}
    </Screen>
  );
}
