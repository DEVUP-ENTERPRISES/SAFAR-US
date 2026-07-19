'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Plus } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/utils/cn';
import { connectSocket } from '@/lib/realtime/socket';
import { supportApi } from '@/features/support/api';
import { useAuthStore } from '@/features/auth/store';

function Support() {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [reply, setReply] = useState('');

  const list = useQuery({ queryKey: ['my-tickets'], queryFn: () => supportApi.list() });
  const ticket = useQuery({
    queryKey: ['my-ticket', selected],
    queryFn: () => supportApi.get(selected!),
    enabled: !!selected,
  });

  // Live: refresh when an agent replies.
  useEffect(() => {
    const socket = connectSocket();
    const onMsg = () => {
      qc.invalidateQueries({ queryKey: ['my-ticket', selected] });
      qc.invalidateQueries({ queryKey: ['my-tickets'] });
    };
    socket.on('ticket:message', onMsg);
    return () => { socket.off('ticket:message', onMsg); };
  }, [qc, selected]);

  const create = useMutation({
    mutationFn: () => supportApi.create({ subject, body }),
    onSuccess: (t) => { setCreating(false); setSubject(''); setBody(''); setSelected(t._id); qc.invalidateQueries({ queryKey: ['my-tickets'] }); },
  });
  const sendReply = useMutation({
    mutationFn: () => supportApi.reply(selected!, reply),
    onSuccess: () => { setReply(''); qc.invalidateQueries({ queryKey: ['my-ticket', selected] }); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="display text-display-sm">Support</h1>
        <Button onClick={() => { setCreating(true); setSelected(null); }}><Plus className="h-4 w-4" /> New ticket</Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          {list.isLoading && <Skeleton className="h-40 w-full" />}
          {list.data && list.data.length === 0 && !creating && <EmptyState title="No tickets yet" description="Open a ticket and our team will help." />}
          {list.data?.map((t) => (
            <button key={t._id} onClick={() => { setSelected(t._id); setCreating(false); }} className="w-full text-left">
              <Card className={cn('transition-colors', selected === t._id && 'border-primary')}>
                <CardContent className="flex items-center justify-between pt-6">
                  <div className="min-w-0"><p className="truncate font-medium">{t.subject}</p><p className="text-xs capitalize text-muted-foreground">{t.status}</p></div>
                  <Badge tone={t.status === 'resolved' ? 'success' : 'muted'}>{t.priority}</Badge>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>

        <div>
          {creating && (
            <Card>
              <CardHeader><CardTitle>New ticket</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
                <Field label="How can we help?"><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></Field>
                <Button disabled={!subject || !body} loading={create.isPending} onClick={() => create.mutate()}>Submit</Button>
              </CardContent>
            </Card>
          )}
          {!creating && selected && ticket.data && (
            <Card className="flex h-[520px] flex-col">
              <CardHeader className="border-b border-border py-4"><CardTitle className="text-base">{ticket.data.subject}</CardTitle></CardHeader>
              <CardContent className="flex-1 space-y-3 overflow-y-auto p-4">
                {ticket.data.messages.map((m, i) => {
                  const mine = m.authorId === me?.id;
                  return (
                    <div key={i} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                      <div className={cn('max-w-[75%] rounded-2xl px-3.5 py-2 text-sm', mine ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted')}>{m.body}</div>
                    </div>
                  );
                })}
              </CardContent>
              {ticket.data.status !== 'resolved' && (
                <div className="flex items-center gap-2 border-t border-border p-3">
                  <Input value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && reply.trim() && sendReply.mutate()} placeholder="Reply…" />
                  <Button size="icon" disabled={!reply.trim()} loading={sendReply.isPending} onClick={() => sendReply.mutate()}><Send className="h-4 w-4" /></Button>
                </div>
              )}
            </Card>
          )}
          {!creating && !selected && <EmptyState title="Select a ticket" description="Or open a new one." />}
        </div>
      </div>
    </div>
  );
}

export default function SupportPage() {
  return <AuthGuard><Support /></AuthGuard>;
}
