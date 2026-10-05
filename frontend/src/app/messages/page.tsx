'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, MessageSquare } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/utils/cn';
import { ChatPanel } from '@/features/messaging/chat-panel';
import { useConversations, type Conversation } from '@/features/messaging/hooks';

// ── Height token ─────────────────────────────────────────────────────────────
// The main chrome applies pt-24 and pb-8. The remaining viewport height
// available to this layout is 100dvh - 24px toolbar (navbar top-4 + h-14) = ~88px
// Simplified: 100dvh minus the app chrome's top padding.
const PANEL_H = 'h-[calc(100dvh-8rem)]';

// ── Inbox ─────────────────────────────────────────────────────────────────────

function Inbox() {
  const conversations = useConversations();
  const [selected, setSelected] = useState<Conversation | null>(null);

  return (
    <div className="-mt-6 flex flex-col sm:-mt-8">

      {/* Page title — only visible when no thread is open on mobile */}
      <div className={cn('mb-4 sm:mb-6', selected && 'hidden sm:block')}>
        <h1 className="display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Messages
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
          Every conversation with your hosts and guests, in one place.
        </p>
      </div>

      {/* Two-column grid that fills the viewport */}
      <div className={cn('grid overflow-hidden rounded-2xl border border-border bg-card shadow-sm sm:grid-cols-[minmax(0,320px)_minmax(0,1fr)]', PANEL_H)}>

        {/* ── Conversation list ── */}
        <aside className={cn(
          'flex flex-col overflow-hidden border-border sm:border-r',
          selected ? 'hidden sm:flex' : 'flex',
        )}>
          {/* List header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
            <p className="text-sm font-semibold text-foreground">Inbox</p>
            {(conversations.data?.length ?? 0) > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {conversations.data!.reduce((n, c) => n + (c.unread ?? 0), 0) || conversations.data!.length}
              </span>
            )}
          </div>

          {/* Conversation rows */}
          <div className="flex-1 overflow-y-auto">
            {conversations.isLoading ? (
              <div className="space-y-px p-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl p-3">
                    <Skeleton className="h-11 w-11 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-2/3" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (conversations.data?.length ?? 0) === 0 ? (
              <div className="flex h-full items-center justify-center p-6">
                <EmptyState
                  icon={<MessageSquare className="h-8 w-8" />}
                  title="No messages yet"
                  description="When you book a car or someone books yours, your conversation shows up here."
                />
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {conversations.data!.map((c) => (
                  <li key={c.bookingId}>
                    <button
                      onClick={() => setSelected(c)}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-3.5 text-start transition-colors hover:bg-muted/50',
                        selected?.bookingId === c.bookingId && 'bg-primary/5 border-s-2 border-primary',
                      )}
                    >
                      <Avatar name={c.counterpart.name} url={c.counterpart.avatar} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn('truncate text-sm font-semibold', c.unread > 0 ? 'text-foreground' : 'text-foreground/80')}>
                            {c.counterpart.name}
                          </p>
                          <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(c.last.at)}</span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{c.vehicle.title}</p>
                        <p className={cn('mt-0.5 truncate text-xs', c.unread > 0 ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                          {c.last.fromMe && 'You: '}
                          {c.last.system && !c.last.preview ? 'Trip update' : c.last.preview || '—'}
                        </p>
                      </div>
                      {c.unread > 0 && (
                        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                          {c.unread > 9 ? '9+' : c.unread}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* ── Thread panel ── */}
        <div className={cn(
          'flex flex-col overflow-hidden',
          !selected ? 'hidden sm:flex' : 'flex',
        )}>
          {selected ? (
            <>
              {/* Thread header */}
              <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
                {/* Back button — mobile only */}
                <button
                  onClick={() => setSelected(null)}
                  className="sm:hidden -ms-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>

                <Avatar name={selected.counterpart.name} url={selected.counterpart.avatar} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{selected.counterpart.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{selected.vehicle.title}</p>
                </div>

                <Link
                  href={`/trips/${selected.bookingId}`}
                  className="ms-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                  View trip <ExternalLink className="h-3 w-3" />
                </Link>
              </div>

              {/* Chat */}
              <div className="flex-1 overflow-hidden">
                <ChatPanel bookingId={selected.bookingId} />
              </div>
            </>
          ) : (
            /* Empty right panel — only visible on desktop */
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                <MessageSquare className="h-7 w-7 text-muted-foreground" />
              </span>
              <p className="text-base font-semibold text-foreground">No conversation selected</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Pick a conversation from the list to read and reply.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Avatar({ name, url }: { name: string; url?: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-border"
      />
    );
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

// ── Export ────────────────────────────────────────────────────────────────────

export default function Page() {
  return (
    <AuthGuard>
      <Inbox />
    </AuthGuard>
  );
}
