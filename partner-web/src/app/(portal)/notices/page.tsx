'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCircle2, Clock, FileText, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { assetPartnerApi, NOTICE_TYPE_LABEL, type NoticeType, type PartnerNotice } from '@/features/asset-partners/api';
import { uploadFiles } from '@/features/media/upload';
import { ApiError } from '@/lib/api/types';
import { formatDate, formatMoney } from '@/lib/utils/format';

const usd = (cents: number) => formatMoney({ amount: cents, currency: 'USD' });
const today = () => new Date().toISOString().slice(0, 10);

/** Where a notice stands, in the partner's words. */
function standing(n: PartnerNotice): { tone: 'success' | 'warning' | 'muted' | 'destructive' | 'default'; label: string; detail: string } {
  if (n.status === 'rejected') return { tone: 'destructive', label: 'Not taken on', detail: n.resolution?.note ?? 'We couldn’t take this one on.' };
  if (n.status === 'absorbed') return { tone: 'success', label: 'CatoDrive is paying', detail: n.paidByPartner ? `You’ll get ${usd(n.amountCents)} back on your statement.` : 'You don’t need to do anything.' };
  if (n.status === 'needs_review')
    return {
      tone: 'warning',
      label: 'Our team is checking',
      detail: n.reviewReason === 'several_trips' ? 'More than one trip had the car that day; we’re working out which.' : n.reviewReason === 'too_late' ? 'It arrived after the window to charge the guest; we’ll decide who pays.' : 'No trip had the car at that time; we’re checking our records.',
    };
  const guest = n.guestCharge === 'charged' ? 'The guest has paid it.' : n.guestCharge === 'charge_failed' ? 'The guest’s card was declined; we’re following up.' : n.guestCharge === 'disputed' ? 'The guest disputed it; we’re reviewing.' : 'The guest has been told and is being charged.';
  return { tone: 'default', label: `Matched to trip ${n.trip?.code ?? ''}`, detail: `${guest}${n.paidByPartner ? ` You’ll get ${usd(n.amountCents)} back on your statement.` : ''}` };
}

function UploadForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const cars = useQuery({ queryKey: ['asset-partner-vehicles'], queryFn: () => assetPartnerApi.vehicles() });
  const [f, setF] = useState({ vehicleId: '', type: 'toll' as NoticeType, issuedBy: '', noticeRef: '', date: '', time: '', amount: '', dueDate: '', paid: false });
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const send = useMutation({
    meta: { silentError: true },
    mutationFn: async () => {
      const uploaded = await uploadFiles('notice', files);
      return assetPartnerApi.uploadNotice({
        vehicleId: f.vehicleId,
        type: f.type,
        issuedBy: f.issuedBy.trim(),
        noticeRef: f.noticeRef.trim(),
        occurredDate: f.date,
        occurredAt: f.time ? new Date(`${f.date}T${f.time}`).toISOString() : undefined,
        amountCents: Math.round(Number(f.amount) * 100),
        dueDate: f.dueDate || undefined,
        paidByPartner: f.paid,
        evidence: uploaded.map((u, i) => ({ key: u.key, kind: files[i].type === 'application/pdf' ? 'file' : 'image' })),
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['partner-notices'] });
      setF({ vehicleId: '', type: 'toll', issuedBy: '', noticeRef: '', date: '', time: '', amount: '', dueDate: '', paid: false });
      setFiles([]);
      onDone();
    },
    onError: (e) => setError(e instanceof ApiError || e instanceof Error ? e.message : 'We couldn’t send that. Try again.'),
  });

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!f.vehicleId) return setError('Pick the car on the notice.');
    if (f.issuedBy.trim().length < 2) return setError('Who sent it? For example Harris County Toll Road Authority.');
    if (f.noticeRef.trim().length < 2) return setError('Enter the notice or invoice number.');
    if (!f.date || f.date > today()) return setError('Enter the date the toll or ticket happened, not the date of the letter.');
    if (!(Number(f.amount) > 0)) return setError('Enter the amount on the notice.');
    if (!files.length) return setError('Add a photo or PDF of the notice.');
    setError(null);
    send.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><Upload className="h-5 w-5 text-primary" aria-hidden /> Upload a notice</CardTitle>
        <p className="text-sm text-muted-foreground">Upload it the day it arrives. We find the trip that had your car, charge that guest, and make sure the agency is paid before late fees build up.</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
          {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive sm:col-span-2">{error}</p>}
          <Field label="Car" htmlFor="n-car">
            <Select id="n-car" value={f.vehicleId} onChange={(e) => set('vehicleId', e.target.value)} disabled={cars.isLoading}>
              <option value="">Choose the car</option>
              {(cars.data ?? []).map((c) => <option key={c._id} value={c._id}>{c.year} {c.make} {c.model}</option>)}
            </Select>
          </Field>
          <Field label="What is it?" htmlFor="n-type">
            <Select id="n-type" value={f.type} onChange={(e) => set('type', e.target.value as NoticeType)}>
              {Object.entries(NOTICE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Sent by" htmlFor="n-by"><Input id="n-by" value={f.issuedBy} onChange={(e) => set('issuedBy', e.target.value)} placeholder="Harris County Toll Road Authority" /></Field>
          <Field label="Notice or invoice number" htmlFor="n-ref"><Input id="n-ref" value={f.noticeRef} onChange={(e) => set('noticeRef', e.target.value)} className="font-mono" /></Field>
          <Field label="Date it happened" htmlFor="n-date" hint="The toll or violation date, not the letter date."><Input id="n-date" type="date" max={today()} value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
          <Field label="Time, if printed" htmlFor="n-time" hint="Helps us match the right trip."><Input id="n-time" type="time" value={f.time} onChange={(e) => set('time', e.target.value)} /></Field>
          <Field label="Amount ($)" htmlFor="n-amount"><Input id="n-amount" inputMode="decimal" value={f.amount} onChange={(e) => set('amount', e.target.value)} className="tabular-nums" /></Field>
          <Field label="Pay by, if printed" htmlFor="n-due"><Input id="n-due" type="date" value={f.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></Field>
          <Field label="Photo or PDF of the notice" htmlFor="n-file" className="sm:col-span-2">
            <label htmlFor="n-file" className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border p-4 text-sm hover:bg-accent">
              <Camera className="h-5 w-5 text-primary" aria-hidden />
              <span>{files.length ? files.map((x) => x.name).join(', ') : 'Take a photo or choose a file (front and back if it has two sides)'}</span>
            </label>
            <input id="n-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" multiple className="sr-only" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} />
          </Field>
          <label className="flex items-start gap-3 rounded-sm border border-border p-3 text-sm sm:col-span-2">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={f.paid} onChange={(e) => set('paid', e.target.checked)} />
            <span><span className="font-medium">I already paid this</span><span className="block text-xs text-muted-foreground">We pay you back on your next statement once it’s checked. If you haven’t paid, don’t: CatoDrive pays the agency.</span></span>
          </label>
          <div className="flex justify-end sm:col-span-2"><Button type="submit" size="lg" loading={send.isPending}>Send notice</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function NoticesPage() {
  const q = useQuery({ queryKey: ['partner-notices'], queryFn: () => assetPartnerApi.notices() });
  const [sent, setSent] = useState(false);
  const summary = useMemo(() => {
    const rows = q.data ?? [];
    return {
      open: rows.filter((n) => n.status === 'needs_review').length,
      refunds: rows.filter((n) => n.paidByPartner && (n.status === 'matched' || n.status === 'absorbed')).reduce((s, n) => s + n.amountCents, 0),
      recovered: rows.filter((n) => n.guestCharge === 'charged').length,
    };
  }, [q.data]);

  return (
    <div className="space-y-6 py-8">
      <PageHeader eyebrow="Asset Partners" title="Tolls & tickets" description="Letters about tolls, parking, tickets or towing come to you because the car is registered in your name. Send them here and we deal with them." />

      {sent && <p role="status" className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/5 p-4 text-sm"><CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> Got it. You can see where it stands below.</p>}
      <UploadForm onDone={() => setSent(true)} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="display text-xl">Your notices</h2>
          {q.data && q.data.length > 0 && (
            <p className="text-sm text-muted-foreground tabular-nums">
              {summary.recovered} paid by guests · {summary.open} being checked{summary.refunds > 0 ? ` · ${usd(summary.refunds)} coming back to you` : ''}
            </p>
          )}
        </div>
        {q.isLoading ? (
          <Skeleton className="h-40 w-full rounded-lg" />
        ) : q.isError ? (
          <ErrorState message="We couldn’t load your notices." retry={() => void q.refetch()} />
        ) : !q.data?.length ? (
          <EmptyState icon={<FileText className="h-6 w-6" />} title="No notices yet" description="When a toll or ticket letter arrives for one of your cars, upload it above." />
        ) : (
          <ul className="space-y-3">
            {q.data.map((n) => {
              const s = standing(n);
              return (
                <li key={n._id}>
                  <Card>
                    <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <p className="flex flex-wrap items-center gap-2 font-semibold">{NOTICE_TYPE_LABEL[n.type]} · {n.issuedBy}<Badge tone={s.tone}>{s.label}</Badge></p>
                        <p className="text-sm text-muted-foreground">{n.vehicle?.name ?? 'Your car'} · {formatDate(n.occurredAt ?? n.occurredDate)} · ref <span className="font-mono">{n.noticeRef}</span></p>
                        <p className="flex items-start gap-1.5 text-sm"><Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />{s.detail}</p>
                      </div>
                      <p className="shrink-0 text-lg font-semibold tabular-nums">{usd(n.amountCents)}</p>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
