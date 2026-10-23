'use client';

import { ErrorState } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, Eye, FileSignature, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { partnerManageApi, type AgreementKind } from '@/features/asset-partners/manage-api';
import { ApiError } from '@/lib/api/types';
import { formatDate } from '@/lib/utils/format';
import { saveFile } from '@/lib/utils/save-file';

const manage = partnerManageApi('/ioc');

/** A partner's signed documents and onboarding papers, with the checks CatoDrive does before the car goes live. */
export function PartnerPaperwork({ partnerId, signed }: { partnerId: string; signed: { agreement?: { signedAt?: string; version?: number }; nda?: { signedAt?: string; version?: number } } }) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState('');
  const docs = useQuery({ queryKey: ['ioc-partner-docs', partnerId], queryFn: () => manage.partnerDocuments(partnerId) });
  const fail = (e: unknown) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'That didn’t work' });

  const review = useMutation({
    meta: { silentError: true },
    mutationFn: ({ docId, decision, reason }: { docId: string; decision: 'verified' | 'rejected'; reason?: string }) => manage.reviewDocument(partnerId, docId, decision, reason),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ioc-partner-docs', partnerId] }),
    onError: fail,
  });

  const download = async (kind: AgreementKind) => {
    setBusy(kind);
    try {
      const { blob, filename } = await manage.signedCopy(partnerId, kind);
      saveFile(blob, filename ?? `${kind}.pdf`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy('');
    }
  };

  const open = async (docId: string) => {
    setBusy(docId);
    try {
      const { url } = await manage.viewDocument(partnerId, docId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      fail(e);
    } finally {
      setBusy('');
    }
  };

  const sendBack = async (docId: string, label: string) => {
    const { ok, reason } = await confirm({
      title: `Send back the ${label.toLowerCase()}?`,
      description: 'The partner is told what to fix and their dashboard locks until they upload it again.',
      confirmLabel: 'Send back',
      tone: 'destructive',
      reason: { label: 'What needs to change', required: true },
    });
    if (ok) review.mutate({ docId, decision: 'rejected', reason });
  };

  const signedRows = [
    { kind: 'agreement' as const, label: 'Asset Partner Agreement', at: signed.agreement?.signedAt, version: signed.agreement?.version },
    { kind: 'nda' as const, label: 'NDA', at: signed.nda?.signedAt, version: signed.nda?.version },
  ];

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileSignature className="h-5 w-5 text-primary" /> Paperwork</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="divide-y divide-border rounded-lg border border-border">
          {signedRows.map((r) => (
            <div key={r.kind} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium">{r.label}</p>
                <p className="text-xs text-muted-foreground">{r.at ? `Signed ${formatDate(r.at)} · version ${r.version}` : 'Not signed in the portal'}</p>
              </div>
              {r.at && (
                <Button variant="outline" size="sm" className="w-full sm:w-auto" loading={busy === r.kind} onClick={() => void download(r.kind)}>
                  <Download className="h-4 w-4" /> PDF
                </Button>
              )}
            </div>
          ))}
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">Onboarding papers</p>
          <div className="divide-y divide-border rounded-lg border border-border">
            {(docs.data?.checklist ?? []).map((c) => {
              const doc = docs.data?.documents.find((d) => d.category === c.category);
              const status = doc?.verification?.status;
              return (
                <div key={c.category} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {c.label}
                      {!doc ? <Badge tone="muted">Not uploaded</Badge> : status === 'verified' ? <Badge tone="success">Received</Badge> : status === 'rejected' ? <Badge tone="destructive">Sent back</Badge> : <Badge tone="warning">To check</Badge>}
                    </p>
                    {doc && <p className="text-xs text-muted-foreground">Uploaded {formatDate(doc.createdAt)}{doc.verification?.reason ? ` · ${doc.verification.reason}` : ''}</p>}
                  </div>
                  {doc && (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" loading={busy === doc._id} onClick={() => void open(doc._id)}><Eye className="h-4 w-4" /> Open</Button>
                      {status !== 'verified' && <Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ docId: doc._id, decision: 'verified' })}><CheckCircle2 className="h-4 w-4" /> Received</Button>}
                      {status !== 'rejected' && <Button variant="outline" size="sm" disabled={review.isPending} onClick={() => void sendBack(doc._id, c.label)}><RotateCcw className="h-4 w-4" /> Send back</Button>}
                    </div>
                  )}
                </div>
              );
            })}
            {docs.isLoading && <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>}
            {docs.isError && <div className="p-4"><ErrorState message="We couldn’t load the papers." retry={() => void docs.refetch()} /></div>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
