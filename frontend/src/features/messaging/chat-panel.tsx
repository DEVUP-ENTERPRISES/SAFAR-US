'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, ImagePlus, Loader2, Check, CheckCheck, MessagesSquare } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Logo } from '@/components/layout/logo';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/features/auth/store';
import { useToast } from '@/components/ui/toast';
import { uploadFiles } from '@/features/media/upload';
import { useMessages, SYSTEM_SENDER } from './hooks';

/** Canned openers so coordinating a trip is one tap, not a paragraph. */
const QUICK_REPLIES = [
  'On my way 👍',
  'Running a few minutes late',
  'Where should I park?',
  'Thanks!',
  'Sounds good',
];

export function ChatPanel({ bookingId }: { bookingId: string }) {
  const me = useAuthStore((s) => s.user);
  const notify = useToast();
  const { messages, isLoading, send, seenByCounterpart, lastMineId } = useMessages(bookingId, me?.id);
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Grow the input with its content, up to a cap — the WhatsApp behaviour, so a
  // long message wraps and pushes the box up instead of scrolling a one-liner.
  const grow = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  };

  const submit = () => {
    if (!text.trim()) return;
    send(text.trim());
    setText('');
    requestAnimationFrame(() => {
      if (taRef.current) taRef.current.style.height = 'auto';
    });
  };

  const sendPhoto = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const [uploaded] = await uploadFiles('message', [file]);
      send('', [{ url: uploaded.url, kind: 'image' }]);
    } catch (err) {
      notify({ tone: 'error', title: 'Couldn’t send photo', description: err instanceof Error ? err.message : 'Try again.' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Card className="flex h-[70vh] max-h-[560px] min-h-[420px] flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary">
          <MessagesSquare className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-bold leading-tight">Messages</p>
          <p className="text-[11px] text-muted-foreground">Private to this trip</p>
        </div>
      </div>

      {/* Thread */}
      <div className="relative flex-1 overflow-y-auto">
        {/* Chat "wallpaper": a faint brand mark so a sparse thread isn't a void. */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center opacity-[0.035]">
          <Logo className="h-40 w-40" />
        </div>

        <div className="relative space-y-2.5 p-4">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

          {!isLoading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-muted">
                <MessagesSquare className="h-7 w-7 text-muted-foreground" />
              </span>
              <p className="mt-1 text-sm font-semibold text-foreground">Start the conversation</p>
              <p className="max-w-[15rem] text-xs leading-relaxed text-muted-foreground">
                Coordinate pickup, drop-off and anything else. Messages stay private between you two on CatoDrive.
              </p>
            </div>
          )}

          {messages.map((m) => {
            if (m.senderId === SYSTEM_SENDER) {
              return (
                <div key={m._id} className="flex justify-center py-1">
                  <span className="rounded-full bg-muted/80 px-3 py-1 text-center text-[11px] font-medium text-muted-foreground backdrop-blur">
                    {m.body}
                  </span>
                </div>
              );
            }
            const mine = m.senderId === me?.id;
            return (
              <div key={m._id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
                <div
                  className={cn(
                    'max-w-[80%] overflow-hidden rounded-2xl text-[14.5px] shadow-sm',
                    mine
                      ? 'rounded-br-md bg-primary text-primary-foreground'
                      : 'rounded-bl-md bg-card text-foreground ring-1 ring-border',
                  )}
                >
                  {m.attachments?.map((a, i) =>
                    a.kind === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a key={i} href={a.url} target="_blank" rel="noreferrer">
                        <img src={a.url} alt={a.name ?? 'shared photo'} className="max-h-64 w-full object-cover" />
                      </a>
                    ) : (
                      <a key={i} href={a.url} target="_blank" rel="noreferrer" className="block px-3.5 py-2 underline">
                        {a.name ?? 'Attachment'}
                      </a>
                    ),
                  )}
                  {m.body && <p className="whitespace-pre-wrap break-words px-3.5 py-2 leading-snug">{m.body}</p>}
                </div>
                {mine && m._id === lastMineId && (
                  <span className="mt-0.5 flex items-center gap-0.5 pe-1 text-[11px] text-muted-foreground">
                    {seenByCounterpart ? (
                      <><CheckCheck className="h-3 w-3 text-primary" /> Seen</>
                    ) : (
                      <><Check className="h-3 w-3" /> Sent</>
                    )}
                  </span>
                )}
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      </div>

      {/* Quick replies */}
      <div className="hide-scrollbar flex gap-1.5 overflow-x-auto border-t border-border px-3 pt-2.5">
        {QUICK_REPLIES.map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            className="shrink-0 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Composer — a WhatsApp-style pill that grows, plus a round send button. */}
      <div className="flex items-end gap-2 p-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => sendPhoto(e.target.files)}
        />
        <div className="flex flex-1 items-end gap-1 rounded-[1.4rem] border border-border bg-background ps-1.5 pe-2">
          <button
            aria-label="Send a photo"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          </button>
          <textarea
            ref={taRef}
            rows={1}
            value={text}
            onChange={(e) => { setText(e.target.value); grow(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Message on CatoDrive…"
            className="max-h-32 min-h-[2.25rem] flex-1 resize-none bg-transparent py-2 text-[14.5px] leading-snug outline-none placeholder:text-muted-foreground"
          />
        </div>
        <button
          onClick={submit}
          disabled={!text.trim()}
          aria-label="Send"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-40"
        >
          <Send className="h-[18px] w-[18px]" />
        </button>
      </div>
    </Card>
  );
}
