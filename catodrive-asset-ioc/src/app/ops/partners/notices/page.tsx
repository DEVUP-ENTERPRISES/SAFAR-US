'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { partnerManageApi } from '@/features/asset-partners/manage-api';
import { NOTICE_TYPE_LABEL, type NoticeStatus, type PartnerNotice } from '@/features/asset-partners/api';
import { ApiError } from '@/lib/api/types';
import { formatDate, formatDateTime, formatMoney } from '@/lib/utils/format';
import { PartnersNav } from '~/features/partners/partners-nav';

const manage = partnerManageApi('/ioc');
const usd = (cents: number) => formatMoney({ amount: cents, currency: 'USD' });
const FILTERS: { value: NoticeStatus | ''; label: string }[] = [
  { value: 'needs_review', label: 'Needs a decision' },
  { value: 'matched', label: 'Matched to a trip' },
  { value: 'absorbed', label: 'CatoDrive pays' },
  { value: 'rejected', label: 'Not taken on' },
  { value: '', label: 'All' },
];
const REASON: Record<string, string> = { no_trip: 'No trip had the car then', several_trips: 'More than one trip that day', too_late: 'Too late to charge the guest' };
const CHARGE: Record<string, string> = { reported: 'Guest told, not yet charged', charged: 'Guest paid', charge_failed: 'Guest card failed', disputed: 'Guest disputed', waived: 'Waived' };

function NoticeRow({ n }: { n: PartnerNotice }) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [trip, setTrip] = useState(n.candidates[0]?.id ?? '');
  const [ref, setRef] = useState('');
  const done = () => void qc.invalidateQueries({ queryKey: ['ioc-notices'] });
  const fail = (e: unknown) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'That didn’t work' });
  const assign = useMutation({ mutationFn: () => manage.assignNotice(n._id, trip), onSuccess: () => { toast({ tone: 'success', title: 'Matched; the guest is told' }); done(); }, onError: fail });
  const absorb = useMutation({ mutationFn: (note: string) => manage.absorbNotice(n._id, note), onSuccess: done, onError: fail });
  const reject = useMutation({ mutationFn: (note: string) => manage.rejectNotice(n._id, note), onSuccess: done, onError: fail });
  const agency = useMutation({ mutationFn: () => manage.noticeAgencyPaid(n._id, ref.trim() || undefined), onSuccess: () => { toast({ tone: 'success', title: 'Marked paid to the agency' }); done(); }, onError: fail });
  const due = n.dueDate ? new Date(`${n.dueDate}T12:00:00Z`) : null;
  const overdueSoon = due && !n.paidByPartner && !n.agencyPaid && due.getTime() - Date.now() < 7 * 86_400_000;

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              {NOTICE_TYPE_LABEL[n.type]} · {n.issuedBy}
              {n.reviewReason && <Badge tone="warning">{REASON[n.reviewReason]}</Badge>}
              {n.guestCharge && <Badge tone={n.guestCharge === 'charged' ? 'success' : n.guestCharge === 'charge_failed' ? 'destructive' : 'default'}>{CHARGE[n.guestCharge] ?? n.guestCharge}</Badge>}
            </p>
            <p className="text-sm text-muted-foreground">
              {n.partnerName} · {n.vehicle?.name}{n.vehicle?.plate ? ` (${n.vehicle.plate})` : ''} · {n.occurredAt ? formatDateTime(n.occurredAt) : formatDate(n.occurredDate)} · ref <span className="font-mono">{n.noticeRef}</span>
            </p>
            <p className="text-sm">
              {n.paidByPartner ? 'Partner already paid the agency; refund on their statement.' : n.agencyPaid ? `CatoDrive paid the agency ${formatDate(n.agencyPaid.at)}.` : 'Agency not paid yet.'}
              {due && !n.paidByPartner && !n.agencyPaid && <span className={overdueSoon ? ' font-semibold text-destructive' : ' text-muted-foreground'}> Due {formatDate(due)}.</span>}
              {n.trip && <span className="text-muted-foreground"> Trip {n.trip.code}.</span>}
            </p>
            <p className="flex flex-wrap gap-3 text-sm">
              {n.evidence.map((e, i) => <a key={e.url} href={e.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Notice {i + 1} <ExternalLink className="h-3 w-3" aria-hidden /></a>)}
            </p>
          </div>
          <p className="shrink-0 text-lg font-semibold tabular-nums">{usd(n.amountCents)}</p>
        </div>

        {n.status === 'needs_review' && (
          <div className="flex flex-col gap-2 rounded-lg bg-subtle p-3 sm:flex-row sm:items-center">
            {n.candidates.length > 0 ? (
              <>
                <Select aria-label="Trip" value={trip} onChange={(e) => setTrip(e.target.value)} className="sm:w-72">
                  {n.candidates.map((c) => <option key={c.id} value={c.id}>{c.code} · {formatDateTime(c.start)} to {formatDateTime(c.end)}</option>)}
                </Select>
                <Button size="sm" disabled={!trip || n.reviewReason === 'too_late'} loading={assign.isPending} onClick={() => assign.mutate()}>Charge this trip’s guest</Button>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Check the trip log: was the car with a captain, in the shop, or with a guest outside the app?</span>
            )}
            <Button size="sm" variant="outline" loading={absorb.isPending} onClick={async () => { const r = await confirm({ title: 'CatoDrive pays this one?', confirmLabel: 'CatoDrive pays', reason: { label: 'Why? The partner sees this.', required: true } }); if (r.ok) absorb.mutate(r.reason); }}>CatoDrive pays</Button>
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" loading={reject.isPending} onClick={async () => { const r = await confirm({ title: 'Not take this one on?', tone: 'destructive', confirmLabel: 'Not ours', reason: { label: 'Why? The partner sees this.', required: true } }); if (r.ok) reject.mutate(r.reason); }}>Not ours</Button>
          </div>
        )}

        {!n.paidByPartner && !n.agencyPaid && (n.status === 'matched' || n.status === 'absorbed') && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input aria-label="Payment reference" placeholder="Agency payment reference" value={ref} onChange={(e) => setRef(e.target.value)} className="sm:w-64" />
            <Button size="sm" variant="secondary" loading={agency.isPending} onClick={() => agency.mutate()}>Mark paid to the agency</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PartnerNoticesPage() {
  const [status, setStatus] = useState<NoticeStatus | ''>('needs_review');
  const q = useQuery({ queryKey: ['ioc-notices', status], queryFn: () => manage.notices(status || undefined) });
  return (
    <div className="space-y-5">
      <PartnersNav />
      <PageHeader title="Tolls & tickets" description="Notices partners upload. Most match a trip on their own and the guest is charged; the rest need you to pick the trip or decide who pays. Pay the agency before the due date so the partner’s registration is never held." />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Status">
        {FILTERS.map((f) => <Chip key={f.value || 'all'} active={status === f.value} onClick={() => setStatus(f.value)}>{f.label}</Chip>)}
      </div>
      {q.isLoading ? (
        <Skeleton className="h-48 w-full rounded-lg" />
      ) : q.isError ? (
        <ErrorState message="We couldn’t load the notices." retry={() => void q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState title={status === 'needs_review' ? 'Nothing waiting' : 'Nothing here'} description={status === 'needs_review' ? 'Every notice partners sent has been matched or decided.' : 'Try another filter.'} />
      ) : (
        <div className="space-y-3">{q.data.map((n) => <NoticeRow key={n._id} n={n} />)}</div>
      )}
    </div>
  );
}
