'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, Check, MessageCircle, Phone, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuthStore } from '@/features/auth/store';
import { CONTACT } from '@/features/contact/content';
import { usePlatformConfig } from '@/features/platform/config';
import { supportApi, type Ticket } from '@/features/support/api';
import { ApiError } from '@/lib/api/types';
import { formatDateTime } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

const CATEGORY = 'asset_partner';
type View = 'menu' | 'chat' | 'meet';

/** Help on every partner screen: chat with CatoDrive, call the hotline, or set up a meeting. */
export function PartnerHelp() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('menu');
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  const userId = useAuthStore((s) => s.user?.id);
  const meetingUrl = usePlatformConfig().data?.assetPartner?.meetingUrl ?? null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setView('menu'); }}
        className={cn('fixed bottom-4 end-4 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', open && 'hidden')}
      >
        <MessageCircle className="h-4 w-4" aria-hidden /> Need help?
      </button>

      {open && (
        <div role="dialog" aria-modal="false" aria-label="Help from CatoDrive" className="fixed inset-x-2 bottom-2 z-50 flex max-h-[85vh] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl sm:inset-x-auto sm:end-4 sm:bottom-4 sm:w-[24rem]">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            {view !== 'menu' && (
              <button type="button" onClick={() => setView('menu')} aria-label="Back" className="grid h-8 w-8 place-items-center rounded-full hover:bg-accent"><ArrowLeft className="h-4 w-4" /></button>
            )}
            <p className="flex-1 font-semibold">{view === 'chat' ? 'Chat with CatoDrive' : view === 'meet' ? 'Schedule a meeting' : 'How can we help?'}</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full hover:bg-accent"><X className="h-4 w-4" /></button>
          </div>

          {view === 'menu' && (
            <div className="space-y-2 p-4">
              <p className="pb-1 text-sm text-muted-foreground">Real people on our partner team, 8 AM – 10 PM Central.</p>
              {signedIn && (
                <MenuItem icon={<MessageCircle className="h-5 w-5" />} title="Chat with CatoDrive" sub="Message us here. We reply in this window and by email." onClick={() => setView('chat')} />
              )}
              <a href={CONTACT.assetPartnerHotlineHref} className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:border-primary/40">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Phone className="h-5 w-5" /></span>
                <span className="min-w-0"><span className="block font-semibold">Call or text {CONTACT.assetPartnerHotlineDisplay}</span><span className="block text-sm text-muted-foreground">Talk to the partner team now.</span></span>
              </a>
              {meetingUrl ? (
                <a href={meetingUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:border-primary/40">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><CalendarClock className="h-5 w-5" /></span>
                  <span className="min-w-0"><span className="block font-semibold">Schedule a meeting</span><span className="block text-sm text-muted-foreground">Pick a time that suits you.</span></span>
                </a>
              ) : signedIn ? (
                <MenuItem icon={<CalendarClock className="h-5 w-5" />} title="Schedule a meeting" sub="Phone, video or in person. We confirm by email." onClick={() => setView('meet')} />
              ) : null}
            </div>
          )}
          {view === 'chat' && userId && <Chat userId={userId} />}
          {view === 'meet' && <MeetingRequest onDone={() => setView('chat')} />}
        </div>
      )}
    </>
  );
}

function MenuItem({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-start transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      <span className="min-w-0"><span className="block font-semibold">{title}</span><span className="block text-sm text-muted-foreground">{sub}</span></span>
    </button>
  );
}

/** The partner's open help conversation, newest first; resolved ones start a fresh thread. */
function useConversation() {
  const tickets = useQuery({ queryKey: ['partner-help'], queryFn: () => supportApi.list(), refetchInterval: 8_000 });
  const open = (tickets.data ?? []).find((t) => t.category === CATEGORY && !['resolved', 'closed'].includes(t.status));
  return { tickets, open };
}

function Chat({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { tickets, open } = useConversation();
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const messages = (open?.messages ?? []).filter((m) => !m.internal);

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  const send = useMutation({
    meta: { silentError: true },
    mutationFn: (body: string): Promise<Ticket> => (open ? supportApi.reply(open._id, body) : supportApi.create({ subject: 'Partner question', body, category: CATEGORY })),
    onSuccess: () => { setText(''); void qc.invalidateQueries({ queryKey: ['partner-help'] }); },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-[14rem] flex-1 space-y-2 overflow-y-auto p-4" aria-live="polite">
        {tickets.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : tickets.isError ? (
          <p role="alert" className="text-sm text-destructive">We couldn’t load your messages. <button type="button" className="font-semibold underline" onClick={() => void tickets.refetch()}>Try again</button></p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ask anything about your application, car, documents or payouts. The partner team replies here and by email.</p>
        ) : (
          messages.map((m, i) => {
            const mine = m.authorId === userId;
            return (
              <div key={i} className={cn('max-w-[85%] rounded-lg px-3 py-2 text-sm', mine ? 'ms-auto bg-primary text-primary-foreground' : 'bg-subtle')}>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={cn('mt-1 text-xs', mine ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{mine ? 'You' : 'CatoDrive'} · {formatDateTime(m.at)}</p>
              </div>
            );
          })
        )}
        <div ref={end} />
      </div>
      <form
        className="flex items-end gap-2 border-t border-border p-3"
        onSubmit={(e) => { e.preventDefault(); if (text.trim()) send.mutate(text.trim()); }}
      >
        <Textarea aria-label="Your message" rows={2} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} className="min-h-0 flex-1 resize-none"
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (text.trim()) send.mutate(text.trim()); } }} />
        <Button type="submit" size="sm" aria-label="Send" disabled={!text.trim()} loading={send.isPending}><Send className="h-4 w-4" /></Button>
      </form>
      {send.isError && <p role="alert" className="px-3 pb-3 text-sm text-destructive">{send.error instanceof ApiError ? send.error.message : 'That didn’t send. Try again.'}</p>}
    </div>
  );
}

const WINDOWS = ['Morning (9 AM – 12 PM)', 'Afternoon (12 – 4 PM)', 'Evening (4 – 7 PM)'];
const HOW = ['Phone call', 'Video call', 'In person'];

function MeetingRequest({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { open } = useConversation();
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const [day, setDay] = useState(tomorrow);
  const [slot, setSlot] = useState(WINDOWS[0]);
  const [how, setHow] = useState(HOW[0]);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  const request = useMutation({
    meta: { silentError: true },
    mutationFn: () => {
      const when = new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      const body = `Meeting request: ${how}, ${when}, ${slot} Central.${note.trim() ? `\n${note.trim()}` : ''}`;
      return open ? supportApi.reply(open._id, body) : supportApi.create({ subject: 'Meeting request', body, category: CATEGORY });
    },
    onSuccess: () => { setSent(true); void qc.invalidateQueries({ queryKey: ['partner-help'] }); },
  });

  if (sent) {
    return (
      <div className="space-y-3 p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold text-success"><Check className="h-4 w-4" /> Request sent</p>
        <p className="text-muted-foreground">We’ll confirm the time by email and in your chat.</p>
        <Button size="sm" variant="outline" onClick={onDone}>Open chat</Button>
      </div>
    );
  }

  return (
    <form className="space-y-3 overflow-y-auto p-4" onSubmit={(e) => { e.preventDefault(); request.mutate(); }}>
      <Field label="Day" htmlFor="meet-day"><Input id="meet-day" type="date" min={tomorrow} value={day} onChange={(e) => setDay(e.target.value)} required /></Field>
      <Field label="Time" htmlFor="meet-time"><Select id="meet-time" value={slot} onChange={(e) => setSlot(e.target.value)}>{WINDOWS.map((w) => <option key={w}>{w}</option>)}</Select></Field>
      <Field label="How" htmlFor="meet-how"><Select id="meet-how" value={how} onChange={(e) => setHow(e.target.value)}>{HOW.map((h) => <option key={h}>{h}</option>)}</Select></Field>
      <Field label="What would you like to talk about? (optional)" htmlFor="meet-note"><Textarea id="meet-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {request.isError && <p role="alert" className="text-sm text-destructive">{request.error instanceof ApiError ? request.error.message : 'That didn’t send. Try again.'}</p>}
      <Button type="submit" className="w-full" disabled={!day} loading={request.isPending}>Request meeting</Button>
    </form>
  );
}
