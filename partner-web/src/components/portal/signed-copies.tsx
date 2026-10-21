'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSignature } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { assetPartnerApi } from '@/features/asset-partners/api';
import { formatDate } from '@/lib/utils/format';
import { saveFile } from '@/lib/utils/save-file';

/** The partner's signed agreement and NDA, rebuilt as PDFs from exactly what they signed. */
export function SignedCopies() {
  const toast = useToast();
  const me = useQuery({ queryKey: ['asset-partner-me'], queryFn: () => assetPartnerApi.me() });
  const [busy, setBusy] = useState<'agreement' | 'nda' | null>(null);
  const p = me.data?.partner;
  const items = [
    { kind: 'agreement' as const, label: 'Asset Partner Agreement', signed: p?.agreement?.signedAt },
    { kind: 'nda' as const, label: 'Non-Disclosure Agreement', signed: p?.nda?.signedAt },
  ].filter((i) => i.signed);
  if (!items.length) return null;

  const download = async (kind: 'agreement' | 'nda') => {
    setBusy(kind);
    try {
      const { blob, filename } = await assetPartnerApi.downloadSigned(kind);
      saveFile(blob, filename ?? `${kind}.pdf`);
    } catch {
      toast({ tone: 'error', title: 'That download didn’t work. Try again.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><FileSignature className="h-5 w-5 text-primary" /> Signed agreements</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border p-0">
        {items.map((i) => (
          <div key={i.kind} className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{i.label}</p>
              <p className="text-xs text-muted-foreground">Signed {formatDate(i.signed!)}</p>
            </div>
            <Button variant="outline" size="sm" className="w-full sm:w-auto" loading={busy === i.kind} onClick={() => void download(i.kind)}>
              <Download className="h-4 w-4" /> Download PDF
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
