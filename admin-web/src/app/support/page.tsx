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
import { EmptyState, ErrorState } from '@/components/ui/states';
import { cn } from '@/lib/utils/cn';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { StatTile } from '@/components/ui/stat-tile';
import { AlertTriangle, Clock, CheckCircle2 as OnTrack } from 'lucide-react';
import { adminApi } from '@/features/admin/api';
import Link from 'next/link';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { PageHeader } from '@/components/ui/page-header';

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
      <PageHeader eyebrow="Help & safety" title="Support tickets" description="Questions and problems from guests and hosts, and how fast they are being answered." />

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
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" /> {sla.data.breached} ticket(s) past their SLA
          </p>
          <div className="space-y-1">
            {sla.data.breachedTickets.slice(0, 5).map((t) => (
              <button
                key={t._id}
                onClick={() => setSelected(t._id)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-start text-sm transition-colors hover:bg-destructive/10"
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
          {list.isError && <ErrorState message="We couldn’t load tickets." retry={() => void list.refetch()} />}
          {list.data && list.data.length === 0 && <EmptyState title="No tickets" />}
          {list.data?.map((t: any) => (
            <button key={t._id} onClick={() => setSelected(t._id)} className="w-full text-start">
              <Card className={cn('transition-colors', selected === t._id && 'border-primary')}>
                <CardContent className="flex items-center justify-between pt-6">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.subject}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{t.requester?.name ?? 'Unknown account'}</span> · {KIND_LABEL[t.requester?.kind as keyof typeof KIND_LABEL] ?? 'Customer'} · <span className="capitalize">{t.category} · {t.status}</span>
                    </p>
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
              <CardHeader className="flex-col gap-2 border-b border-border py-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">{ticket.data.subject}</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" loading={escalate.isPending} onClick={doEscalate}><ArrowUpCircle className="h-4 w-4" /> Escalate</Button>
                  <Button size="sm" loading={resolve.isPending} onClick={doResolve}><CheckCircle2 className="h-4 w-4" /> Resolve</Button>
                </div>
              </CardHeader>
              <Requester t={ticket.data} />
              <CardContent className="flex-1 space-y-3 overflow-y-auto p-4">
                {ticket.data.messages.map((m: any, i: number) => (
                  <div key={i} className={cn('rounded-lg p-3 text-sm', m.internal ? 'border border-dashed border-warning/50 bg-warning/5' : m.author?.fromCustomer ? 'bg-muted' : 'ms-8 bg-primary/10')}>
                    <span className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                      <span className="font-semibold">{m.internal ? `Internal note · ${m.author?.name ?? 'Staff'}` : m.author?.fromCustomer ? m.author.name : `${m.author?.name ?? 'Support'} (CatoDrive)`}</span>
                      {m.at && <span className="text-muted-foreground">{formatDateTime(m.at)}</span>}
                    </span>
                    {m.body}
                  </div>
                ))}
              </CardContent>
              <div className="flex items-center gap-2 border-t border-border p-3">
                <Input value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && reply.trim() && sendReply.mutate()} placeholder="Reply to customer…" />
                <Button size="icon-lg" disabled={!reply.trim()} loading={sendReply.isPending} onClick={() => sendReply.mutate()}><Send className="h-4 w-4" /></Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

const KIND_LABEL = { guest: 'Guest', host: 'Host', asset_partner: 'Asset Partner', staff: 'Staff' } as const;
const ID_LABEL = { verified: 'ID verified', pending: 'ID check in progress', not_verified: 'ID not verified' } as const;

/** Who opened the ticket and how to reach them, above the conversation. */
function Requester({ t }: { t: any }) {
  const r = t.requester;
  if (!r) return null;
  return (
    <div className="space-y-1 border-b border-border bg-subtle px-4 py-3 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{r.name}</span>
        <Badge tone="muted">{KIND_LABEL[r.kind as keyof typeof KIND_LABEL] ?? 'Customer'}</Badge>
        {r.identity && <Badge tone={r.identity === 'verified' ? 'success' : 'warning'}>{ID_LABEL[r.identity as keyof typeof ID_LABEL]}</Badge>}
        {r.accountStatus && r.accountStatus !== 'active' && <Badge tone="destructive">{r.accountStatus.replace('_', ' ')}</Badge>}
      </p>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {r.contact?.email && <a className="text-primary hover:underline" href={`mailto:${r.contact.email}`}>{r.contact.email}</a>}
        {r.contact?.phone && <a className="text-primary hover:underline" href={`tel:${r.contact.phone}`}>{r.contact.phone}</a>}
        {r.memberSince && <span>Member since {formatDate(r.memberSince)}</span>}
        {r.trips && <span className="tabular-nums">{r.trips.completed} trip{r.trips.completed === 1 ? '' : 's'} completed</span>}
        <Link className="text-primary hover:underline" href={`/users?q=${encodeURIComponent(r.contact?.email ?? r.id)}`}>Open account</Link>
        {t.booking && <Link className="text-primary hover:underline" href={`/bookings/${t.booking.id}`}>Booking {t.booking.code}</Link>}
      </p>
    </div>
  );
}
