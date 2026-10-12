import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { MessageCircleQuestion } from 'lucide-react-native';
import { Button, Card, Text, useTheme, space } from '@catodrive/ui';
import { InquiryThreadView } from '@catodrive/core';
import { useAuthStore } from '@catodrive/core/web/features/auth/store';
import { useVehicleInquiry } from '@catodrive/core/web/features/messaging/inquiry-hooks';

/** Ask the host before booking: the same inquiry thread the website uses. */
export function AskHost({ vehicleId, hostName }: { vehicleId: string; hostName: string }) {
  const { c } = useTheme();
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const { messages, isLoading, send } = useVehicleInquiry(vehicleId, me?.id);

  if (!me) {
    return (
      <Text tone="muted">
        <Text tone="primary" variant="label" onPress={() => router.push({ pathname: '/login', params: { returnTo: `/vehicles/${vehicleId}` } })}>Sign in</Text> to ask {hostName} a question.
      </Text>
    );
  }

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
        <View style={{ gap: space.sm, marginTop: space.sm }}>
          <InquiryThreadView messages={messages} isLoading={isLoading} myId={me.id} send={send} placeholder="e.g. “Does this come with a car seat?”" />
          <Text variant="caption" tone="muted">{hostName} usually replies within a few hours. You won’t be charged until you book.</Text>
        </View>
      ) : null}
    </Card>
  );
}
