'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, ImagePlus, Loader2, Check, CheckCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const submit = () => {
    if (!text.trim()) return;
    send(text.trim());
    setText('');
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
    <Card className="flex h-[520px] flex-col">
      <CardHeader className="border-b border-border py-4">
        <CardTitle className="text-base">Messages</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 overflow-y-auto p-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && messages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            No messages yet. Say hello to coordinate your trip.
          </p>
        )}
        {messages.map((m) => {
          if (m.senderId === SYSTEM_SENDER) {
            return (
              <div key={m._id} className="flex justify-center">
                <span className="rounded-full bg-muted px-3 py-1 text-center text-xs text-muted-foreground">
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
                  'max-w-[75%] overflow-hidden rounded-2xl text-sm',
                  mine ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted text-foreground',
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
                {m.body && <p className="px-3.5 py-2">{m.body}</p>}
              </div>
              {/* Read receipt under my most recent message only. */}
              {mine && m._id === lastMineId && (
                <span className="mt-0.5 flex items-center gap-0.5 pr-1 text-[11px] text-muted-foreground">
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
      </CardContent>

      {/* Quick replies */}
      <div className="flex flex-wrap gap-1.5 border-t border-border px-3 pt-2.5">
        {QUICK_REPLIES.map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 p-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => sendPhoto(e.target.files)}
        />
        <Button
          size="icon"
          variant="ghost"
          aria-label="Send a photo"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        </Button>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Type a message…"
        />
        <Button size="icon" onClick={submit} aria-label="Send">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
