import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Send } from 'lucide-react-native';
import { Skeleton, Text, fonts, radius, space, useTheme } from '@catodrive/ui';
import { SYSTEM_SENDER } from '../web/features/messaging/hooks';
import type { InquiryMessage } from '../web/features/messaging/inquiry-hooks';

/** A pre-booking question thread: bubbles (mine on the right) and a composer. Lighter than trip chat: no attachments or realtime. */
export function InquiryThreadView({
  messages,
  isLoading,
  myId,
  send,
  placeholder = 'Reply…',
}: {
  messages: InquiryMessage[];
  isLoading: boolean;
  myId?: string;
  send: (body: string) => Promise<void>;
  placeholder?: string;
}) {
  const { c } = useTheme();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const submit = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText('');
    try {
      await send(body);
    } catch {
      setText(body);
    } finally {
      setSending(false);
    }
  };
  return (
    <View style={{ gap: space.md }}>
      {isLoading ? <Skeleton height={120} /> : null}
      {messages.map((m) => {
        if (m.senderId === SYSTEM_SENDER) return null;
        const mine = m.senderId === myId;
        return (
          <View key={m._id} style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
            <View
              style={{
                maxWidth: '82%',
                borderRadius: radius.xl,
                borderBottomRightRadius: mine ? 6 : radius.xl,
                borderBottomLeftRadius: mine ? radius.xl : 6,
                paddingHorizontal: space.md,
                paddingVertical: space.sm,
                backgroundColor: mine ? c.primary : c.muted,
              }}
            >
              <Text style={{ color: mine ? c.primaryForeground : c.foreground }}>{m.body}</Text>
            </View>
          </View>
        );
      })}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={c.mutedForeground}
          multiline
          maxLength={2000}
          accessibilityLabel="Message"
          style={{ flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: c.input, borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: 10, color: c.foreground, fontFamily: fonts.regular, fontSize: 16, backgroundColor: c.card }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={!text.trim() || sending}
          onPress={() => void submit()}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primary, opacity: !text.trim() || sending ? 0.5 : 1 }}
        >
          <Send size={18} color={c.primaryForeground} />
        </Pressable>
      </View>
    </View>
  );
}
