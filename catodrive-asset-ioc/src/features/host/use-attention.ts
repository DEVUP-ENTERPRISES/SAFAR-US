import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { useUnreadMessages } from '@/features/messaging/hooks';
import { hostApi } from '~/features/host/api';

const POLL_MS = 60_000;
const TRIP_KINDS = new Set(['approval', 'return_due', 'document']);

/** What is waiting on the operations team, per sidebar section; zero means no badge. */
export function useAttention(enabled = true) {
  const unread = useUnreadMessages(enabled);
  const actions = useQuery({ queryKey: ['host-inbox'], queryFn: () => hostApi.inboxActions(), enabled, refetchInterval: POLL_MS, refetchOnWindowFocus: true });
  const partners = useQuery({
    queryKey: ['ioc-attention'],
    queryFn: () => api.get<{ applications: number; partnerDocuments: number }>('/ioc/attention'),
    enabled,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    // A failed count just hides the badge; it never blocks the panel.
    retry: false,
  });
  const items = actions.data?.items ?? [];
  return {
    trips: items.filter((i) => TRIP_KINDS.has(i.kind)).length,
    inbox: (unread.data?.count ?? 0) + items.filter((i) => i.kind === 'message').length,
    partners: (partners.data?.applications ?? 0) + (partners.data?.partnerDocuments ?? 0),
  };
}
