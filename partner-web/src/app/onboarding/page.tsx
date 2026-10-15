'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, FileSignature, Mail, XCircle } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { eligibilityApi } from '@/features/account/eligibility-api';
import { assetPartnerApi, type OnboardingStage, type PartnerOnboarding } from '@/features/asset-partners/api';
import { ApiError } from '@/lib/api/types';
import { formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { ApplicationForm } from '~/features/onboarding/application-form';

const TRACK: { label: string; stages: OnboardingStage[] }[] = [
  { label: 'Email', stages: ['verify_email'] },
  { label: 'Application', stages: ['apply', 'changes', 'rejected'] },
  { label: 'Review', stages: ['review'] },
  { label: 'Agreement', stages: ['agreement'] },
  { label: 'Payout', stages: ['payout'] },
];

const failMessage = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

function Tracker({ stage }: { stage: OnboardingStage }) {
  const at = TRACK.findIndex((t) => t.stages.includes(stage));
  return (
    <ol className="grid grid-cols-5 gap-1.5 sm:gap-3" aria-label="Getting started">
      {TRACK.map((t, i) => (
        <li key={t.label} className="min-w-0">
          <div className={cn('h-1.5 rounded-full', i < at ? 'bg-primary' : i === at ? 'bg-primary/60' : 'bg-muted')} />
          <p className={cn('mt-2 truncate text-[11px] font-semibold sm:text-xs', i === at ? 'text-primary' : i < at ? 'text-foreground' : 'text-muted-foreground')}>
            {i < at && <Check className="me-1 inline h-3 w-3" />}
            {t.label}
          </p>
        </li>
      ))}
    </ol>
  );
}

function VerifyEmail({ email, onDone }: { email?: string; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string>();
  const send = useMutation({
    meta: { silentError: true },
    mutationFn: () => eligibilityApi.send('email'),
    onSuccess: (r) => setDevCode(r.devCode),
  });
  const confirm = useMutation({ meta: { silentError: true }, mutationFn: () => eligibilityApi.confirm('email', code.trim()), onSuccess: onDone });

  return (
    <Card>
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Mail className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold">Confirm your email</h2>
            <p className="break-words text-sm text-muted-foreground">We’ll send a 6-digit code to {email ?? 'your email'}.</p>
          </div>
        </div>
        {!send.isSuccess ? (
          <Button className="w-full sm:w-auto" loading={send.isPending} onClick={() => send.mutate()}>Send code</Button>
        ) : (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (code.trim().length === 6) confirm.mutate(); }}>
            {devCode && <p className="rounded-xl bg-warning/10 p-3 text-sm">Email isn’t set up on this server, so here’s your code: <span className="font-mono font-bold">{devCode}</span></p>}
            <Field label="Code" htmlFor="code" error={confirm.isError ? failMessage(confirm.error, 'That code didn’t work') : undefined}>
              <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            </Field>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" className="w-full sm:w-auto" disabled={code.length !== 6} loading={confirm.isPending}>Confirm</Button>
              <Button type="button" variant="ghost" disabled={send.isPending} onClick={() => send.mutate()}>Send a new code</Button>
            </div>
          </form>
        )}
        {send.isError && <p role="alert" className="text-sm text-destructive">{failMessage(send.error, 'We couldn’t send the code. Try again.')}</p>}
      </CardContent>
    </Card>
  );
}

function InReview({ data }: { data: PartnerOnboarding }) {
  const app = data.application!;
  return (
    <Card>
      <CardContent className="space-y-4 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warning/10 text-warning"><Clock className="h-5 w-5" /></span>
          <div>
            <h2 className="text-lg font-bold">We’re reviewing your application</h2>
            <p className="text-sm text-muted-foreground">A partner manager will contact you to arrange the inspection. We’ll email you at every step.</p>
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-3 rounded-2xl bg-muted/50 p-4 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-muted-foreground">Reference</dt><dd className="font-mono font-semibold">{app.reference}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Car</dt><dd className="font-medium">{app.vehicle.year} {app.vehicle.make} {app.vehicle.model}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Sent</dt><dd className="font-medium">{formatDate(app.createdAt)}</dd></div>
        </dl>
      </CardContent>
    </Card>
  );
}

function Agreement({ data, onDone }: { data: PartnerOnboarding; onDone: () => void }) {
  const [name, setName] = useState('');
  const [accepted, setAccepted] = useState(false);
  const sign = useMutation({ meta: { silentError: true }, mutationFn: () => assetPartnerApi.signAgreement(data.agreement!.version, name), onSuccess: onDone });

  if (!data.agreement) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 p-5 sm:p-6">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success/10 text-success"><Check className="h-5 w-5" /></span>
          <div>
            <h2 className="text-lg font-bold">You’re approved</h2>
            <p className="text-sm text-muted-foreground">Your partner agreement is being prepared. We’ll email you as soon as it’s ready to sign.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><FileSignature className="h-5 w-5" /></span>
          <div>
            <h2 className="text-lg font-bold">You’re approved. Sign your agreement</h2>
            <p className="text-sm text-muted-foreground">Read it through, then sign by typing your full legal name.</p>
          </div>
        </div>
        <article className="max-h-[28rem] overflow-y-auto rounded-2xl border border-border bg-muted/30 p-4 text-sm leading-relaxed sm:p-5" tabIndex={0} aria-label="Agreement text">
          <h3 className="mb-3 text-base font-bold">{data.agreement.title}</h3>
          <div className="whitespace-pre-wrap break-words">{data.agreement.body}</div>
          <p className="mt-4 text-xs text-muted-foreground">Version {data.agreement.version}</p>
        </article>
        <Field label="Full legal name" htmlFor="signedName" hint="This is your electronic signature.">
          <Input id="signedName" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <label className="flex cursor-pointer gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          <span>I have read and agree to the {data.agreement.title}, and I’m signing it electronically.</span>
        </label>
        {sign.isError && <p role="alert" className="text-sm text-destructive">{failMessage(sign.error, 'We couldn’t record your signature. Try again.')}</p>}
        <Button className="w-full sm:w-auto" disabled={!accepted || name.trim().length < 2} loading={sign.isPending} onClick={() => sign.mutate()}>Sign agreement</Button>
      </CardContent>
    </Card>
  );
}

function Payout({ method, onDone }: { method: 'check' | 'zelle'; onDone: () => void }) {
  const [value, setValue] = useState('');
  const save = useMutation({
    meta: { silentError: true },
    mutationFn: () => assetPartnerApi.setPayoutDetails(method === 'zelle' ? { zelleHandle: value.trim() } : { mailingAddress: value.trim() }),
    onSuccess: onDone,
  });
  return (
    <Card>
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div>
          <h2 className="text-lg font-bold">Where should we send your earnings?</h2>
          <p className="text-sm text-muted-foreground">{method === 'zelle' ? 'We pay monthly by Zelle.' : 'We pay monthly by check.'} You can change this later in your profile.</p>
        </div>
        {method === 'zelle' ? (
          <Field label="Zelle email or phone" htmlFor="zelle"><Input id="zelle" value={value} maxLength={120} onChange={(e) => setValue(e.target.value)} /></Field>
        ) : (
          <Field label="Mailing address for checks" htmlFor="mailing"><Textarea id="mailing" rows={3} maxLength={300} value={value} onChange={(e) => setValue(e.target.value)} /></Field>
        )}
        {save.isError && <p role="alert" className="text-sm text-destructive">{failMessage(save.error, 'We couldn’t save that. Try again.')}</p>}
        <Button className="w-full sm:w-auto" disabled={value.trim().length < 5} loading={save.isPending} onClick={() => save.mutate()}>Save and open my dashboard</Button>
      </CardContent>
    </Card>
  );
}

function GettingStarted() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['partner-onboarding'], queryFn: () => assetPartnerApi.onboarding() });
  const [reapply, setReapply] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ['partner-onboarding'] });

  useEffect(() => {
    if (q.data?.stage === 'ready') router.replace('/dashboard');
  }, [q.data?.stage, router]);

  if (q.isLoading || q.data?.stage === 'ready') return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (q.isError || !q.data) return <ErrorState message="We couldn’t load your progress." retry={() => q.refetch()} />;
  const data = q.data;
  const app = data.application;
  const sent = () => {
    toast({ tone: 'success', title: 'Application sent', description: 'We’ll review it and email you.' });
    setReapply(false);
    void refresh();
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="display text-3xl sm:text-4xl">{data.partner ? `Welcome, ${data.partner.displayName}` : 'Become a CatoDrive partner'}</h1>
        <p className="text-muted-foreground">Finish these steps and your partner dashboard opens.</p>
      </header>
      <Tracker stage={data.stage} />

      {data.stage === 'verify_email' && <VerifyEmail email={data.email} onDone={() => void refresh()} />}
      {(data.stage === 'apply' || (data.stage === 'rejected' && reapply)) && (
        <ApplicationForm mode="partner" initial={data.stage === 'rejected' ? app : undefined} draftKey="cd-partner-application" onSubmit={(input) => assetPartnerApi.submitApplication(input).then(sent)} />
      )}
      {data.stage === 'changes' && app && (
        <ApplicationForm mode="partner" initial={app} reviewNote={app.reviewNotes} draftKey={`cd-partner-application-${app._id}`} submitLabel="Send again"
          onSubmit={(input) => assetPartnerApi.resubmitApplication(app._id, input).then(sent)} />
      )}
      {data.stage === 'review' && <InReview data={data} />}
      {data.stage === 'rejected' && !reapply && (
        <Card>
          <CardContent className="space-y-4 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive"><XCircle className="h-5 w-5" /></span>
              <div>
                <h2 className="text-lg font-bold">We couldn’t approve this application</h2>
                {app?.reviewNotes && <p className="mt-1 text-sm text-muted-foreground">{app.reviewNotes}</p>}
              </div>
            </div>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setReapply(true)}>Apply again</Button>
          </CardContent>
        </Card>
      )}
      {data.stage === 'agreement' && <Agreement data={data} onDone={() => void refresh()} />}
      {data.stage === 'payout' && <Payout method={data.payoutMethod ?? 'check'} onDone={() => void refresh()} />}
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <AuthGuard loginPath="/sign-in?next=/onboarding">
      <div className="mx-auto max-w-3xl py-2">
        <GettingStarted />
      </div>
    </AuthGuard>
  );
}
