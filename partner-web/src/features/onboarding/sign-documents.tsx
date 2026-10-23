'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, FileSignature, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { assetPartnerApi, type PartnerOnboarding, type SignableDocument } from '@/features/asset-partners/api';
import { US_STATES } from '@/lib/data/us-states';
import { ApiError } from '@/lib/api/types';
import { cn } from '@/lib/utils/cn';

const BLANK = '________';
// The server already filled what it knows; only the details typed on this screen are still placeholders.
const fill = (body: string, values: Record<string, string>) =>
  body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, k: string) => (values[k]?.trim() ? values[k] : BLANK));

function DocumentText({ doc, values, read, onRead }: { doc: SignableDocument; values: Record<string, string>; read: boolean; onRead: () => void }) {
  const text = useMemo(() => fill(doc.body, values), [doc.body, values]);
  const box = useRef<HTMLElement>(null);
  // A text short enough to need no scrolling counts as read.
  useEffect(() => {
    const el = box.current;
    if (el && el.scrollHeight <= el.clientHeight + 24) onRead();
  }, [doc.version, onRead]);
  return (
    <div>
      <article
        ref={box}
        className="max-h-[26rem] overflow-y-auto rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed sm:p-5"
        tabIndex={0}
        aria-label={doc.title}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) onRead();
        }}
      >
        <h3 className="mb-3 text-base font-bold">{doc.title}</h3>
        <div className="whitespace-pre-wrap break-words">{text}</div>
        <p className="mt-4 text-xs text-muted-foreground">Version {doc.version}</p>
      </article>
      <p className={cn('mt-2 flex items-center gap-1.5 text-xs', read ? 'text-success' : 'text-muted-foreground')}>
        {read ? <><Check className="h-3.5 w-3.5" /> Read to the end</> : 'Scroll to the end to continue'}
      </p>
    </div>
  );
}

export function SignDocuments({ data, onDone }: { data: PartnerOnboarding; onDone: () => void }) {
  const prefill = data.prefill ?? {};
  const [tab, setTab] = useState<'agreement' | 'nda'>('agreement');
  const [read, setRead] = useState({ agreement: false, nda: false });
  const [licenceNumber, setLicenceNumber] = useState('');
  const [licenceState, setLicenceState] = useState('TX');
  const [method, setMethod] = useState<'zelle' | 'check'>('zelle');
  const [zelleHandle, setZelleHandle] = useState(prefill.partner_email ?? '');
  const [zelleName, setZelleName] = useState(prefill.partner_name ?? '');
  const [payableTo, setPayableTo] = useState(prefill.partner_name ?? '');
  const [mailingAddress, setMailingAddress] = useState(prefill.partner_address ?? '');
  const [signedName, setSignedName] = useState('');
  const [accepts, setAccepts] = useState({ agreement: false, nda: false, deductibles: false });
  const markRead = useCallback(() => setRead((r) => (r[tab] ? r : { ...r, [tab]: true })), [tab]);

  const sign = useMutation({
    meta: { silentError: true },
    mutationFn: () =>
      assetPartnerApi.signDocuments({
        agreementVersion: data.agreement!.version,
        ndaVersion: data.nda!.version,
        signedName,
        licenceNumber,
        licenceState,
        payout: method === 'zelle' ? { method, zelleHandle, zelleName } : { method, payableTo, mailingAddress },
        acceptAgreement: true,
        acceptNda: true,
        acknowledgeDeductibles: true,
      }),
    onSuccess: onDone,
  });

  if (!data.agreement || !data.nda) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 p-5 sm:p-6">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success/10 text-success"><Check className="h-5 w-5" /></span>
          <div>
            <h2 className="text-lg font-bold">You’re approved</h2>
            <p className="text-sm text-muted-foreground">Your agreement and NDA are being prepared. We’ll email you as soon as they’re ready to sign.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const last4 = licenceNumber.replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase();
  const values: Record<string, string> = {
    licence: last4.length === 4 ? `${licenceState} •••• ${last4}` : '',
    payout_method: method === 'zelle' ? 'Zelle' : 'Mailed check',
    zelle_handle: method === 'zelle' ? zelleHandle : '',
    zelle_name: method === 'zelle' ? zelleName : '',
    check_payable_to: method === 'check' ? payableTo : '',
    check_address: method === 'check' ? mailingAddress : '',
    signed_name: signedName,
  };
  const payoutOk = method === 'zelle' ? zelleHandle.trim().length >= 5 && zelleName.trim().length >= 2 : payableTo.trim().length >= 2 && mailingAddress.trim().length >= 8;
  const ready = read.agreement && read.nda && licenceNumber.replace(/[^A-Za-z0-9]/g, '').length >= 4 && payoutOk && signedName.trim().length >= 2 && accepts.agreement && accepts.nda && accepts.deductibles;
  const doc = tab === 'agreement' ? data.agreement : data.nda;

  return (
    <Card>
      <CardContent className="space-y-6 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><FileSignature className="h-5 w-5" /></span>
          <div>
            <h2 className="text-lg font-bold">You’re approved. Sign your documents</h2>
            <p className="text-sm text-muted-foreground">Read both to the end, add the details below, then sign once for both.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(['agreement', 'nda'] as const).map((k) => (
            <Chip key={k} type="button" active={tab === k} onClick={() => setTab(k)}>
              {read[k] && <Check className="me-1 h-3.5 w-3.5" />}
              {k === 'agreement' ? 'Asset Partner Agreement' : 'NDA'}
            </Chip>
          ))}
        </div>
        <DocumentText key={doc.version} doc={doc} values={values} read={read[tab]} onRead={markRead} />

        <section className="space-y-4">
          <h3 className="font-semibold">Your details</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
            <Field label="Driver’s licence number" htmlFor="licence" hint="Only the last 4 digits are kept on the signed copy.">
              <Input id="licence" autoComplete="off" value={licenceNumber} maxLength={30} onChange={(e) => setLicenceNumber(e.target.value)} />
            </Field>
            <Field label="State" htmlFor="licenceState">
              <Select id="licenceState" value={licenceState} onChange={(e) => setLicenceState(e.target.value)}>{US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
            </Field>
          </div>
          <Field label="How should we pay you? (Exhibit B)">
            <div className="flex flex-wrap gap-2">
              <Chip type="button" active={method === 'zelle'} onClick={() => setMethod('zelle')}>Zelle</Chip>
              <Chip type="button" active={method === 'check'} onClick={() => setMethod('check')}>Mailed check</Chip>
            </div>
          </Field>
          {method === 'zelle' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Zelle phone or email" htmlFor="zelleHandle"><Input id="zelleHandle" value={zelleHandle} maxLength={120} onChange={(e) => setZelleHandle(e.target.value)} /></Field>
              <Field label="Name on the Zelle account" htmlFor="zelleName" hint="Must match your name."><Input id="zelleName" value={zelleName} maxLength={120} onChange={(e) => setZelleName(e.target.value)} /></Field>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Check payable to" htmlFor="payableTo"><Input id="payableTo" value={payableTo} maxLength={120} onChange={(e) => setPayableTo(e.target.value)} /></Field>
              <Field label="Mailing address" htmlFor="mailingAddress"><Textarea id="mailingAddress" rows={2} maxLength={300} value={mailingAddress} onChange={(e) => setMailingAddress(e.target.value)} /></Field>
            </div>
          )}
        </section>

        <section className="space-y-3">
          {([
            ['agreement', 'I have read and agree to the Asset Partner Agreement, including its arbitration, class-action and jury-trial waivers.'],
            ['nda', 'I have read and agree to the Non-Disclosure Agreement.'],
            ['deductibles', 'I acknowledge the insurance and deductible summary (Exhibit D), including the per-incident deductible cap and when it does not apply.'],
          ] as const).map(([k, text]) => (
            <label key={k} className="flex cursor-pointer gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked={accepts[k]} onChange={(e) => setAccepts((a) => ({ ...a, [k]: e.target.checked }))} />
              <span>{text}</span>
            </label>
          ))}
          <Field label="Sign by typing your full legal name" htmlFor="signedName" hint="This is your electronic signature on both documents.">
            <Input id="signedName" autoComplete="name" value={signedName} maxLength={120} onChange={(e) => setSignedName(e.target.value)} />
          </Field>
        </section>

        {sign.isError && <p role="alert" className="text-sm text-destructive">{sign.error instanceof ApiError ? sign.error.message : 'We couldn’t record your signature. Try again.'}</p>}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3.5 w-3.5" /> We record your name, the time and your IP with the exact version you signed.</p>
          <Button className="w-full sm:w-auto" disabled={!ready} loading={sign.isPending} onClick={() => sign.mutate()}>Sign both documents</Button>
        </div>
      </CardContent>
    </Card>
  );
}
