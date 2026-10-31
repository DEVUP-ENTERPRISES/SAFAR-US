'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Car, FileText, Link2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { PersonCard } from '@/components/people/person-card';
import { CaseFilePanel } from '@/features/ai/components/case-file-panel';
import { adminApi } from '@/features/admin/api';
import type { PersonSummary } from '@/features/people/types';
import { ApiError } from '@/lib/api/types';
import { formatDate, formatDateTime, formatMoney } from '@/lib/utils/format';
import { CLAIM_TONE, CLAIM_TYPE } from '../../../features/claims/labels';

interface TripPhotoView { url: string; phase: 'pre' | 'post'; angle?: string; at: string; by: 'guest' | 'host' }
interface ClaimCase {
  _id: string; type: string; status: string; description: string; currency?: string; createdAt: string;
  amountClaimed?: number; amountApproved?: number; collectedCents?: number; penaltyCents?: number; warningIssued?: boolean;
  evidence: { url: string; kind: 'image' | 'file'; note?: string }[];
  claimant: PersonSummary; claimantSide?: 'guest' | 'host'; respondent?: PersonSummary; liable?: PersonSummary; assignee?: string;
  timeline: { status: string; at: string; byName: string; note?: string }[];
  booking: { id: string; code: string; status: string; start: string; end: string; total?: { amount: number; currency: string } } | null;
  vehicle: { id: string; name?: string; plate?: string; photo?: string } | null;
  deposit: { amount: number; currency: string; status: string; captured: number } | null;
  tripPhotos: { pre: TripPhotoView[]; post: TripPhotoView[] };
  approveBlockers: string[];
}

const fail = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const cents = (dollars: string) => Math.round(Number(dollars) * 100);

function Photos({ title, photos }: { title: string; photos: { url: string; label?: string }[] }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-label font-semibold">{title} <span className="font-normal text-muted-foreground tabular-nums">({photos.length})</span></p>
      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">None.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {photos.slice(0, 12).map((p, i) => (
            <li key={`${p.url}-${i}`}>
              <a href={p.url} target="_blank" rel="noreferrer" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <img src={p.url} alt={p.label ?? title} width={160} height={120} loading="lazy" className="aspect-[4/3] w-full rounded-sm object-cover" />
              </a>
              {p.label && <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.label}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Decide({ c, onDone }: { c: ClaimCase; onDone: () => void }) {
  const confirm = useConfirm();
  const currency = c.currency ?? 'USD';
  const [amount, setAmount] = useState(((c.amountApproved ?? c.amountClaimed ?? 0) / 100).toFixed(2));
  const [note, setNote] = useState('');
  const [liable, setLiable] = useState(c.respondent?.id ?? '');
  const [penalty, setPenalty] = useState('');
  const [warn, setWarn] = useState(false);
  const assign = useMutation({ mutationFn: () => adminApi.assignClaim(c._id), onSuccess: onDone });
  const resolve = useMutation({ meta: { silentError: true }, mutationFn: (d: 'approved' | 'rejected') => adminApi.resolveClaim(c._id, d, note.trim(), d === 'approved' ? cents(amount) : undefined), onSuccess: onDone });
  const settle = useMutation({
    meta: { silentError: true },
    mutationFn: () => adminApi.settleClaim(c._id, { amountApproved: cents(amount), note: note.trim(), liableUserId: liable || undefined, penaltyCents: penalty ? cents(penalty) : undefined, warning: warn }),
    onSuccess: onDone,
  });
  const open = ['opened', 'investigating'].includes(c.status);
  const err = resolve.error ?? settle.error;

  if (!open && c.status !== 'approved') return null;
  return (
    <Card className="border-primary/30">
      <CardHeader><CardTitle className="text-base">Decision</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {c.status === 'opened' && (
          <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span>Not picked up yet{c.assignee ? '' : '. Take it so others know you’re on it.'}</span>
            <Button size="sm" variant="outline" loading={assign.isPending} onClick={() => assign.mutate()}>Investigate</Button>
          </div>
        )}
        {c.approveBlockers.length > 0 && (
          <ul className="space-y-1 rounded-lg bg-warning/10 p-3 text-sm text-warning" role="status">
            {c.approveBlockers.map((b) => <li key={b} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{b}</li>)}
          </ul>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={`Amount (${currency})`} htmlFor="cl-amount" hint={c.amountClaimed != null ? `Claimed ${formatMoney({ amount: c.amountClaimed, currency })}` : 'No amount was claimed'}>
            <Input id="cl-amount" type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          {c.status === 'approved' && (
            <Field label="Who was at fault" htmlFor="cl-liable">
              <Select id="cl-liable" value={liable} onChange={(e) => setLiable(e.target.value)}>
                <option value="">Nobody (platform covers it)</option>
                {c.respondent && <option value={c.respondent.id}>{c.respondent.name}</option>}
                <option value={c.claimant.id}>{c.claimant.name} (who filed)</option>
              </Select>
            </Field>
          )}
          {c.status === 'approved' && liable && (
            <>
              <Field label="Penalty (optional)" htmlFor="cl-penalty"><Input id="cl-penalty" type="number" inputMode="decimal" min={0} step="0.01" value={penalty} onChange={(e) => setPenalty(e.target.value)} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={warn} onChange={(e) => setWarn(e.target.checked)} /> Record a warning on their account</label>
            </>
          )}
        </div>
        <Field label="Note (kept on the claim and shown to both sides)" htmlFor="cl-note"><Textarea id="cl-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {err && <p role="alert" className="text-sm text-destructive">{fail(err, 'That didn’t go through.')}</p>}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {open && (
            <>
              <Button variant="ghost" className="text-destructive" disabled={note.trim().length < 3} loading={resolve.isPending && resolve.variables === 'rejected'}
                onClick={async () => { if (await confirm({ title: 'Reject this claim?', description: 'Both sides see your note.', confirmLabel: 'Reject', tone: 'destructive' })) resolve.mutate('rejected'); }}>
                Reject
              </Button>
              <Button disabled={note.trim().length < 3} loading={resolve.isPending && resolve.variables === 'approved'}
                onClick={async () => { if (await confirm({ title: `Approve ${formatMoney({ amount: cents(amount), currency })}?`, description: 'It moves to settlement, where the money is paid.', confirmLabel: 'Approve' })) resolve.mutate('approved'); }}>
                Approve
              </Button>
            </>
          )}
          {c.status === 'approved' && (
            <Button disabled={note.trim().length < 3 || !(Number(amount) >= 0)} loading={settle.isPending}
              onClick={async () => { if (await confirm({ title: `Settle and pay ${formatMoney({ amount: cents(amount), currency })}?`, description: 'This is taken from the guest’s deposit or card where possible and credited to the claimant’s wallet. It moves real money and can’t be undone.', confirmLabel: 'Settle & pay out', tone: 'destructive' })) settle.mutate(); }}>
              Settle &amp; pay out
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LinkTrip({ id, onDone }: { id: string; onDone: () => void }) {
  const [code, setCode] = useState('');
  const link = useMutation({ meta: { silentError: true }, mutationFn: () => adminApi.linkClaim(id, code), onSuccess: onDone });
  return (
    <Card className="border-warning/40">
      <CardContent className="space-y-3 p-5">
        <p className="flex items-center gap-2 font-semibold text-warning"><AlertTriangle className="h-4 w-4" /> This claim isn’t linked to a trip</p>
        <p className="text-sm text-muted-foreground">Without a trip there’s no car, no other side and no photos to judge it by. Ask the person for their booking code and link it here; the other side is told.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input aria-label="Booking code" placeholder="Booking code" value={code} onChange={(e) => setCode(e.target.value)} className="sm:max-w-xs" />
          <Button disabled={code.trim().length < 3} loading={link.isPending} onClick={() => link.mutate()}><Link2 className="h-4 w-4" /> Link trip</Button>
        </div>
        {link.isError && <p role="alert" className="text-sm text-destructive">{fail(link.error, 'That didn’t link.')}</p>}
      </CardContent>
    </Card>
  );
}

export default function ClaimCasePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['admin-claim', id], queryFn: () => adminApi.claim(id) as Promise<ClaimCase> });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin-claim', id] });
    void qc.invalidateQueries({ queryKey: ['admin-list', '/admin/claims'] });
    toast({ tone: 'success', title: 'Saved' });
  };

  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-96 w-full" /></div>;
  if (q.isError || !q.data) return <ErrorState message="We couldn’t load this claim." retry={() => void q.refetch()} />;
  const c = q.data;
  const currency = c.currency ?? 'USD';
  const evidence = c.evidence.filter((e) => e.kind === 'image').map((e) => ({ url: e.url, label: e.note }));
  const files = c.evidence.filter((e) => e.kind === 'file');

  return (
    <div className="space-y-5">
      <Link href="/claims" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All claims</Link>
      <PageHeader
        eyebrow={`${CLAIM_TYPE[c.type] ?? c.type} claim · filed ${formatDate(c.createdAt)}`}
        title={c.amountClaimed != null ? `${formatMoney({ amount: c.amountClaimed, currency })} claimed` : 'No amount claimed'}
        description={c.assignee ? `Being handled by ${c.assignee}` : 'Not picked up yet'}
        actions={<Badge tone={CLAIM_TONE[c.status] ?? 'muted'}>{c.status}</Badge>}
      />

      {!c.booking && ['opened', 'investigating'].includes(c.status) && <LinkTrip id={c._id} onDone={refresh} />}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle className="text-base">What they said</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-wrap text-sm">{c.description}</p>
              <Photos title="Their photos" photos={evidence} />
              {files.length > 0 && (
                <ul className="space-y-1 text-sm">{files.map((f, i) => <li key={i}><a className="inline-flex items-center gap-1 text-primary hover:underline" href={f.url} target="_blank" rel="noreferrer"><FileText className="h-4 w-4" />{f.note ?? `File ${i + 1}`}</a></li>)}</ul>
              )}
            </CardContent>
          </Card>

          {c.booking && (
            <Card>
              <CardHeader><CardTitle className="text-base">The car at pickup and at return</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Photos title="At pickup" photos={c.tripPhotos.pre.map((p) => ({ url: p.url, label: [p.angle, p.by === 'guest' ? 'by guest' : 'by host'].filter(Boolean).join(' · ') }))} />
                <Photos title="At return" photos={c.tripPhotos.post.map((p) => ({ url: p.url, label: [p.angle, p.by === 'guest' ? 'by guest' : 'by host'].filter(Boolean).join(' · ') }))} />
              </CardContent>
            </Card>
          )}

          <CaseFilePanel claimId={c._id} />
          <Decide c={c} onDone={refresh} />
        </div>

        <div className="min-w-0 space-y-5">
          <PersonCard title={`Filed by (${c.claimantSide ?? 'unknown side'})`} person={c.claimant} />
          {c.respondent ? <PersonCard title="Against" person={c.respondent} /> : <p className="rounded-lg border border-border p-3 text-sm text-muted-foreground">No other side yet: link the trip.</p>}

          {c.booking && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Car className="h-4 w-4" /> Trip</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                {c.vehicle?.photo && <img src={c.vehicle.photo} alt={c.vehicle.name ?? 'Car'} width={320} height={180} className="aspect-video w-full rounded-sm object-cover" />}
                <p className="font-medium">{c.vehicle?.name ?? 'Car'}{c.vehicle?.plate ? ` · ${c.vehicle.plate}` : ''}</p>
                <p className="text-muted-foreground">{formatDate(c.booking.start)} – {formatDate(c.booking.end)} · {c.booking.status.replace(/_/g, ' ')}</p>
                {c.booking.total && <p>Trip total <span className="tabular-nums">{formatMoney(c.booking.total)}</span></p>}
                {c.deposit ? (
                  <p>Deposit <span className="tabular-nums">{formatMoney({ amount: c.deposit.amount, currency: c.deposit.currency })}</span> · {c.deposit.status.replace(/_/g, ' ')}{c.deposit.captured > 0 ? ` · ${formatMoney({ amount: c.deposit.captured, currency: c.deposit.currency })} taken` : ''}</p>
                ) : (
                  <p className="text-muted-foreground">No deposit on this trip</p>
                )}
                <Link className="font-medium text-primary hover:underline" href={`/bookings/${c.booking.id}`}>Open booking {c.booking.code} →</Link>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm">
                {[...c.timeline].reverse().map((t, i) => (
                  <li key={i}><span className="font-medium capitalize">{t.status}</span> · {t.byName}{t.note ? ` · ${t.note}` : ''}<span className="block text-xs text-muted-foreground">{formatDateTime(t.at)}</span></li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
