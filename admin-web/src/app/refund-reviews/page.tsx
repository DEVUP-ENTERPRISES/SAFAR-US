'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Flag } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { TabBar } from '@/features/admin/components/page-tabs';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { adminApi } from '@/features/admin/api';
import { adminPath } from '@/lib/admin-path';
import { ApiError } from '@/lib/api/types';
import { formatDateTime, formatMoney } from '@/lib/utils/format';
import { EXCEPTION_REASON_LABEL, EXCEPTION_STATUS_LABEL } from '@/features/bookings/status';
import type { Booking } from '@/features/bookings/types';

const TABS = [
  { key: 'pending', label: 'To review' },
  { key: 'decided', label: 'Decided' },
] as const;

const TONE = { pending: 'warning', approved: 'success', partial: 'success', rejected: 'muted' } as const;
const kept = (b: Booking) => b.cancellation?.charged ?? { amount: 0, currency: b.priceBreakdown.currency };

/** Late cancellations guests asked us to review: read the proof, then refund all, part or none of what was kept. */
export default function RefundReviewsPage() {
  const [tab, setTab] = useState<'pending' | 'decided'>('pending');
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useQuery({ queryKey: ['trip-exceptions', tab], queryFn: () => adminApi.tripExceptions(tab) });
  const open = list.data?.find((b) => b._id === openId) ?? null;

  const columns: Column<Booking>[] = [
    { header: 'Trip', cell: (b) => <Link className="font-medium text-primary underline-offset-2 hover:underline" href={adminPath(`bookings/${b._id}`)}>{b.code}</Link> },
    {
      header: 'Reason',
      cell: (b) => (
        <span className="flex items-center gap-2">
          {b.exception && EXCEPTION_REASON_LABEL[b.exception.reasonCode]}
          {b.exception?.flagged && <Flag className="h-4 w-4 text-warning" aria-label="Flagged" />}
        </span>
      ),
    },
    { header: tab === 'pending' ? 'Kept' : 'Refunded', numeric: true, sortValue: (b) => (tab === 'pending' ? kept(b).amount : b.exception?.refund?.amount ?? 0), cell: (b) => formatMoney(tab === 'pending' ? kept(b) : b.exception?.refund ?? kept(b)) },
    { header: tab === 'pending' ? 'Asked' : 'Decided', hideOnMobile: true, sortValue: (b) => (tab === 'pending' ? b.exception?.requestedAt : b.exception?.decidedAt) ?? '', cell: (b) => formatDateTime((tab === 'pending' ? b.exception?.requestedAt : b.exception?.decidedAt) ?? b.createdAt) },
    { header: 'Status', cell: (b) => b.exception && <Badge tone={TONE[b.exception.status]}>{EXCEPTION_STATUS_LABEL[b.exception.status].replace('We’re reviewing your request', 'Waiting')}</Badge> },
    { header: '', cell: (b) => <Button size="sm" variant={openId === b._id ? 'secondary' : 'outline'} onClick={() => setOpenId(openId === b._id ? null : b._id)}>{tab === 'pending' ? 'Review' : 'View'}</Button> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Help & safety" title="Refund reviews" description="Guests who cancelled late because of a cancelled flight, bad weather or an emergency, with their proof. Decide within a day." />
      <TabBar tabs={[...TABS]} active={tab} onChange={(k) => { setTab(k as 'pending' | 'decided'); setOpenId(null); }} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <DataTable
          columns={columns}
          rows={list.data}
          isLoading={list.isLoading}
          isError={list.isError}
          onRetry={() => list.refetch()}
          emptyTitle={tab === 'pending' ? 'No requests waiting' : 'Nothing decided yet'}
          emptyDescription={tab === 'pending' ? 'New requests appear here, and staff are notified when one arrives.' : undefined}
        />
        {open ? <ReviewPanel booking={open} onClose={() => setOpenId(null)} /> : (
          <Card className="hidden lg:block"><CardContent className="py-10 text-center text-sm text-muted-foreground">Pick a request to see the proof and decide.</CardContent></Card>
        )}
      </div>
    </div>
  );
}

function ReviewPanel({ booking: b, onClose }: { booking: Booking; onClose: () => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const ex = b.exception!;
  const keptMoney = kept(b);
  const [note, setNote] = useState('');
  const [partial, setPartial] = useState('');
  const proof = useQuery({ queryKey: ['trip-exception-proof', b._id], queryFn: () => adminApi.tripExceptionProof(b._id), staleTime: 60_000 });
  const decide = useMutation({
    mutationFn: (input: { decision: 'approved' | 'partial' | 'rejected'; amountCents?: number }) => adminApi.decideTripException(b._id, { ...input, note: note.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trip-exceptions'] });
      toast({ tone: 'success', title: 'Decision saved. The guest has been told.' });
      onClose();
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not save the decision' }),
  });
  const partialCents = Math.round(Number(partial) * 100);
  const partialOk = partialCents > 0 && partialCents < keptMoney.amount;

  const run = async (decision: 'approved' | 'partial' | 'rejected') => {
    const amount = decision === 'approved' ? keptMoney.amount : decision === 'partial' ? partialCents : 0;
    const { ok } = await confirm({
      title: decision === 'rejected' ? 'Decline this request?' : `Refund ${formatMoney({ amount, currency: keptMoney.currency })}?`,
      description: decision === 'rejected' ? 'Nothing more is refunded. The guest gets your note.' : 'The money goes back to the guest’s card now and the host’s share of it is cancelled.',
      confirmLabel: decision === 'rejected' ? 'Decline' : 'Refund',
      tone: decision === 'rejected' ? 'destructive' : 'default',
    });
    if (ok) decide.mutate(decision === 'partial' ? { decision, amountCents: partialCents } : { decision });
  };

  return (
    <Card className="min-w-0 lg:sticky lg:top-24 lg:self-start">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {b.code}
          {ex.flagged && <Badge tone="warning">Flagged</Badge>}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{EXCEPTION_REASON_LABEL[ex.reasonCode]} · asked {formatDateTime(ex.requestedAt)}</p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {ex.flagReason && <p className="rounded-sm bg-warning/10 px-3 py-2 text-warning">{ex.flagReason}</p>}
        <dl className="grid grid-cols-2 gap-2">
          <dt className="text-muted-foreground">Trip total</dt><dd className="text-right tabular-nums">{formatMoney(b.priceBreakdown.total)}</dd>
          <dt className="text-muted-foreground">Already refunded</dt><dd className="text-right tabular-nums">{formatMoney(b.cancellation?.refund)}</dd>
          <dt className="text-muted-foreground">Kept</dt><dd className="text-right font-semibold tabular-nums">{formatMoney(keptMoney)}</dd>
          <dt className="text-muted-foreground">Pickup was</dt><dd className="text-right">{formatDateTime(b.period.start)}</dd>
          <dt className="text-muted-foreground">Cancelled</dt><dd className="text-right">{b.cancellation ? formatDateTime(b.cancellation.at) : '—'}</dd>
        </dl>
        {ex.note && <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">{ex.note}</blockquote>}
        <div className="space-y-2">
          <p className="font-semibold">Proof</p>
          {proof.isLoading && <Skeleton className="h-9 w-full rounded-sm" />}
          {proof.isError && <p role="alert" className="text-destructive">Couldn’t open the files. <button className="underline" onClick={() => proof.refetch()}>Retry</button></p>}
          {proof.data?.length === 0 && <p className="text-muted-foreground">No files attached.</p>}
          {proof.data?.map((f, i) => (
            <a key={f.key} href={f.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-sm border border-border px-3 py-2 hover:bg-accent">
              <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden /> File {i + 1}
            </a>
          ))}
        </div>

        {ex.status === 'pending' ? (
          <>
            <Field label="Note to the guest (optional)" htmlFor="decision-note">
              <Textarea id="decision-note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <Button className="w-full" loading={decide.isPending && decide.variables?.decision === 'approved'} disabled={decide.isPending} onClick={() => run('approved')}>
              Refund all {formatMoney(keptMoney)}
            </Button>
            <div className="flex items-end gap-2">
              <Field label="Or refund part ($)" htmlFor="partial" className="flex-1" error={partial && !partialOk ? `Between $0.01 and ${formatMoney({ amount: keptMoney.amount - 1, currency: keptMoney.currency })}` : undefined}>
                <Input id="partial" type="number" min={0.01} step="0.01" inputMode="decimal" value={partial} onChange={(e) => setPartial(e.target.value)} />
              </Field>
              <Button variant="outline" disabled={!partialOk || decide.isPending} loading={decide.isPending && decide.variables?.decision === 'partial'} onClick={() => run('partial')}>Refund</Button>
            </div>
            <Button variant="ghost" className="w-full text-destructive hover:text-destructive" disabled={decide.isPending} onClick={() => run('rejected')}>Decline</Button>
          </>
        ) : (
          <div className="space-y-1 border-t border-border pt-3">
            <Badge tone={TONE[ex.status]}>{EXCEPTION_STATUS_LABEL[ex.status]}</Badge>
            {ex.refund && <p className="tabular-nums">Refunded {formatMoney(ex.refund)}{ex.decidedAt ? ` on ${formatDateTime(ex.decidedAt)}` : ''}</p>}
            {ex.decisionNote && <p className="text-muted-foreground">{ex.decisionNote}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
