import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Check, CheckCheck, ImagePlus, MessagesSquare, Send } from 'lucide-react-native';
import { Card, Input, Text, useTheme, useToast, radius, space } from '@catodrive/ui';
import { useAuthStore } from '../web/features/auth/store';
import { SYSTEM_SENDER, useMessages } from '../web/features/messaging/hooks';
import { pickPhotos, uploadPhotos } from '../uploads';
import { SecureImage } from './SecureImage';

const QUICK_REPLIES = ['On my way 👍', 'Running a few minutes late', 'Where should I park?', 'Thanks!', 'Sounds good'];

/** The booking's private chat between guest and host, live over the same socket the website uses. */
export function ChatPanel({ bookingId, height = 420 }: { bookingId: string; height?: number }) {
  const { c } = useTheme();
  const toast = useToast();
  const me = useAuthStore((s) => s.user);
  const { messages, isLoading, send, seenByCounterpart, lastMineId } = useMessages(bookingId, me?.id);
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const scroller = useRef<ScrollView>(null);

  useEffect(() => {
    const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [messages.length]);

  const submit = () => {
    if (!text.trim()) return;
    send(text.trim());
    setText('');
  };

  const sendPhoto = async () => {
    const picked = await pickPhotos('library');
    if (!picked?.length) return;
    setUploading(true);
    try {
      const [uploaded] = await uploadPhotos('message', picked.slice(0, 1));
      send('', [{ url: uploaded.url, kind: 'image' }]);
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t send photo', body: err instanceof Error ? err.message : 'Try again.' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card padded={false}>
      <View style={[styles.head, { borderBottomColor: c.border }]}>
        <MessagesSquare size={18} color={c.primary} />
        <View>
          <Text variant="label">Messages</Text>
          <Text variant="caption" tone="muted">Private to this trip</Text>
        </View>
      </View>
      <ScrollView ref={scroller} style={{ height }} contentContainerStyle={styles.thread} nestedScrollEnabled>
        {isLoading ? <ActivityIndicator color={c.primary} /> : null}
        {!isLoading && messages.length === 0 ? (
          <View style={styles.empty}>
            <Text variant="label">Start the conversation</Text>
            <Text variant="caption" tone="muted" center>Coordinate pickup, drop-off and anything else. Messages stay private between you two on CatoDrive.</Text>
          </View>
        ) : null}
        {messages.map((m) => {
          if (m.senderId === SYSTEM_SENDER) {
            return (
              <View key={m._id} style={[styles.system, { backgroundColor: c.muted }]}>
                <Text variant="caption" tone="muted" center>{m.body}</Text>
              </View>
            );
          }
          const mine = m.senderId === me?.id;
          return (
            <View key={m._id} style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 2 }}>
              <View style={[styles.bubble, mine ? { backgroundColor: c.primary, borderBottomRightRadius: 6 } : { backgroundColor: c.card, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 6 }]}>
                {m.attachments?.map((a, i) => (a.kind === 'image' ? <SecureImage key={i} url={a.url} style={styles.photo} alt={a.name} /> : null))}
                {m.body ? <Text style={{ color: mine ? c.primaryForeground : c.foreground, padding: space.md }}>{m.body}</Text> : null}
              </View>
              {mine && m._id === lastMineId ? (
                <View style={styles.seen}>
                  {seenByCounterpart ? <CheckCheck size={12} color={c.primary} /> : <Check size={12} color={c.mutedForeground} />}
                  <Text variant="small" tone="muted">{seenByCounterpart ? 'Seen' : 'Sent'}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quick} keyboardShouldPersistTaps="handled">
        {QUICK_REPLIES.map((q) => (
          <Pressable key={q} accessibilityRole="button" onPress={() => send(q)} style={[styles.quickBtn, { borderColor: c.border, backgroundColor: c.card }]}>
            <Text variant="caption">{q}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={[styles.compose, { borderTopColor: c.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Send a photo" onPress={() => void sendPhoto()} disabled={uploading} hitSlop={8} style={styles.icon}>
          {uploading ? <ActivityIndicator color={c.primary} /> : <ImagePlus size={22} color={c.mutedForeground} />}
        </Pressable>
        <View style={{ flex: 1 }}>
          <Input value={text} onChangeText={setText} placeholder="Write a message" multiline style={{ maxHeight: 120 }} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Send" onPress={submit} disabled={!text.trim()} style={[styles.send, { backgroundColor: text.trim() ? c.primary : c.muted }]}>
          <Send size={18} color={text.trim() ? c.primaryForeground : c.mutedForeground} />
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  thread: { padding: space.md, gap: space.sm },
  empty: { alignItems: 'center', gap: 4, paddingVertical: space.xl, paddingHorizontal: space.lg },
  system: { alignSelf: 'center', borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6, maxWidth: '90%' },
  bubble: { maxWidth: '80%', borderRadius: radius.xl, overflow: 'hidden' },
  photo: { width: 220, height: 160 },
  seen: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  quick: { gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
  quickBtn: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 },
  compose: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, padding: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  icon: { width: 40, height: 48, alignItems: 'center', justifyContent: 'center' },
  send: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
