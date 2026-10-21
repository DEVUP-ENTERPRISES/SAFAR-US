'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, FileSignature } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { partnerManageApi, type AgreementKind } from '@/features/asset-partners/manage-api';
import { ApiError } from '@/lib/api/types';
import { formatDate } from '@/lib/utils/format';
import { PartnersNav } from '~/features/partners/partners-nav';

const manage = partnerManageApi('/ioc');
const DEFAULT_TITLE: Record<AgreementKind, string> = { agreement: 'CatoDrive Asset Partner Agreement', nda: 'CatoDrive Non-Disclosure Agreement' };

export default function PartnerAgreementPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [kind, setKind] = useState<AgreementKind>('agreement');
  const q = useQuery({ queryKey: ['ioc-partner-agreements'], queryFn: () => manage.agreements() });
  const placeholders = useQuery({ queryKey: ['ioc-agreement-placeholders'], queryFn: () => manage.placeholders(), staleTime: Infinity });
  const versions = (q.data ?? []).filter((v) => (v.kind ?? 'agreement') === kind);
  const current = versions[0];
  const published = { agreement: (q.data ?? []).some((v) => (v.kind ?? 'agreement') === 'agreement'), nda: (q.data ?? []).some((v) => v.kind === 'nda') };
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [copied, setCopied] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTitle(current?.title ?? DEFAULT_TITLE[kind]);
    setBody(current?.body ?? '');
  }, [current, kind]);

  const publish = useMutation({
    meta: { silentError: true },
    mutationFn: () => manage.publishAgreement({ kind, title: title.trim(), body: body.trim() }),
    onSuccess: (v) => {
      void qc.invalidateQueries({ queryKey: ['ioc-partner-agreements'] });
      toast({ tone: 'success', title: `Version ${v.version} published`, description: 'Newly approved partners sign this version.' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not publish' }),
  });

  const insert = (key: string) => {
    const token = `{{${key}}}`;
    const el = bodyRef.current;
    if (el) {
      const start = el.selectionStart ?? body.length;
      const end = el.selectionEnd ?? body.length;
      setBody(body.slice(0, start) + token + body.slice(end));
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
    } else {
      void navigator.clipboard?.writeText(token);
    }
    setCopied(key);
    setTimeout(() => setCopied(''), 1200);
  };

  const changed = !!body.trim() && (body.trim() !== (current?.body ?? '') || title.trim() !== (current?.title ?? ''));
  const send = async () => {
    const { ok } = await confirm({
      title: `Publish this ${kind === 'nda' ? 'NDA' : 'agreement'}?`,
      description: 'Partners who already signed keep the version they signed. Everyone approved from now on signs this one.',
      confirmLabel: 'Publish',
    });
    if (ok) publish.mutate();
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Asset Partners" title="Agreement & NDA" description="Approved partners read and sign both in their portal, with their own details filled in, before their dashboard opens." />
      <PartnersNav />

      {q.isLoading ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : q.isError ? (
        <ErrorState message="We couldn’t load the documents." retry={() => q.refetch()} />
      ) : (
        <>
          {(!published.agreement || !published.nda) && (
            <p className="rounded-xl bg-warning/10 p-3 text-sm">
              Publish both the agreement and the NDA. Until both are live, approved partners see “Your documents are being prepared”.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {(['agreement', 'nda'] as const).map((k) => (
              <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                {published[k] && <Check className="me-1 h-3.5 w-3.5" />}
                {k === 'agreement' ? 'Asset Partner Agreement' : 'NDA'}
              </Chip>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_20rem]">
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {current ? 'Edit and publish a new version' : 'Publish the first version'}
                  {current && <Badge tone="success">Live: version {current.version}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Title" htmlFor="title"><Input id="title" maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
                <Field label="Text" htmlFor="body" hint="Paste the full text. Line breaks are kept. Put the partner’s details where they belong with the placeholders on the right.">
                  <Textarea id="body" ref={bodyRef} rows={20} className="font-mono text-xs leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} />
                </Field>
                <Button className="w-full sm:w-auto" disabled={!changed || title.trim().length < 3 || body.trim().length < 50} loading={publish.isPending} onClick={() => void send()}>
                  <FileSignature className="h-4 w-4" /> Publish
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-5">
              <Card>
                <CardHeader><CardTitle className="text-base">Partner details</CardTitle></CardHeader>
                <CardContent className="space-y-1.5">
                  <p className="pb-1 text-xs text-muted-foreground">Click to insert at the cursor. Filled in for each partner when they sign.</p>
                  {(placeholders.data ?? []).map((p) => (
                    <button key={p.key} type="button" onClick={() => insert(p.key)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-start text-sm hover:bg-accent">
                      <span className="min-w-0 truncate">{p.label}</span>
                      <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-muted-foreground">
                        {copied === p.key ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                        {`{{${p.key}}}`}
                      </span>
                    </button>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Versions</CardTitle></CardHeader>
                <CardContent className="p-0">
                  {!versions.length ? (
                    <p className="px-4 pb-4 text-sm text-muted-foreground">None published yet.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {versions.map((v) => (
                        <li key={v._id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                          <span className="font-medium">Version {v.version}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{formatDate(v.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
