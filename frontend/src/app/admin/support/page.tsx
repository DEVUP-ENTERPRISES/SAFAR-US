'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, ArrowUpCircle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/utils/cn';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { StatTile } from '@/components/ui/stat-tile';
import { AlertTriangle, Clock, CheckCircle2 as OnTrack } from 'lucide-react';
import { adminApi } from '@/features/admin/api';

const PRIORITY_TONE: Record<string, 'destructive' | 'warning' | 'muted' | 'default'> = {
  urgent: 'destructive', high: 'warning', normal: 'default', low: 'muted',
};

export default function AdminSupportPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [reply, setReply] = useState('');

  // SLA health — computed from real ticket timestamps, refreshed live.
  const sla = useQuery({ queryKey: ['sla'], queryFn: () => adminApi.slaStats(), refetchInterval: 30_000 });

  const list = useQuery({
    queryKey: ['admin-tickets', status],
    queryFn: () => adminApi.tickets({ status: status || undefined }),
  });
  const ticket = useQuery({
    queryKey: ['admin-ticket', selected],
    queryFn: () => adminApi.ticket(selected!),
    enabled: !!selected,
    refetchInterval: selected ? 8000 : false, // live-ish thread
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-tickets'] });
    qc.invalidateQueries({ queryKey: ['admin-ticket', selected] });
  };
  const sendReply = useMutation({ mutationFn: () => adminApi.replyTicket(selected!, reply), onSuccess: () => { setReply(''); invalidate(); } });
  const escalate = useMutation({ mutationFn: () => adminApi.escalateTicket(selected!), onSuccess: invalidate });
  const resolve = useMutation({ mutationFn: () => adminApi.resolveTicket(selected!), onSuccess: invalidate });

  const doEscalate = async () => {
    const { ok } = await confirm({
      title: 'Escalate this ticket?',
      description: 'It is raised to urgent priority and routed to a senior agent.',
      confirmLabel: 'Escalate',
    });
    if (ok) escalate.mutate();
  };

  const doResolve = async () => {
    const { ok } = await confirm({
      title: 'Resolve this ticket?',
      description: 'The customer is told their issue is resolved and the thread is closed.',
      confirmLabel: 'Resolve ticket',
    });
    if (ok) resolve.mutate();
  };

  return (
    <div className="space-y-5">
      <h1 className="display text-display-sm">Support</h1>

      {/* SLA health — a breached queue should be impossible to miss. */}
      {sla.data && (
        <div className="grid gap-4 sm:grid-cols-4">
          <StatTile icon={<Clock className="h-5 w-5" />} label="Open tickets" value={sla.data.open} />
          <StatTile
            tone={sla.data.breached > 0 ? 'destructive' : 'success'}
            emphasis={sla.data.breached > 0}
            icon={<AlertTriangle className="h-5 w-5" />}
            label="SLA breached"
            value={sla.data.breached}
            sub={sla.data.breached > 0 ? 'Past due — act now' : 'None'}
          />
          <StatTile
            tone={sla.data.atRisk > 0 ? 'warning' : 'default'}
            emphasis={sla.data.atRisk > 0}
            icon={<Clock className="h-5 w-5" />}
            label="At risk"
            value={sla.data.atRisk}
            sub="Due within 2 hours"
          />
          <StatTile tone="success" icon={<OnTrack className="h-5 w-5" />} label="On track" value={sla.data.onTrack} />
        </div>
      )}

      {sla.data && sla.data.breachedTickets.length > 0 && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" /> {sla.data.breached} ticket(s) past their SLA
          </p>
          <div className="space-y-1">
            {sla.data.breachedTickets.slice(0, 5).map((t) => (
              <button
                key={t._id}
                onClick={() => setSelected(t._id)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-destructive/10"
              >
                <span className="truncate">
                  <span className="font-medium uppercase text-destructive">{t.priority}</span> · {t.subject}
                </span>
                <span className="shrink-0 font-mono text-xs text-destructive">{t.overdueHours}h over</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {['', 'open', 'pending', 'escalated', 'resolved'].map((s) => (
          <Chip key={s || 'all'} active={status === s} onClick={() => setStatus(s)} className="capitalize">{s || 'All'}</Chip>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Queue */}
        <div className="space-y-2">
          {list.isLoading && <Skeleton className="h-64 w-full" />}
          {list.data && list.data.length === 0 && <EmptyState title="No tickets" />}
          {list.data?.map((t: any) => (
            <button key={t._id} onClick={() => setSelected(t._id)} className="w-full text-left">
              <Card className={cn('transition-colors', selected === t._id && 'border-primary')}>
                <CardContent className="flex items-center justify-between pt-6">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.subject}</p>
                    <p className="text-xs capitalize text-muted-foreground">{t.category} · {t.status}</p>
                  </div>
                  <Badge tone={PRIORITY_TONE[t.priority] ?? 'muted'}>{t.priority}</Badge>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div>
          {!selected && <EmptyState title="Select a ticket" description="Open a ticket to view the conversation." />}
          {selected && ticket.data && (
            <Card className="flex h-[560px] flex-col">
              <CardHeader className="flex-row items-center justify-between border-b border-border py-4">
                <CardTitle className="text-base">{ticket.data.subject}</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" loading={escalate.isPending} onClick={doEscalate}><ArrowUpCircle className="h-4 w-4" /> Escalate</Button>
                  <Button size="sm" loading={resolve.isPending} onClick={doResolve}><CheckCircle2 className="h-4 w-4" /> Resolve</Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-3 overflow-y-auto p-4">
                {ticket.data.messages.map((m: any, i: number) => (
                  <div key={i} className={cn('rounded-lg p-3 text-sm', m.internal ? 'border border-dashed border-amber-400/50 bg-amber-500/5' : 'bg-muted')}>
                    {m.internal && <span className="mb-1 block text-[10px] font-semibold uppercase text-amber-600">Internal note</span>}
                    {m.body}
                  </div>
                ))}
              </CardContent>
              <div className="flex items-center gap-2 border-t border-border p-3">
                <Input value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && reply.trim() && sendReply.mutate()} placeholder="Reply to customer…" />
                <Button size="icon" disabled={!reply.trim()} loading={sendReply.isPending} onClick={() => sendReply.mutate()}><Send className="h-4 w-4" /></Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
