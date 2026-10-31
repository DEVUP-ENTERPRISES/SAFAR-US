'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, IdCard, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { returnsManageApi } from '@/features/asset-partners/returns-api';
import type { IdentityState, ReturnReason } from '@/features/asset-partners/api';
import { ApiError } from '@/lib/api/types';
import { formatDate } from '@/lib/utils/format';

const manage = returnsManageApi('/ioc');
const fail = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

const ID_LABEL: Record<IdentityState, { label: string; tone: 'success' | 'warning' | 'destructive' | 'muted' }> = {
  verified: { label: 'Verified by Stripe', tone: 'success' },
  confirmed_by_staff: { label: 'Checked in person', tone: 'success' },
  pending: { label: 'Stripe is checking', tone: 'warning' },
  rejected: { label: 'Check failed', tone: 'destructive' },
  not_started: { label: 'Not started', tone: 'muted' },
};

/** ID check, contacts, signing window and payout hold for one partner, with the actions ops can take on each. */
export function PartnerLifecycleCard({ partnerId, cars }: { partnerId: string; cars: { _id: string; year: number; make: string; model: string; endedAt?: string }[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['ioc-partner-identity', partnerId], queryFn: () => manage.identity(partnerId) });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['ioc-partner-identity', partnerId] });
  const [reason, setReason] = useState('');
  const [payee, setPayee] = useState({ payableTo: '', mailingAddress: '' });
  const confirmId = useMutation({ meta: { silentError: true }, mutationFn: () => manage.confirmIdentity(partnerId, reason.trim()), onSuccess: () => { setReason(''); refresh(); toast({ tone: 'success', title: 'ID marked as checked' }); } });
  const resend = useMutation({ mutationFn: () => manage.resendOffer(partnerId), onSuccess: () => { refresh(); toast({ tone: 'success', title: 'Agreement sent again' }); }, onError: (e) => toast({ tone: 'error', title: fail(e, 'That didn’t send.') }) });
  const release = useMutation({ meta: { silentError: true }, mutationFn: () => manage.releaseHold(partnerId, q.data?.payoutHold?.reason === 'deceased' ? payee : undefined), onSuccess: () => { refresh(); toast({ tone: 'success', title: 'Payouts released' }); } });

  if (q.isLoading) return <Skeleton className="h-48 w-full rounded-lg" />;
  if (q.isError || !q.data) return <ErrorState message="We couldn’t load this partner’s ID and contacts." retry={() => void q.refetch()} />;
  const { identity, offer, profile, payoutHold } = q.data;
  const id = ID_LABEL[identity.state];
  const idDone = identity.state === 'verified' || identity.state === 'confirmed_by_staff';

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card className="min-w-0">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><IdCard className="h-4 w-4" /> ID check <Badge tone={id.tone} className="ms-auto">{id.label}</Badge></CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {identity.verifiedName && (
            <p className="flex items-center gap-2">
              Name on ID: <span className="font-medium">{identity.verifiedName}</span>
              {identity.nameMatches === true && <Badge tone="success">Matches application</Badge>}
              {identity.nameMatches === false && <Badge tone="destructive">Doesn’t match application</Badge>}
            </p>
          )}
          {identity.override && <p className="text-muted-foreground">Checked in person {formatDate(identity.override.at)}: “{identity.override.reason}”</p>}
          {!identity.required && !idDone && <p className="text-muted-foreground">Not required for this partner (added before the portal).</p>}
          {!idDone && (
            <div className="space-y-2 border-t border-border pt-3">
              <Field label="Checked their ID in person?" htmlFor="id-reason" hint="Only when Stripe can’t be used. Say what you saw.">
                <Textarea id="id-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              {confirmId.isError && <p role="alert" className="text-destructive">{fail(confirmId.error, 'That didn’t save.')}</p>}
              <Button size="sm" variant="outline" disabled={reason.trim().length < 10} loading={confirmId.isPending} onClick={() => confirmId.mutate()}>Mark ID as checked</Button>
            </div>
          )}

          <div className="space-y-1 border-t border-border pt-3">
            <p className="font-semibold">Offer to sign</p>
            {!offer ? (
              <p className="text-muted-foreground">{q.data.stage === 'ready' || q.data.stage === 'documents' || q.data.stage === 'payout' ? 'Signed.' : 'Opens once the agreement and NDA are published.'}</p>
            ) : offer.expired ? (
              <>
                <p className="flex items-center gap-2 text-warning"><AlertTriangle className="h-4 w-4" /> Ended {formatDate(offer.expiresAt)}{offer.reissueRequestedAt ? ` · partner asked for a new copy ${formatDate(offer.reissueRequestedAt)}` : ''}</p>
                <Button size="sm" loading={resend.isPending} onClick={() => resend.mutate()}>Send again</Button>
              </>
            ) : (
              <p className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" /> Sign by {formatDate(offer.expiresAt)} · {offer.daysLeft} day{offer.daysLeft === 1 ? '' : 's'} left</p>
            )}
          </div>

          {payoutHold && (
            <div className="space-y-2 rounded-lg bg-warning/10 p-3">
              <p className="font-semibold text-warning">Payouts on hold since {formatDate(payoutHold.since)}{payoutHold.reason === 'deceased' ? ' (estate)' : ' (can’t reach partner)'}</p>
              {payoutHold.reason === 'deceased' && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Field label="Check payable to" htmlFor="estate-payee"><Input id="estate-payee" placeholder="Estate of …" value={payee.payableTo} onChange={(e) => setPayee({ ...payee, payableTo: e.target.value })} /></Field>
                  <Field label="Mailing address" htmlFor="estate-address"><Input id="estate-address" value={payee.mailingAddress} onChange={(e) => setPayee({ ...payee, mailingAddress: e.target.value })} /></Field>
                </div>
              )}
              {release.isError && <p role="alert" className="text-destructive">{fail(release.error, 'That didn’t go through.')}</p>}
              <Button size="sm" variant="outline" loading={release.isPending} onClick={() => release.mutate()}>Release payouts</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="min-w-0 space-y-5">
        <Card>
          <CardHeader><CardTitle className="text-base">Emergency contacts</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {profile?.emergencyContacts?.length ? (
              <ul className="space-y-2">
                {profile.emergencyContacts.map((c, i) => (
                  <li key={i}>
                    <span className="font-medium">{c.name}</span> <span className="text-muted-foreground">({c.relation})</span> · <a className="text-primary hover:underline" href={`tel:${c.phone}`}>{c.phone}</a>
                    {c.confirmation && <Badge tone={c.confirmation.status === 'confirmed' ? 'success' : c.confirmation.status === 'pending' ? 'warning' : 'destructive'} className="ms-2">{c.confirmation.status === 'confirmed' ? 'Confirmed' : c.confirmation.status === 'pending' ? 'Not confirmed yet' : c.confirmation.status === 'declined' ? 'Declined' : 'Text failed'}</Badge>}
                  </li>
                ))}
                {profile.representative && <li>Representative: <span className="font-medium">{profile.representative.name}</span> ({profile.representative.relation}) · <a className="text-primary hover:underline" href={`tel:${profile.representative.phone}`}>{profile.representative.phone}</a></li>}
              </ul>
            ) : (
              <p className="text-muted-foreground">None on file yet.</p>
            )}
            {profile?.residency === 'visa' && profile.visaExpiry && <p className="text-muted-foreground">On a visa until {formatDate(profile.visaExpiry)}</p>}
            <p className="text-xs text-muted-foreground">Last opened their portal: {q.data.lastSeenAt ? formatDate(q.data.lastSeenAt) : 'never'}</p>
          </CardContent>
        </Card>
        <StartReturn partnerId={partnerId} cars={cars.filter((c) => !c.endedAt)} />
      </div>
    </div>
  );
}

function StartReturn({ partnerId, cars }: { partnerId: string; cars: { _id: string; year: number; make: string; model: string }[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [why, setWhy] = useState<ReturnReason>('partner_request');
  const [note, setNote] = useState('');
  const [reporter, setReporter] = useState({ name: '', phone: '', relation: '' });
  const open = useMutation({
    meta: { silentError: true },
    mutationFn: () => manage.open(partnerId, { reason: why, note: note.trim() || undefined, reportedBy: why === 'deceased' ? reporter : undefined }),
    onSuccess: (r) => router.push(`/ops/partners/returns/${r._id}`),
  });
  const COPY: Record<ReturnReason, string> = {
    partner_request: 'They asked by phone or email. Logged as their request.',
    unresponsive: 'The car keeps running and earning as normal. They get a notice, and their payouts are held until they get in touch. The car isn’t returned.',
    deceased: 'The car keeps taking bookings and earning. Payouts are held for the estate. The car goes back only when the estate asks, once its papers are checked. No messages go to the partner’s account.',
  };
  if (cars.length === 0) return null;
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Undo2 className="h-4 w-4" /> Start a return</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Field label="Why" htmlFor="ret-why">
          <Select id="ret-why" value={why} onChange={(e) => setWhy(e.target.value as ReturnReason)}>
            <option value="partner_request">Partner asked for their car back</option>
            <option value="unresponsive">We can’t reach the partner</option>
            <option value="deceased">The partner passed away</option>
          </Select>
        </Field>
        <p className="text-muted-foreground">{COPY[why]}</p>
        {why === 'deceased' && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Field label="Who told us" htmlFor="rep-name"><Input id="rep-name" value={reporter.name} onChange={(e) => setReporter({ ...reporter, name: e.target.value })} /></Field>
            <Field label="Their phone" htmlFor="rep-phone"><Input id="rep-phone" type="tel" value={reporter.phone} onChange={(e) => setReporter({ ...reporter, phone: e.target.value })} /></Field>
            <Field label="Relation" htmlFor="rep-rel"><Input id="rep-rel" value={reporter.relation} onChange={(e) => setReporter({ ...reporter, relation: e.target.value })} /></Field>
          </div>
        )}
        <Field label="Note (optional)" htmlFor="ret-note"><Input id="ret-note" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <p className="text-xs text-muted-foreground">Covers all {cars.length} car{cars.length === 1 ? '' : 's'}: {cars.map((c) => `${c.year} ${c.make} ${c.model}`).join(', ')}.</p>
        {open.isError && <p role="alert" className="text-destructive">{fail(open.error, 'That didn’t start.')}</p>}
        <Button
          variant={why === 'partner_request' ? 'primary' : 'destructive'}
          loading={open.isPending}
          onClick={async () => { if (await confirm({ title: 'Start this return?', description: COPY[why], confirmLabel: 'Start', tone: why === 'partner_request' ? 'default' : 'destructive' })) open.mutate(); }}
        >
          <CheckCircle2 className="h-4 w-4" /> Start return
        </Button>
      </CardContent>
    </Card>
  );
}
