'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSignature } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { partnerManageApi } from '@/features/asset-partners/manage-api';
import { ApiError } from '@/lib/api/types';
import { formatDate } from '@/lib/utils/format';
import { PartnersNav } from '~/features/partners/partners-nav';

const manage = partnerManageApi('/ioc');

export default function PartnerAgreementPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['ioc-partner-agreements'], queryFn: () => manage.agreements() });
  const current = q.data?.[0];
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    setTitle(current?.title ?? 'CatoDrive Asset Partner Agreement');
    setBody(current?.body ?? '');
  }, [current]);

  const publish = useMutation({
    meta: { silentError: true },
    mutationFn: () => manage.publishAgreement({ title: title.trim(), body: body.trim() }),
    onSuccess: (v) => {
      void qc.invalidateQueries({ queryKey: ['ioc-partner-agreements'] });
      toast({ tone: 'success', title: `Version ${v.version} published`, description: 'Newly approved partners sign this version.' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not publish' }),
  });

  const changed = !!body.trim() && (body.trim() !== (current?.body ?? '') || title.trim() !== (current?.title ?? ''));
  const send = async () => {
    const { ok } = await confirm({
      title: current ? `Publish version ${current.version + 1}?` : 'Publish the agreement?',
      description: 'Partners who already signed keep the version they signed. Everyone approved from now on signs this one.',
      confirmLabel: 'Publish',
    });
    if (ok) publish.mutate();
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Asset Partners" title="Partner agreement" description="The agreement newly approved partners sign in their portal before their dashboard opens." />
      <PartnersNav />

      {q.isLoading ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : q.isError ? (
        <ErrorState message="We couldn’t load the agreement." retry={() => q.refetch()} />
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_20rem]">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {current ? 'Edit and publish a new version' : 'Publish the first version'}
                {current && <Badge tone="success">Live: version {current.version}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!current && (
                <p className="rounded-xl bg-warning/10 p-3 text-sm">Until a version is published, approved partners see “Your agreement is being prepared” and can’t open their dashboard.</p>
              )}
              <Field label="Title" htmlFor="title"><Input id="title" maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
              <Field label="Agreement text" htmlFor="body" hint="Paste the full text. Line breaks are kept exactly as written.">
                <Textarea id="body" rows={18} className="font-mono text-xs leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} />
              </Field>
              <Button className="w-full sm:w-auto" disabled={!changed || title.trim().length < 3 || body.trim().length < 50} loading={publish.isPending} onClick={() => void send()}>
                <FileSignature className="h-4 w-4" /> Publish
              </Button>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader><CardTitle className="text-base">Versions</CardTitle></CardHeader>
            <CardContent className="p-0">
              {!q.data?.length ? (
                <div className="p-4"><EmptyState title="None yet" description="Published versions appear here." /></div>
              ) : (
                <ul className="divide-y divide-border">
                  {q.data.map((v) => (
                    <li key={v._id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="min-w-0 truncate font-medium">Version {v.version}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDate(v.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
