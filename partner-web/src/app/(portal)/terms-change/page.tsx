'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, FileSignature } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/types';
import { safeMessage } from '@/lib/utils/safe-message';
import { formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { assetPartnerApi, TERM_LABEL } from '@/features/asset-partners/api';

const fail = (e: unknown, fallback: string) => (e instanceof ApiError ? safeMessage(e.message) : fallback);

/** Review and sign (or decline) a change to the partner's terms; it is sealed like the original agreement. */
export default function TermsChangePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const q = useQuery({ queryKey: ['partner-amendment'], queryFn: () => assetPartnerApi.amendment() });
  const [read, setRead] = useState(false);
  const [agree, setAgree] = useState(false);
  const [name, setName] = useState('');
  const box = useRef<HTMLElement>(null);
  const a = q.data;

  useEffect(() => {
    if (!a) return;
    void assetPartnerApi.signingEvent('amendment', 'opened');
    const el = box.current;
    // A text that fits without scrolling counts as read.
    if (el && el.scrollHeight <= el.clientHeight + 24) setRead(true);
  }, [a]);
  useEffect(() => {
    if (read) void assetPartnerApi.signingEvent('amendment', 'read_amendment');
  }, [read]);

  const done = () => {
    void qc.invalidateQueries({ queryKey: ['partner-amendment'] });
    void qc.invalidateQueries({ queryKey: ['partner-envelopes'] });
    router.push('/documents');
  };
  const sign = useMutation({
    meta: { silentError: true },
    mutationFn: async () => {
      await assetPartnerApi.signingEvent('amendment', 'consented');
      return assetPartnerApi.signAmendment({ versionId: a!.versionId, signedName: name.trim(), templateVersion: a!.version });
    },
    onSuccess: (r) => {
      toast({ tone: 'success', title: 'Signed', description: `Envelope ${r.envelopeId}. Your new terms apply from ${formatDate(r.effectiveFrom)}.` });
      done();
    },
  });
  const decline = useMutation({
    meta: { silentError: true },
    mutationFn: () => assetPartnerApi.declineAmendment(),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Declined', description: 'Your current terms continue. CatoDrive has been told.' });
      done();
    },
  });

  if (q.isLoading) return <Skeleton className="h-96 w-full rounded-lg" />;
  if (q.isError) return <ErrorState message="We couldn’t load the proposed change." retry={() => void q.refetch()} />;
  if (!a) return <EmptyState title="Nothing to sign" description="There’s no change to your terms waiting for you." action={<Button variant="outline" onClick={() => router.push('/dashboard')}>Back to dashboard</Button>} />;

  const changed = Object.keys(a.to).filter((k) => a.from[k] !== a.to[k]);
  const canSign = read && agree && name.trim().length >= 2;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Your terms" title="Review a change to your terms" description={`Proposed to start ${formatDate(a.requestedFrom)}, or when you sign if later. Nothing changes until you sign.`} />

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">What changes</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {changed.map((k) => (
              <li key={k} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="text-muted-foreground">{TERM_LABEL[k] ?? k}</span>
                <span className="flex items-center gap-2 font-semibold tabular-nums">
                  <span className="text-muted-foreground line-through">{a.from[k]}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                  {a.to[k]}
                </span>
              </li>
            ))}
          </ul>
          {a.reason && <p className="mt-3 rounded-sm bg-muted px-3 py-2 text-sm"><span className="font-medium">Note from CatoDrive:</span> {a.reason}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><FileSignature className="h-5 w-5 text-primary" aria-hidden />{a.title}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <article
            ref={box}
            tabIndex={0}
            aria-label={a.title}
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setRead(true);
            }}
            className="max-h-[24rem] overflow-y-auto whitespace-pre-wrap break-words rounded-sm border border-border bg-muted/30 p-4 text-sm leading-relaxed"
          >
            {a.body}
          </article>
          <p className={cn('flex items-center gap-1.5 text-xs', read ? 'text-success' : 'text-muted-foreground')}>
            {read ? <><Check className="h-3.5 w-3.5" aria-hidden /> Read to the end</> : 'Scroll to the end to continue'}
          </p>
          <label className="flex cursor-pointer items-start gap-3 rounded-sm border border-border p-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I have read this change and agree to sign it electronically. All my other terms stay the same.</span>
          </label>
          <Field label="Sign by typing your full legal name" htmlFor="signed-name">
            <Input id="signed-name" autoComplete="name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {(sign.isError || decline.isError) && (
            <p role="alert" className="text-sm text-destructive">{fail(sign.error ?? decline.error, 'That didn’t go through. Try again.')}</p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={sign.isPending}
              loading={decline.isPending}
              onClick={async () => {
                const { ok } = await confirm({ title: 'Decline this change?', description: 'Your current terms continue and CatoDrive is told.', confirmLabel: 'Decline', tone: 'destructive' });
                if (ok) decline.mutate();
              }}
            >
              Decline
            </Button>
            <Button disabled={!canSign || decline.isPending} loading={sign.isPending} onClick={() => sign.mutate()}>Sign the change</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
