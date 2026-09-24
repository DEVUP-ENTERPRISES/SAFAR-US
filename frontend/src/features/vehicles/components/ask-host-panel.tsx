'use client';

import { useState } from 'react';
import { MessageCircleQuestion, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/features/auth/store';
import { useVehicleInquiry } from '@/features/messaging/inquiry-hooks';
import { SYSTEM_SENDER } from '@/features/messaging/hooks';

/**
 * Pre-booking "Ask the host a question" — the thing Turo has and we didn't:
 * a prospective guest can message a host before reserving, without a
 * booking existing yet. Deliberately lighter than the trip ChatPanel (no
 * attachments, no read receipts, no realtime) — a booking's chat carries an
 * active trip; a listing inquiry is a handful of messages before a decision.
 */
export function AskHostPanel({ vehicleId, hostName }: { vehicleId: string; hostName: string }) {
  const me = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const { messages, isLoading, send } = useVehicleInquiry(vehicleId, me?.id);

  if (!me) {
    return (
      <p className="text-sm text-muted-foreground">
        <a href="/login" className="font-medium text-primary hover:underline">Sign in</a> to ask {hostName} a question.
      </p>
    );
  }

  const submit = async () => {
    if (!text.trim()) return;
    const body = text.trim();
    setText('');
    await send(body);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-start"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <MessageCircleQuestion className="h-4 w-4 text-primary" />
          Ask {hostName} a question
        </span>
        <span className="text-xs text-muted-foreground">{open ? 'Hide' : messages.length > 0 ? `${messages.length} message${messages.length === 1 ? '' : 's'}` : 'Before you book'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {!isLoading && messages.length > 0 && (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {messages.map((m) => {
                if (m.senderId === SYSTEM_SENDER) return null;
                const mine = m.senderId === me.id;
                return (
                  <div key={m._id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                        mine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted text-foreground',
                      )}
                    >
                      {m.body}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={`e.g. "Does this come with a car seat?"`}
              rows={2}
              className="flex-1 resize-none"
            />
            <Button size="icon" disabled={!text.trim()} onClick={submit} aria-label="Send">
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {hostName} usually replies within a few hours. You won't be charged until you book.
          </p>
        </div>
      )}
    </div>
  );
}
