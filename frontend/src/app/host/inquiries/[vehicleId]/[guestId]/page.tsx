'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Send } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/features/auth/store';
import { useInquiryThread } from '@/features/messaging/inquiry-hooks';

function InquiryThreadScreen() {
  const { vehicleId, guestId } = useParams<{ vehicleId: string; guestId: string }>();
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const { messages, isLoading, send, markRead } = useInquiryThread(vehicleId, guestId);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId, guestId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const submit = async () => {
    if (!text.trim()) return;
    const body = text.trim();
    setText('');
    await send(body);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-6">
      <button onClick={() => router.push('/host/inbox')} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All questions
      </button>

      <Card className="flex h-[70vh] max-h-[560px] flex-col overflow-hidden">
        <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            messages.map((m) => {
              const mine = m.senderId === me?.id;
              return (
                <div key={m._id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[80%] rounded-2xl px-3.5 py-2 text-[14.5px]',
                      mine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted text-foreground',
                    )}
                  >
                    {m.body}
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        <div className="flex items-end gap-2 border-t border-border p-3">
          <textarea
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Reply…"
            className="min-w-0 max-h-32 flex-1 resize-none rounded-2xl border border-border bg-background px-3.5 py-2 text-[14.5px] outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={submit}
            disabled={!text.trim()}
            aria-label="Send"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
          >
            <Send className="h-[18px] w-[18px]" />
          </button>
        </div>
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <AuthGuard loginPath="/host/login">
      <InquiryThreadScreen />
    </AuthGuard>
  );
}
