'use client';

import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/features/auth/store';
import { useMessages } from './hooks';

export function ChatPanel({ bookingId }: { bookingId: string }) {
  const me = useAuthStore((s) => s.user);
  const { messages, isLoading, send } = useMessages(bookingId);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const submit = () => {
    if (!text.trim()) return;
    send(text.trim());
    setText('');
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
          const mine = m.senderId === me?.id;
          return (
            <div key={m._id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm',
                  mine
                    ? 'rounded-br-sm bg-primary text-primary-foreground'
                    : 'rounded-bl-sm bg-muted text-foreground',
                )}
              >
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </CardContent>
      <div className="flex items-center gap-2 border-t border-border p-3">
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
