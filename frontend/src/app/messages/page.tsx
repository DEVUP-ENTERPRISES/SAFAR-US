'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MessageSquare, ExternalLink } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils/cn';
import { ChatPanel } from '@/features/messaging/chat-panel';
import { useConversations, type Conversation } from '@/features/messaging/hooks';

function Inbox() {
  const conversations = useConversations();
  const [selected, setSelected] = useState<Conversation | null>(null);

  return (
    <div className="mx-auto max-w-5xl py-6">
      <PageHeader title="Messages" description="Every conversation with your hosts and guests, in one place." />

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
        {/* Conversation list — hidden on mobile once a chat is open */}
        <div className={cn('space-y-2', selected && 'hidden lg:block')}>
          {conversations.isLoading ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)
          ) : (conversations.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-8 w-8" />}
              title="No messages yet"
              description="When you book a car or someone books yours, your conversation shows up here."
            />
          ) : (
            conversations.data!.map((c) => (
              <button key={c.bookingId} onClick={() => setSelected(c)} className="w-full text-start">
                <Card
                  className={cn(
                    'flex items-center gap-3 p-3 transition-colors hover:border-primary/40',
                    selected?.bookingId === c.bookingId && 'border-primary',
                  )}
                >
                  <Avatar name={c.counterpart.name} url={c.counterpart.avatar} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-semibold">{c.counterpart.name}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(c.last.at)}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{c.vehicle.title}</p>
                    <p className={cn('truncate text-sm', c.unread > 0 ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                      {c.last.fromMe && 'You: '}{c.last.system && !c.last.preview ? 'Trip update' : c.last.preview || '—'}
                    </p>
                  </div>
                  {c.unread > 0 && (
                    <span className="ms-1 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                      {c.unread}
                    </span>
                  )}
                </Card>
              </button>
            ))
          )}
        </div>

        {/* Selected conversation */}
        <div className={cn(!selected && 'hidden lg:flex')}>
          {selected ? (
            <div className="flex w-full flex-col">
              <div className="mb-3 flex items-center justify-between gap-2">
                <button onClick={() => setSelected(null)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground lg:hidden">
                  <ArrowLeft className="h-4 w-4" /> All messages
                </button>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{selected.counterpart.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{selected.vehicle.title}</p>
                </div>
                <Link href={`/trips/${selected.bookingId}`} className="ms-auto inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                  Trip <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
              <ChatPanel bookingId={selected.bookingId} />
            </div>
          ) : (
            <div className="hidden h-full items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground lg:flex">
              Select a conversation to read and reply
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Avatar({ name, url }: { name: string; url?: string }) {
  if (url) return <img src={url} alt={name} className="h-11 w-11 shrink-0 rounded-full object-cover" />;
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

export default function Page() {
  return (
    <AuthGuard>
      <Inbox />
    </AuthGuard>
  );
}
