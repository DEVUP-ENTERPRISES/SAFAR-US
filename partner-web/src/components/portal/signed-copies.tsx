'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Download, FileSignature } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { assetPartnerApi } from '@/features/asset-partners/api';
import { EnvelopeCard } from '@/features/asset-partners/envelope-card';
import { formatDate } from '@/lib/utils/format';
import { saveFile } from '@/lib/utils/save-file';

/** The partner's sealed signings, newest first; an older signing is sealed the first time its copy is opened. */
export function SignedCopies() {
  const toast = useToast();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['asset-partner-me'], queryFn: () => assetPartnerApi.me() });
  const envelopes = useQuery({ queryKey: ['partner-envelopes'], queryFn: () => assetPartnerApi.envelopes(), enabled: !!me.data?.partner });
  const [busy, setBusy] = useState<'agreement' | 'nda' | null>(null);
  const p = me.data?.partner;
  const signedAt = p?.agreement?.signedAt;
  if (!signedAt) return null;

  if (envelopes.isLoading) return <Skeleton className="h-40 w-full rounded-lg" />;
  if (envelopes.isError) return <ErrorState message="We couldn’t load your signed agreements." retry={() => void envelopes.refetch()} />;

  const legacy = async (kind: 'agreement' | 'nda') => {
    setBusy(kind);
    try {
      const { blob, filename } = await assetPartnerApi.downloadSigned(kind);
      saveFile(blob, filename ?? `${kind}.pdf`);
      void qc.invalidateQueries({ queryKey: ['partner-envelopes'] });
    } catch {
      toast({ tone: 'error', title: 'That download didn’t work. Try again.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-lg"><FileSignature className="h-5 w-5 text-primary" aria-hidden /> Signed agreements</CardTitle>
        <Link href="/verify" className="text-xs font-semibold text-primary underline-offset-2 hover:underline">Check a document</Link>
      </CardHeader>
      <CardContent className="divide-y divide-border p-0">
        {envelopes.data?.length ? (
          envelopes.data.map((e) => <EnvelopeCard key={e.envelopeId} envelope={e} download={assetPartnerApi.downloadSealed} />)
        ) : (
          // Signed before envelopes existed: the first download seals it and gives it an ID.
          (['agreement', 'nda'] as const).map((kind) => (
            <div key={kind} className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{kind === 'agreement' ? 'Asset Partner Agreement' : 'Non-Disclosure Agreement'}</p>
                <p className="text-xs text-muted-foreground">Signed {formatDate(signedAt)}</p>
              </div>
              <Button variant="outline" size="sm" className="w-full sm:w-auto" loading={busy === kind} onClick={() => void legacy(kind)}>
                <Download className="h-4 w-4" aria-hidden /> Download PDF
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
