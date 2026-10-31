import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Card, Screen, ScreenHeader } from '@catodrive/ui';
import { InquiryThreadView, PersonCard, RequireAuth } from '@catodrive/core';
import { useAuthStore } from '@catodrive/core/web/features/auth/store';
import { useInquiryGuest, useInquiryThread } from '@catodrive/core/web/features/messaging/inquiry-hooks';

/** The website's /host/inquiries/[vehicleId]/[guestId]: one prospective guest's questions about one car. */
function InquiryThread({ vehicleId, guestId, name, title }: { vehicleId: string; guestId: string; name?: string; title?: string }) {
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const { messages, isLoading, send, markRead } = useInquiryThread(vehicleId, guestId);
  const guest = useInquiryGuest(vehicleId, guestId);

  useEffect(() => {
    void markRead().catch(() => undefined);
  }, [vehicleId, guestId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Screen header={<ScreenHeader title={guest.data?.name ?? name ?? 'Question'} subtitle={title ?? 'All questions'} onBack={() => (router.canGoBack() ? router.back() : router.replace('/host/inbox'))} />}>
      <PersonCard person={guest.data} isLoading={guest.isLoading} isError={guest.isError} />
      <Card>
        <InquiryThreadView messages={messages} isLoading={isLoading} myId={me?.id} send={send} />
      </Card>
    </Screen>
  );
}

export default function InquiryThreadScreen() {
  const { vehicleId, guestId, name, title } = useLocalSearchParams<{ vehicleId: string; guestId: string; name?: string; title?: string }>();
  return (
    <RequireAuth>
      <InquiryThread vehicleId={vehicleId} guestId={guestId} name={name} title={title} />
    </RequireAuth>
  );
}
