'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Clock, MessageSquare, FileWarning, CarFront, Bell, Check, ChevronRight,
} from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { Tabs } from '@/components/ui/rows';
import { cn } from '@/lib/utils/cn';
import { hostApi, type HostActionItem } from '@/features/host/api';
import { notificationsApi } from '@/features/notifications/api';
import { useConversations } from '@/features/messaging/hooks';

const ICON = {
  approval: CarFront,
  message: MessageSquare,
  document: FileWarning,
  return_due: Clock,
} as const;

const money = (c: number) => `$${(c / 100).toFixed(0)}`;

/** How long until a deadline, in the roughest useful unit. */
function until(iso: string): { text: string; urgent: boolean; passed: boolean } {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { text: 'overdue', urgent: true, passed: true };
  const h = ms / 3_600_000;
  if (h < 1) return { text: `${Math.max(1, Math.round(ms / 60_000))}m left`, urgent: true, passed: false };
  if (h < 24) return { text: `${Math.round(h)}h left`, urgent: h <= 6, passed: false };
  return { text: `${Math.round(h / 24)}d left`, urgent: false, passed: false };
}

function HostInbox() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'actions' | 'messages' | 'alerts'>('actions');

  const inbox = useQuery({ queryKey: ['host-inbox'], queryFn: () => hostApi.inboxActions(), refetchInterval: 60_000 });
  const conversations = useConversations(tab === 'messages');
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list(),
    enabled: tab === 'alerts',
  });

  const markRead = useMutation({
    mutationFn: (ids: string[]) => notificationsApi.markRead(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const items = inbox.data?.items ?? [];
  const atRisk = inbox.data?.atRiskTotal ?? 0;
  const unreadAlerts = (notifications.data ?? []).filter((n) => !n.readAt);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-display-sm">Inbox</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sorted by what it costs to ignore — not by what arrived last.
          </p>
        </div>
        {/* The number that makes a host open this screen. */}
        {atRisk > 0 && (
          <div className="rounded-xl border border-warning/40 bg-warning/5 px-4 py-2.5 text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Income at risk</p>
            <p className="text-xl font-bold text-warning">{money(atRisk)}</p>
          </div>
        )}
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'actions' as const, label: `Needs you${items.length ? ` (${items.length})` : ''}` },
          { key: 'messages' as const, label: 'Messages' },
          { key: 'alerts' as const, label: `Alerts${unreadAlerts.length ? ` (${unreadAlerts.length})` : ''}` },
        ]}
      />

      {tab === 'actions' && (
        inbox.isLoading ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Check className="h-8 w-8" />}
            title="Nothing needs you"
            description="No unanswered requests, no unread guests, no expiring documents. Everything is running."
          />
        ) : (
          <div className="space-y-3">{items.map((it) => <ActionRow key={`${it.kind}-${it.id}`} item={it} />)}</div>
        )
      )}

      {tab === 'messages' && (
        conversations.isLoading ? (
          <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : (conversations.data?.length ?? 0) === 0 ? (
          <EmptyState icon={<MessageSquare className="h-8 w-8" />} title="No messages yet" description="Conversations with your guests appear here." />
        ) : (
          <div className="space-y-2">
            {conversations.data!.map((c) => (
              <Link key={c.bookingId} href={`/host/trips/${c.bookingId}`}>
                <Card className="transition-colors hover:border-primary/40">
                  <CardContent className="flex items-center gap-3 py-3.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                      {c.counterpart.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{c.counterpart.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{c.vehicle.title}</p>
                      <p className={cn('truncate text-sm', c.unread > 0 ? 'font-medium' : 'text-muted-foreground')}>
                        {c.last.fromMe && 'You: '}{c.last.preview || '—'}
                      </p>
                    </div>
                    {c.unread > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                        {c.unread}
                      </span>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )
      )}

      {tab === 'alerts' && (
        notifications.isLoading ? (
          <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : (notifications.data?.length ?? 0) === 0 ? (
          <EmptyState icon={<Bell className="h-8 w-8" />} title="No alerts" description="Payouts, reviews and platform notices land here." />
        ) : (
          <div className="space-y-2">
            {unreadAlerts.length > 0 && (
              <div className="flex justify-end">
                <Button size="sm" variant="outline" loading={markRead.isPending} onClick={() => markRead.mutate(unreadAlerts.map((n) => n._id))}>
                  Mark all read
                </Button>
              </div>
            )}
            {notifications.data!.map((n) => (
              <Card key={n._id} className={cn(!n.readAt && 'border-primary/40 bg-primary/5')}>
                <CardContent className="py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{n.title}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                    </div>
                    {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function ActionRow({ item }: { item: HostActionItem }) {
  const Icon = ICON[item.kind];
  const due = item.dueAt ? until(item.dueAt) : null;

  return (
    <Link href={item.href}>
      <Card className={cn('transition-colors hover:border-primary/40', due?.urgent && 'border-destructive/40 bg-destructive/5')}>
        <CardContent className="flex items-center gap-3 py-4">
          <span
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
              due?.urgent ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary',
            )}
          >
            {due?.urgent ? <AlertTriangle className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{item.title}</p>
            <p className="truncate text-sm text-muted-foreground">{item.detail}</p>
          </div>

          <div className="shrink-0 text-right">
            {/* The two things that decide whether this gets opened now. */}
            {item.atRisk !== null && item.atRisk > 0 && (
              <p className="text-sm font-bold">{money(item.atRisk)}</p>
            )}
            {due && (
              <p className={cn('text-xs font-medium', due.urgent ? 'text-destructive' : 'text-muted-foreground')}>
                {due.text}
              </p>
            )}
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Page() {
  return (
    <AuthGuard loginPath="/host/login">
      <HostInbox />
    </AuthGuard>
  );
}
