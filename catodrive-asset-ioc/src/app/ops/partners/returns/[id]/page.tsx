'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Eye, FileUp, Loader2, ShieldCheck } from 'lucide-react';
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
import { uploadFiles } from '@/features/media/upload';
import { RETURN_STATUS, returnsManageApi, type ContactAttempt, type ReturnDetail } from '@/features/asset-partners/returns-api';
import type { PartnerContact } from '@/features/asset-partners/api';
import { ApiError } from '@/lib/api/types';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { PartnersNav } from '~/features/partners/partners-nav';
import { CarChecklist, HandoverForm } from '~/features/partners/return-checklist';

const manage = returnsManageApi('/ioc');
const fail = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

const CHANNEL: Record<ContactAttempt['channel'], string> = { call: 'Call', text: 'Text', email: 'Email', letter: 'Letter', visit: 'Visit' };
const TO: Record<ContactAttempt['to'], string> = { partner: 'Partner', emergency_contact: 'Emergency contact', representative: 'Representative' };
const OUTCOME: Record<ContactAttempt['outcome'], string> = { no_answer: 'No answer', left_message: 'Left a message', reached: 'Reached them', bounced: 'Bounced', wrong_number: 'Wrong number' };
const DOC_KIND = { death_certificate: 'Death certificate', authority: 'Authority to act for the estate', other: 'Other paper' } as const;

function ContactLine({ c, label }: { c: PartnerContact; label: string }) {
  return (
    <li className="text-sm">
      <span className="font-medium">{c.name}</span> <span className="text-muted-foreground">({c.relation || label})</span>
      <span className="block text-xs text-muted-foreground"><a className="text-primary hover:underline" href={`tel:${c.phone}`}>{c.phone}</a>{c.email ? ` · ${c.email}` : ''}</span>
    </li>
  );
}

function Blockers({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1 rounded-lg bg-warning/10 p-3 text-sm text-warning" role="status">
      {items.map((b) => <li key={b} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{b}</li>)}
    </ul>
  );
}

function Attempts({ d, onChange }: { d: ReturnDetail; onChange: (x: ReturnDetail) => void }) {
  const [form, setForm] = useState<Omit<ContactAttempt, 'at' | 'by'>>({ channel: 'call', to: 'partner', outcome: 'no_answer', note: '' });
  const log = useMutation({ meta: { silentError: true }, mutationFn: () => manage.logAttempt(d._id, { ...form, note: form.note?.trim() || undefined }), onSuccess: (x) => { onChange(x); setForm({ ...form, note: '' }); } });
  const open = !['completed', 'cancelled'].includes(d.status);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Attempts to reach them <span className="font-normal text-muted-foreground tabular-nums">({d.attempts.length} of {d.rules.minAttempts} needed)</span></CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {d.noticeEndsAt && <p className="text-sm text-muted-foreground">Formal notice sent {d.noticeSentAt ? formatDate(d.noticeSentAt) : ''}. They have until {formatDate(d.noticeEndsAt)} to reply.</p>}
        {d.attempts.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {d.attempts.map((a, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 p-3 text-sm">
                <span>{CHANNEL[a.channel]} to {TO[a.to].toLowerCase()} · <span className={a.outcome === 'reached' ? 'font-medium text-success' : ''}>{OUTCOME[a.outcome]}</span>{a.note ? ` · ${a.note}` : ''}</span>
                <span className="text-xs text-muted-foreground">{formatDateTime(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
        {open && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="How" htmlFor="att-channel"><Select id="att-channel" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as ContactAttempt['channel'] })}>{Object.entries(CHANNEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Who" htmlFor="att-to"><Select id="att-to" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value as ContactAttempt['to'] })}>{Object.entries(TO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="What happened" htmlFor="att-outcome"><Select id="att-outcome" value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value as ContactAttempt['outcome'] })}>{Object.entries(OUTCOME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Note (optional)" htmlFor="att-note" className="sm:col-span-3"><Input id="att-note" maxLength={500} value={form.note ?? ''} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
            {log.isError && <p role="alert" className="text-sm text-destructive sm:col-span-3">{fail(log.error, 'That didn’t save.')}</p>}
            <div className="flex justify-end sm:col-span-3"><Button size="sm" loading={log.isPending} onClick={() => log.mutate()}>Log attempt</Button></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Estate({ d, onChange }: { d: ReturnDetail; onChange: (x: ReturnDetail) => void }) {
  const toast = useToast();
  const [c, setC] = useState<PartnerContact>(d.estate?.contact ?? { name: '', phone: '', relation: '', email: '' });
  const [kind, setKind] = useState<keyof typeof DOC_KIND>('death_certificate');
  const [uploading, setUploading] = useState(false);
  const save = useMutation({ meta: { silentError: true }, mutationFn: () => manage.setEstateContact(d._id, { ...c, email: c.email?.trim() || undefined }), onSuccess: (x) => { onChange(x); toast({ tone: 'success', title: 'Estate contact saved' }); } });
  const verify = useMutation({ mutationFn: (i: number) => manage.verifyEstateDocument(d._id, i), onSuccess: onChange, onError: (e) => toast({ tone: 'error', title: fail(e, 'That didn’t save.') }) });
  const view = async (i: number) => {
    try {
      const { url } = await manage.viewEstateDocument(d._id, i);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      toast({ tone: 'error', title: fail(e, 'We couldn’t open that paper.') });
    }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const [up] = await uploadFiles('partner_exit', [file]);
      onChange(await manage.addEstateDocument(d._id, { kind, key: up.key }));
    } catch (e) {
      toast({ tone: 'error', title: fail(e, e instanceof Error ? e.message : 'That didn’t upload.') });
    } finally {
      setUploading(false);
    }
  };
  const open = !['completed', 'cancelled'].includes(d.status);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">The estate</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        {d.reportedBy && <p className="text-sm text-muted-foreground">Told to us by {d.reportedBy.name} ({d.reportedBy.relation}), <a className="text-primary hover:underline" href={`tel:${d.reportedBy.phone}`}>{d.reportedBy.phone}</a>.</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Estate representative’s name" htmlFor="es-name"><Input id="es-name" disabled={!open} value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field>
          <Field label="Role" htmlFor="es-rel" hint="For example: executor, administrator, next of kin"><Input id="es-rel" disabled={!open} value={c.relation} onChange={(e) => setC({ ...c, relation: e.target.value })} /></Field>
          <Field label="Phone" htmlFor="es-phone"><Input id="es-phone" type="tel" disabled={!open} value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} /></Field>
          <Field label="Email (optional)" htmlFor="es-email"><Input id="es-email" type="email" disabled={!open} value={c.email ?? ''} onChange={(e) => setC({ ...c, email: e.target.value })} /></Field>
        </div>
        {save.isError && <p role="alert" className="text-sm text-destructive">{fail(save.error, 'That didn’t save.')}</p>}
        {open && <div className="flex justify-end"><Button size="sm" variant="outline" loading={save.isPending} onClick={() => save.mutate()}>Save representative</Button></div>}

        <div className="space-y-2">
          <p className="text-label font-semibold">Papers</p>
          <p className="text-xs text-muted-foreground">A death certificate and a paper showing who can act for the estate (letters testamentary, letters of administration or a small-estate affidavit). Someone other than the uploader checks each one.</p>
          {(d.estate?.documents ?? []).length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {d.estate!.documents.map((doc) => (
                <li key={doc.index} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span>{DOC_KIND[doc.kind]} <span className="text-xs text-muted-foreground">· {formatDate(doc.uploadedAt)}</span></span>
                  <span className="flex items-center gap-2">
                    {doc.verified ? <Badge tone="success">Checked</Badge> : <Badge tone="warning">Not checked</Badge>}
                    <Button size="sm" variant="ghost" onClick={() => void view(doc.index)} aria-label={`Open ${DOC_KIND[doc.kind]}`}><Eye className="h-4 w-4" /></Button>
                    {!doc.verified && open && <Button size="sm" variant="outline" loading={verify.isPending && verify.variables === doc.index} onClick={() => verify.mutate(doc.index)}><ShieldCheck className="h-4 w-4" /> Mark checked</Button>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {open && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Field label="Paper" htmlFor="es-kind" className="sm:w-72"><Select id="es-kind" value={kind} onChange={(e) => setKind(e.target.value as keyof typeof DOC_KIND)}>{Object.entries(DOC_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
              <label className="inline-flex">
                <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
                <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border border-border px-4 text-sm font-medium hover:bg-accent">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Upload</span>
              </label>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Schedule({ d, onChange }: { d: ReturnDetail; onChange: (x: ReturnDetail) => void }) {
  const runners = useQuery({ queryKey: ['ioc-return-runners'], queryFn: () => manage.runners() });
  const [date, setDate] = useState(d.scheduledFor ? new Date(d.scheduledFor).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) : d.preferredDate ? new Date(d.preferredDate).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) : today());
  const [runner, setRunner] = useState(d.runner?.staffId ?? '');
  const go = useMutation({ meta: { silentError: true }, mutationFn: () => manage.schedule(d._id, { scheduledFor: new Date(`${date}T12:00:00`).toISOString(), runnerStaffId: runner || undefined }), onSuccess: onChange });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{d.status === 'scheduled' ? 'Change the date or runner' : 'Book the return'}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Blockers items={d.scheduleBlockers} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Return date" htmlFor="sch-date"><Input id="sch-date" type="date" min={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Runner" htmlFor="sch-runner" hint={runners.data?.length === 0 ? 'No Captains on your team yet. Invite one under Team.' : 'The Captain who goes to the car.'}>
            <Select id="sch-runner" value={runner} onChange={(e) => setRunner(e.target.value)}>
              <option value="">I’ll do it myself</option>
              {(runners.data ?? []).map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
            </Select>
          </Field>
        </div>
        {!runner && d.rules.separateApprover && <p className="text-xs text-muted-foreground">If you do the checklist yourself, someone else on the team approves it.</p>}
        {go.isError && <p role="alert" className="text-sm text-destructive">{fail(go.error, 'That didn’t save.')}</p>}
        <div className="flex justify-end"><Button disabled={d.scheduleBlockers.length > 0 || !date} loading={go.isPending} onClick={() => go.mutate()}>{d.status === 'scheduled' ? 'Save changes' : 'Book return'}</Button></div>
      </CardContent>
    </Card>
  );
}

function Approve({ d, onChange }: { d: ReturnDetail; onChange: (x: ReturnDetail) => void }) {
  const [note, setNote] = useState('');
  const [back, setBack] = useState('');
  const confirm = useConfirm();
  const approve = useMutation({ meta: { silentError: true }, mutationFn: () => manage.approve(d._id, note.trim() || undefined), onSuccess: onChange });
  const sendBack = useMutation({ meta: { silentError: true }, mutationFn: () => manage.sendBack(d._id, back.trim()), onSuccess: (x) => { setBack(''); onChange(x); } });
  const h = d.handover;
  return (
    <Card className="border-warning/40">
      <CardHeader><CardTitle className="text-base">Approve the return</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {h && (
          <dl className="grid grid-cols-1 gap-2 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-muted-foreground">Handed to</dt><dd className="font-medium">{h.to === 'storage' ? 'Storage' : `${h.receiverName} (${h.to})`}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Where</dt><dd>{h.location}</dd></div>
            <div><dt className="text-xs text-muted-foreground">When</dt><dd>{formatDateTime(h.at)}</dd></div>
            {h.to !== 'storage' && <div className="sm:col-span-3"><dt className="text-xs text-muted-foreground">Signed</dt><dd className="font-display italic">{h.receiverSignature}</dd></div>}
          </dl>
        )}
        <Blockers items={d.approveBlockers} />
        <p className="text-sm text-muted-foreground">Approving takes the cars off the programme, removes them from CatoDrive’s toll account, and ends the partnership if no car is left. The final month is paid on the usual payout day.</p>
        <Field label="Note (optional)" htmlFor="ap-note"><Input id="ap-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {approve.isError && <p role="alert" className="text-sm text-destructive">{fail(approve.error, 'That didn’t go through.')}</p>}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            disabled={d.approveBlockers.length > 0}
            loading={approve.isPending}
            onClick={async () => { if (await confirm({ title: 'Approve this return?', description: 'The cars leave the programme. This can’t be undone from here.', confirmLabel: 'Approve' })) approve.mutate(); }}
          >
            Approve return
          </Button>
        </div>
        <div className="space-y-2 border-t border-border pt-4">
          <Field label="Or send it back to the runner" htmlFor="ap-back" hint="Say what needs fixing."><Textarea id="ap-back" rows={2} maxLength={500} value={back} onChange={(e) => setBack(e.target.value)} /></Field>
          {sendBack.isError && <p role="alert" className="text-sm text-destructive">{fail(sendBack.error, 'That didn’t go through.')}</p>}
          <div className="flex justify-end"><Button variant="outline" disabled={back.trim().length < 5} loading={sendBack.isPending} onClick={() => sendBack.mutate()}>Send back</Button></div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReturnCasePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['ioc-return', id], queryFn: () => manage.detail(id) });
  const set = (x: ReturnDetail) => {
    qc.setQueryData(['ioc-return', id], x);
    void qc.invalidateQueries({ queryKey: ['admin-list', '/ioc/asset-partner-exits'] });
    void qc.invalidateQueries({ queryKey: ['ioc-attention'] });
  };
  const start = useMutation({ mutationFn: () => manage.start(id), onSuccess: set, onError: (e) => toast({ tone: 'error', title: fail(e, 'That didn’t start.') }) });
  const cancel = useMutation({ mutationFn: (reason: string) => manage.cancel(id, reason), onSuccess: set, onError: (e) => toast({ tone: 'error', title: fail(e, 'That didn’t go through.') }) });
  const [cancelReason, setCancelReason] = useState('');

  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-96 w-full" /></div>;
  if (q.isError || !q.data) return <ErrorState message="We couldn’t load this return." retry={() => void q.refetch()} />;
  const d = q.data;
  const s = RETURN_STATUS[d.status];
  const open = !['completed', 'cancelled'].includes(d.status);
  const selfRunner = !d.runner?.staffId;
  const allowed = d.reason === 'deceased' ? (['estate', 'storage'] as const) : d.reason === 'unresponsive' ? (['representative', 'owner', 'storage'] as const) : (['owner', 'representative'] as const);

  return (
    <div className="space-y-5">
      <Link href="/ops/partners/returns" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Returns</Link>
      <PageHeader eyebrow={d.reference} title={d.partner.displayName} description={d.reasonLabel} actions={<Badge tone={s.tone}>{s.label}</Badge>} />
      <PartnersNav />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {['requested', 'notice', 'scheduled'].includes(d.status) && <Schedule d={d} onChange={set} />}
          {d.status === 'scheduled' && selfRunner && (
            <Card><CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm">You’re the runner. Start when you’re at the car; it comes off the marketplace straight away.</p>
              <Button loading={start.isPending} onClick={() => start.mutate()}>Start the return</Button>
            </CardContent></Card>
          )}
          {d.status === 'submitted' && <Approve d={d} onChange={set} />}
          {d.sentBack && d.status === 'in_progress' && <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">Sent back: {d.sentBack.reason}</p>}

          {['in_progress', 'submitted', 'completed'].includes(d.status) && (
            <Card>
              <CardHeader><CardTitle className="text-base">Checklist{d.runner ? ` · ${d.runner.name}` : ''}</CardTitle></CardHeader>
              <CardContent className="space-y-8">
                {d.cars.map((car) => (
                  <CarChecklist key={car.vehicleId} car={car} photoMin={d.rules.photoMin} editable={d.status === 'in_progress' && selfRunner} onPatch={async (patch) => set(await manage.updateCar(id, car.vehicleId, patch))} />
                ))}
                {d.status === 'in_progress' && selfRunner && (
                  <div className="border-t border-border pt-5">
                    <HandoverForm defaultName={d.reason === 'deceased' ? d.estate?.contact?.name : d.reason === 'partner_request' ? d.partner.displayName : d.partner.profile?.representative?.name} allowed={[...allowed]} onSubmit={async (input) => set(await manage.submit(id, input))} />
                  </div>
                )}
                {d.status === 'in_progress' && !selfRunner && <p className="text-sm text-muted-foreground">{d.runner?.name} is filling this in from their Captain screen.</p>}
              </CardContent>
            </Card>
          )}

          {d.reason === 'unresponsive' && <Attempts d={d} onChange={set} />}
          {d.reason === 'deceased' && <Estate d={d} onChange={set} />}
        </div>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader><CardTitle className="text-base">Partner</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p><Link className="font-medium text-primary hover:underline" href={`/ops/partners/members/${d.partner._id}`}>{d.partner.displayName}</Link></p>
              {d.partner.phone && <p><a className="text-primary hover:underline" href={`tel:${d.partner.phone}`}>{d.partner.phone}</a></p>}
              {d.partner.email && <p className="break-all text-muted-foreground">{d.partner.email}</p>}
              <p className="text-xs text-muted-foreground">Last opened their portal: {d.partner.lastSeenAt ? formatDate(d.partner.lastSeenAt) : 'never'}</p>
              {d.partner.payoutHold && <Badge tone="warning">Payouts on hold</Badge>}
              {d.partnerNote && <p className="rounded-lg bg-muted/50 p-3">“{d.partnerNote}”</p>}
              {d.handoverPreference && <p>Handover: {d.handoverPreference === 'deliver' ? `bring to ${d.deliveryAddress}` : 'partner collects'}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Emergency contacts</CardTitle></CardHeader>
            <CardContent>
              {d.partner.profile?.emergencyContacts?.length ? (
                <ul className="space-y-3">
                  {d.partner.profile.emergencyContacts.map((c, i) => <ContactLine key={i} c={c} label="Emergency contact" />)}
                  {d.partner.profile.representative && <ContactLine c={d.partner.profile.representative} label="Representative" />}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">None on file.</p>
              )}
              {d.partner.profile?.residency === 'visa' && d.partner.profile.visaExpiry && <p className="mt-3 text-xs text-muted-foreground">On a visa until {formatDate(d.partner.profile.visaExpiry)}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm">
                {[...d.events].reverse().map((e, i) => (
                  <li key={i}><span className="font-medium">{e.type.replace(/_/g, ' ')}</span>{e.detail ? ` · ${e.detail}` : ''}<span className="block text-xs text-muted-foreground">{formatDateTime(e.at)}</span></li>
                ))}
              </ol>
            </CardContent>
          </Card>
          {open && (
            <Card>
              <CardHeader><CardTitle className="text-base">Cancel this return</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Textarea aria-label="Why it’s being cancelled" rows={2} maxLength={500} placeholder="Why" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                {d.status === 'in_progress' && <p className="text-xs text-muted-foreground">The car is already off the marketplace; relist it from Listings if it stays with us.</p>}
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={cancelReason.trim().length < 5}
                  loading={cancel.isPending}
                  onClick={async () => { if (await confirm({ title: 'Cancel this return?', tone: 'destructive', confirmLabel: 'Cancel return' })) cancel.mutate(cancelReason.trim()); }}
                >
                  Cancel return
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
