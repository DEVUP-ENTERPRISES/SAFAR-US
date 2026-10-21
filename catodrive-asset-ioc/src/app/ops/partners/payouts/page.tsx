'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CheckCircle2, Clock, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { StatTile } from '@/components/ui/stat-tile';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { partnerManageApi, type PayoutRow } from '@/features/asset-partners/manage-api';
import { ApiError } from '@/lib/api/types';
import { formatDate, formatMoney } from '@/lib/utils/format';
import { PartnersNav } from '~/features/partners/partners-nav';
import { MonthSelect, monthOptions } from '~/features/partners/month-select';

const manage = partnerManageApi('/ioc');
const usd = (amount: number) => formatMoney({ amount, currency: 'USD' });

function RecordForm({ row, period, onDone }: { row: PayoutRow; period: string; onDone: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState((row.net / 100).toFixed(2));
  const [reference, setReference] = useState('');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const record = useMutation({
    meta: { silentError: true },
    mutationFn: () => manage.recordPayout({ partnerId: row.partnerId, period, amount: Math.round(Number(amount) * 100), method: row.method, reference: reference.trim(), paidAt }),
    onSuccess: () => {
      toast({ tone: 'success', title: `Payment to ${row.displayName} recorded`, description: 'They’ve been told it’s on its way.' });
      onDone();
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not record it' }),
  });
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl bg-muted/40 p-3 sm:grid-cols-[8rem_1fr_10rem_auto] sm:items-end">
      <Field label="Amount ($)"><Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label={row.method === 'zelle' ? 'Zelle confirmation' : 'Check number'}><Input value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} /></Field>
      <Field label="Paid on"><Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></Field>
      <Button disabled={!reference.trim() || !(Number(amount) > 0)} loading={record.isPending} onClick={() => record.mutate()}>Save</Button>
    </div>
  );
}

export default function PartnerPayoutsPage() {
  const months = useMemo(() => monthOptions(12, false), []);
  const [period, setPeriod] = useState(months[0].value);
  const [open, setOpen] = useState<string | null>(null);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const q = useQuery({ queryKey: ['ioc-partner-payouts', period], queryFn: () => manage.payouts(period) });
  const refresh = () => { setOpen(null); void qc.invalidateQueries({ queryKey: ['ioc-partner-payouts', period] }); };

  const undo = useMutation({
    meta: { silentError: true },
    mutationFn: (payoutId: string) => manage.removePayout(payoutId),
    onSuccess: refresh,
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not undo it' }),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Asset management"
        title="Payouts"
        description="What each partner earned in a finished month, where to send it, and a record of every payment. Partners are told when you record one."
        actions={<MonthSelect months={months} value={period} onChange={(v) => { setPeriod(v); setOpen(null); }} />}
      />
      <PartnersNav />

      {q.isLoading ? (
        <Skeleton className="h-72 w-full rounded-2xl" />
      ) : q.isError || !q.data ? (
        <ErrorState message="We couldn’t load this month." retry={() => q.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile icon={<Banknote className="h-5 w-5" />} label="Owed for the month" value={usd(q.data.totals.due)} />
            <StatTile tone="success" icon={<CheckCircle2 className="h-5 w-5" />} label="Paid" value={usd(q.data.totals.paid)} />
            <StatTile tone={q.data.totals.unpaid ? 'warning' : 'default'} icon={<Clock className="h-5 w-5" />} label="Still to pay" value={usd(q.data.totals.unpaid)} />
          </div>

          {!q.data.rows.length ? (
            <EmptyState title="No partner cars this month" description="Partners appear here once one of their cars is on the fleet." />
          ) : (
            <Card>
              <CardContent className="divide-y divide-border p-0">
                {q.data.rows.map((r) => (
                  <div key={r.partnerId} className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          <Link href={`/ops/partners/members/${r.partnerId}`} className="hover:underline">{r.displayName}</Link>
                          {r.paid ? <Badge tone="success">Paid</Badge> : r.net > 0 ? <Badge tone="warning">To pay</Badge> : <Badge tone="muted">Nothing owed</Badge>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {r.cars} car{r.cars === 1 ? '' : 's'} · {r.trips} trip{r.trips === 1 ? '' : 's'} · {r.method === 'zelle' ? 'Zelle' : 'Check'}{r.sendTo ? ` to ${r.sendTo}` : ' (no details yet)'} · due {formatDate(r.dueDate)}
                        </p>
                        {r.paid && <p className="mt-0.5 text-xs text-success">Sent {usd(r.paid.amount)} on {formatDate(r.paid.paidAt)} · ref {r.paid.reference}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className={r.net < 0 ? 'font-semibold text-destructive' : 'font-semibold'}>{usd(r.net)}</span>
                        {r.paid ? (
                          <Button size="sm" variant="ghost" disabled={undo.isPending} onClick={async () => {
                            const { ok } = await confirm({ title: 'Undo this payment record?', description: 'Only do this if it was recorded by mistake. The money itself isn’t touched.', confirmLabel: 'Undo', tone: 'destructive' });
                            if (ok) undo.mutate(r.paid!._id);
                          }}><Undo2 className="h-4 w-4" /> Undo</Button>
                        ) : r.net > 0 ? (
                          <Button size="sm" variant={open === r.partnerId ? 'outline' : 'primary'} onClick={() => setOpen(open === r.partnerId ? null : r.partnerId)}>
                            {open === r.partnerId ? 'Cancel' : 'Record payment'}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {open === r.partnerId && <RecordForm row={r} period={period} onDone={refresh} />}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
