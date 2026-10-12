import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Screen, ScreenHeader } from '@catodrive/ui';
import { ChatPanel, RequireAuth } from '@catodrive/core';

/** One conversation, full screen, with a way to the trip it belongs to. */
export default function ConversationScreen() {
  const router = useRouter();
  const { bookingId, name, title } = useLocalSearchParams<{ bookingId: string; name?: string; title?: string }>();
  return (
    <RequireAuth>
      <Screen
        header={
          <ScreenHeader
            title={name ?? 'Messages'}
            subtitle={title}
            onBack={() => (router.canGoBack() ? router.back() : router.replace('/messages'))}
            right={<Button title="Trip" size="sm" variant="ghost" full={false} onPress={() => router.push(`/bookings/${bookingId}`)} />}
          />
        }
      >
        <ChatPanel bookingId={bookingId} height={520} />
      </Screen>
    </RequireAuth>
  );
}
