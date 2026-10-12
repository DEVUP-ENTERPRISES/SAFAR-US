import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, CarFront, Check, ChevronRight, Clock, FileWarning, MessageSquare } from 'lucide-react-native';
import { Button, Card, Chip, EmptyState, Screen, ScreenHeader, SkeletonList, Text, space, useTheme } from '@catodrive/ui';
import { hostApi, type HostActionItem } from '@catodrive/core/web/features/host/api';
import { notificationsApi } from '@catodrive/core/web/features/notifications/api';
import { useConversations } from '@catodrive/core/web/features/messaging/hooks';
import { useInquiryInbox } from '@catodrive/core/web/features/messaging/inquiry-hooks';
import { ThreadRow } from '@/features/host/ThreadRow';
import { useOpenHref } from '@/features/workspace/useOpenHref';

type Tab = 'actions' | 'messages' | 'inquiries' | 'alerts';
const ICON = { approval: CarFront, message: MessageSquare, document: FileWarning, return_due: Clock } as const;
const money = (cents: number) => `$${(cents / 100).toFixed(0)}`;

/** How long until a deadline, in the roughest useful unit. */
function until(iso: string): { text: string; urgent: boolean } {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { text: 'overdue', urgent: true };
  const h = ms / 3_600_000;
  if (h < 1) return { text: `${Math.max(1, Math.round(ms / 60_000))}m left`, urgent: true };
  if (h < 24) return { text: `${Math.round(h)}h left`, urgent: h <= 6 };
  return { text: `${Math.round(h / 24)}d left`, urgent: false };
}

/** The website's /host/inbox: what needs the host (sorted by what ignoring it costs), guest messages, pre-booking questions, alerts. */
export default function HostInboxScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('actions');
  const inbox = useQuery({ queryKey: ['host-inbox'], queryFn: () => hostApi.inboxActions(), refetchInterval: 60_000 });
  const conversations = useConversations(tab === 'messages');
  const inquiries = useInquiryInbox(tab === 'inquiries');
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: () => notificationsApi.list(), enabled: tab === 'alerts' });
  const markRead = useMutation({
    mutationFn: (ids: string[]) => notificationsApi.markRead(ids),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const items = inbox.data?.items ?? [];
  const atRisk = inbox.data?.atRiskTotal ?? 0;
  const unreadAlerts = (notifications.data ?? []).filter((n) => !n.readAt);
  const tabs: { key: Tab; label: string }[] = [
    { key: 'actions', label: `Needs you${items.length ? ` (${items.length})` : ''}` },
    { key: 'messages', label: 'Messages' },
    { key: 'inquiries', label: `Questions${inquiries.data?.length ? ` (${inquiries.data.length})` : ''}` },
    { key: 'alerts', label: `Alerts${unreadAlerts.length ? ` (${unreadAlerts.length})` : ''}` },
  ];
  const refetch = () => {
    if (tab === 'actions') void inbox.refetch();
    if (tab === 'messages') void conversations.refetch();
    if (tab === 'inquiries') void inquiries.refetch();
    if (tab === 'alerts') void notifications.refetch();
  };

  return (
    <Screen header={<ScreenHeader large title="Inbox" subtitle="Sorted by what it costs to ignore - not by what arrived last." />} onRefresh={refetch} refreshing={false}>
      {atRisk > 0 ? (
        <Card style={{ borderColor: c.destructive, backgroundColor: c.destructiveSoft }}>
          <Text variant="small" tone="destructive">INCOME AT RISK</Text>
          <Text variant="title" tone="destructive">{money(atRisk)}</Text>
        </Card>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {tabs.map((t) => <Chip key={t.key} label={t.label} selected={tab === t.key} onPress={() => setTab(t.key)} />)}
      </ScrollView>

      {tab === 'actions' ? (
        inbox.isPending ? <SkeletonList rows={3} height={80} /> : items.length === 0 ? (
          <EmptyState icon={<Check size={28} color={c.primary} />} title="Nothing needs you" body="No unanswered requests, no unread guests, no expiring documents. Everything is running." />
        ) : (
          items.map((it) => <ActionRow key={`${it.kind}-${it.id}`} item={it} />)
        )
      ) : null}

      {tab === 'messages' ? (
        conversations.isPending ? <SkeletonList rows={2} height={80} /> : (conversations.data?.length ?? 0) === 0 ? (
          <EmptyState icon={<MessageSquare size={28} color={c.primary} />} title="No messages yet" body="Conversations with your guests appear here." />
        ) : (
          conversations.data!.map((x) => (
            <ThreadRow key={x.bookingId} name={x.counterpart.name} avatar={x.counterpart.avatar} title={x.vehicle.title} preview={x.last.preview} fromMe={x.last.fromMe} unread={x.unread} onPress={() => router.push(`/host/trips/${x.bookingId}`)} />
          ))
        )
      ) : null}

      {tab === 'inquiries' ? (
        inquiries.isPending ? <SkeletonList rows={2} height={80} /> : (inquiries.data?.length ?? 0) === 0 ? (
          <EmptyState icon={<MessageSquare size={28} color={c.primary} />} title="No questions yet" body="Prospective guests asking about your cars before booking appear here." />
        ) : (
          inquiries.data!.map((t) => (
            <ThreadRow
              key={`${t.vehicleId}-${t.guestId}`}
              name={t.counterpart.name}
              avatar={t.counterpart.avatar}
              title={t.vehicle.title}
              preview={t.last.preview}
              fromMe={t.last.fromMe}
              unread={t.unread}
              onPress={() => router.push({ pathname: '/host/inquiries/[vehicleId]/[guestId]', params: { vehicleId: t.vehicleId, guestId: t.guestId, name: t.counterpart.name, title: t.vehicle.title } })}
            />
          ))
        )
      ) : null}

      {tab === 'alerts' ? (
        notifications.isPending ? <SkeletonList rows={2} height={70} /> : (notifications.data?.length ?? 0) === 0 ? (
          <EmptyState icon={<Bell size={28} color={c.primary} />} title="No alerts" body="Payouts, reviews and platform notices land here." />
        ) : (
          <>
            {unreadAlerts.length > 0 ? <Button title="Mark all read" size="sm" variant="outline" full={false} loading={markRead.isPending} onPress={() => markRead.mutate(unreadAlerts.map((n) => n._id))} /> : null}
            {notifications.data!.map((n) => (
              <Card key={n._id}>
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="label">{n.title}</Text>
                    <Text variant="caption" tone="muted">{n.body}</Text>
                  </View>
                  {!n.readAt ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary, marginTop: 6 }} accessibilityLabel="Unread" /> : null}
                </View>
              </Card>
            ))}
          </>
        )
      ) : null}
    </Screen>
  );
}

function ActionRow({ item }: { item: HostActionItem }) {
  const { c } = useTheme();
  const openHref = useOpenHref();
  const Icon = ICON[item.kind];
  const due = item.dueAt ? until(item.dueAt) : null;
  const tint = due?.urgent ? c.destructive : c.primary;
  return (
    <Card onPress={() => openHref(item.href)} accessibilityLabel={item.title}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: due?.urgent ? c.destructiveSoft : c.primarySoft }}>
          {due?.urgent ? <AlertTriangle size={18} color={tint} /> : <Icon size={18} color={tint} />}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label">{item.title}</Text>
          <Text variant="caption" tone="muted" numberOfLines={2}>{item.detail}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          {item.atRisk !== null && item.atRisk > 0 ? <Text variant="label" tone="destructive">{money(item.atRisk)}</Text> : null}
          {due ? <Text variant="caption" tone={due.urgent ? 'destructive' : 'muted'}>{due.text}</Text> : null}
        </View>
        <ChevronRight size={18} color={c.mutedForeground} />
      </View>
    </Card>
  );
}
