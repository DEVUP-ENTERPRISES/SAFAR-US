import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MessageCircleQuestion, Send } from 'lucide-react-native';
import { Button, Card, Input, Text, useTheme, radius, space } from '@catodrive/ui';
import { useAuthStore } from '@catodrive/core/web/features/auth/store';
import { useVehicleInquiry } from '@catodrive/core/web/features/messaging/inquiry-hooks';
import { SYSTEM_SENDER } from '@catodrive/core/web/features/messaging/hooks';

/** Ask the host before booking: the same inquiry thread the website uses. */
export function AskHost({ vehicleId, hostName }: { vehicleId: string; hostName: string }) {
  const { c } = useTheme();
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const { messages, isLoading, send } = useVehicleInquiry(vehicleId, me?.id);

  if (!me) {
    return (
      <Text tone="muted">
        <Text tone="primary" variant="label" onPress={() => router.push({ pathname: '/login', params: { returnTo: `/vehicles/${vehicleId}` } })}>Sign in</Text> to ask {hostName} a question.
      </Text>
    );
  }

  const submit = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setText('');
    try {
      await send(body);
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <Button
        title={`Ask ${hostName} a question`}
        variant="ghost"
        full
        icon={<MessageCircleQuestion size={18} color={c.primary} />}
        onPress={() => setOpen((o) => !o)}
        accessibilityHint={open ? 'Hide the conversation' : messages.length ? `${messages.length} messages` : 'Before you book'}
      />
      {open ? (
        <View style={styles.body}>
          {!isLoading && messages.length > 0 ? (
            <View style={{ gap: space.sm }}>
              {messages.map((m) => {
                if (m.senderId === SYSTEM_SENDER) return null;
                const mine = m.senderId === me.id;
                return (
                  <View key={m._id} style={[styles.bubble, mine ? { alignSelf: 'flex-end', backgroundColor: c.primary } : { alignSelf: 'flex-start', backgroundColor: c.muted }]}>
                    <Text style={{ color: mine ? c.primaryForeground : c.foreground }}>{m.body}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
          <Input value={text} onChangeText={setText} placeholder="Write your question" multiline style={{ minHeight: 64, textAlignVertical: 'top' }} />
          <Button title="Send" size="sm" full={false} loading={sending} disabled={!text.trim()} icon={<Send size={16} color={c.primaryForeground} />} onPress={() => void submit()} style={{ alignSelf: 'flex-end' }} />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.md, marginTop: space.sm },
  bubble: { maxWidth: '85%', borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: space.sm },
});
