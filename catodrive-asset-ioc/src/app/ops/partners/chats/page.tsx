'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, MessageCircle, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { partnerManageApi, type PartnerChat } from '@/features/asset-partners/manage-api';
import { ApiError } from '@/lib/api/types';
import { formatDateTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { PartnersNav } from '~/features/partners/partners-nav';

const manage = partnerManageApi('/ioc');
const isMeeting = (subject: string) => subject.toLowerCase().startsWith('meeting');

function Thread({ id }: { id: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const q = useQuery({ queryKey: ['partner-chat', id], queryFn: () => manage.partnerChat(id), refetchInterval: 10_000 });
  const messages = (q.data?.messages ?? []).filter((m) => !m.internal);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  const refresh = () => { void qc.invalidateQueries({ queryKey: ['partner-chat', id] }); void qc.invalidateQueries({ queryKey: ['partner-chats'] }); };
  const reply = useMutation({ meta: { silentError: true }, mutationFn: (body: string) => manage.replyPartnerChat(id, body), onSuccess: () => { setText(''); refresh(); } });
  const resolve = useMutation({ meta: { silentError: true }, mutationFn: () => manage.resolvePartnerChat(id), onSuccess: () => { toast({ tone: 'success', title: 'Marked as done' }); refresh(); } });

  if (q.isLoading) return <Skeleton className="h-96 w-full rounded-lg" />;
  if (q.isError || !q.data) return <ErrorState message="We couldn’t load this conversation." retry={() => void q.refetch()} />;
  const c = q.data;
  const done = ['resolved', 'closed'].includes(c.status);

  return (
    <Card className="flex min-h-[28rem] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{c.requester.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[c.requester.email, c.requester.phone].filter(Boolean).join(' · ')}
            {c.partnerId && <> · <Link href={`/ops/partners/members/${c.partnerId}`} className="text-primary hover:underline">Partner page</Link></>}
          </p>
        </div>
        {done ? <Badge tone="muted">Done</Badge> : <Button size="sm" variant="outline" loading={resolve.isPending} onClick={() => resolve.mutate()}><CheckCircle2 className="h-4 w-4" /> Mark done</Button>}
      </div>
      <div className="max-h-[60vh] min-h-0 flex-1 space-y-2 overflow-y-auto p-4" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={cn('max-w-[85%] rounded-lg px-3 py-2 text-sm', m.author.fromCustomer ? 'bg-subtle' : 'ms-auto bg-primary text-primary-foreground')}>
            <p className="whitespace-pre-wrap break-words">{m.body}</p>
            <p className={cn('mt-1 text-xs', m.author.fromCustomer ? 'text-muted-foreground' : 'text-primary-foreground/70')}>{m.author.name} · {formatDateTime(m.at)}</p>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="flex items-end gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) reply.mutate(text.trim()); }}>
        <Textarea aria-label="Reply" rows={2} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} className="min-h-0 flex-1 resize-none"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (text.trim()) reply.mutate(text.trim()); } }} />
        <Button type="submit" size="sm" aria-label="Send reply" disabled={!text.trim()} loading={reply.isPending}><Send className="h-4 w-4" /></Button>
      </form>
      {(reply.isError || resolve.isError) && <p role="alert" className="px-3 pb-3 text-sm text-destructive">{(reply.error ?? resolve.error) instanceof ApiError ? (reply.error ?? resolve.error)!.message : 'That didn’t go through. Try again.'}</p>}
      <p className="px-4 pb-3 text-xs text-muted-foreground">The partner sees your reply in their chat and gets an email.</p>
    </Card>
  );
}

function ChatsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get('open');
  const [open, setOpen] = useState(true);
  const list = useQuery({ queryKey: ['partner-chats', open], queryFn: () => manage.partnerChats({ open, limit: 50 }), refetchInterval: 15_000 });
  const pick = (id: string) => router.replace(`/ops/partners/chats?open=${id}`, { scroll: false });

  return (
    <div className="space-y-5">
      <PageHeader title="Partner chats" description="Questions and meeting requests from partners and applicants." />
      <PartnersNav />
      <div className="flex gap-2">
        <Chip active={open} onClick={() => setOpen(true)}>Open</Chip>
        <Chip active={!open} onClick={() => setOpen(false)}>Done</Chip>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[22rem_1fr]">
        <div className="min-w-0">
          {list.isLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
          ) : list.isError ? (
            <ErrorState message="We couldn’t load partner chats." retry={() => void list.refetch()} />
          ) : !list.data?.length ? (
            <EmptyState icon={<MessageCircle className="h-8 w-8" />} title={open ? 'No open chats' : 'Nothing marked done yet'} description={open ? 'When a partner writes or asks for a meeting, it shows up here and you get an alert.' : 'Chats you mark done move here.'} />
          ) : (
            <ul className="space-y-2">
              {list.data.map((c: PartnerChat) => (
                <li key={c._id}>
                  <button type="button" onClick={() => pick(c._id)} className={cn('w-full rounded-lg border p-3 text-start transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', selected === c._id ? 'border-primary bg-primary/5' : 'border-border')}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{c.requester.name}</span>
                      {isMeeting(c.subject) && <Badge tone="warning"><CalendarClock className="me-1 h-3 w-3" />Meeting</Badge>}
                    </span>
                    {c.lastMessage && <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">{c.lastMessage.fromPartner ? '' : 'You: '}{c.lastMessage.body}</span>}
                    <span className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{c.lastMessage ? formatDateTime(c.lastMessage.at) : ''}</span>
                      {c.lastMessage?.fromPartner && open && <span className="font-semibold text-warning">Waiting for reply</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="min-w-0">
          {selected ? <Thread id={selected} /> : <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">Pick a conversation to read and reply.</CardContent></Card>}
        </div>
      </div>
    </div>
  );
}

export default function PartnerChatsPage() {
  return (
    <Suspense>
      <ChatsInner />
    </Suspense>
  );
}
