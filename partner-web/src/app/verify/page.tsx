'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, FileSearch, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/utils/format';
import { assetPartnerApi, type EnvelopeCheck } from '@/features/asset-partners/api';

const PURPOSE = { onboarding: 'Partner agreement and NDA', amendment: 'Change to partner terms' } as const;

/** The file's fingerprint, worked out in the browser: the document itself never leaves the device. */
async function fingerprint(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Public: anyone holding a CatoDrive agreement can check it is genuine and unchanged. */
export default function VerifyPage() {
  const [id, setId] = useState('');
  const [result, setResult] = useState<(EnvelopeCheck & { documentId?: string; via: 'id' | 'file' }) | null>(null);
  const byId = useMutation({ mutationFn: (v: string) => assetPartnerApi.verifyEnvelope(v), onSuccess: (r) => setResult({ ...r, via: 'id' }) });
  const byFile = useMutation({
    mutationFn: async (f: File) => assetPartnerApi.verifyFile(await fingerprint(f)),
    onSuccess: (r) => setResult({ ...r, via: 'file' }),
  });
  const busy = byId.isPending || byFile.isPending;
  const failed = byId.isError || byFile.isError;
  const e = result?.envelope;

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <PageHeader eyebrow="CatoDrive" title="Check a signed document" description="Confirm that a CatoDrive partner agreement is genuine and has not been changed since it was signed." />

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">By envelope ID</CardTitle></CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (id.trim()) byId.mutate(id.trim().toUpperCase());
            }}
          >
            <Field label="Envelope ID" htmlFor="envelope-id" className="flex-1">
              <Input id="envelope-id" value={id} autoCapitalize="characters" spellCheck={false} aria-describedby="envelope-id-hint" onChange={(ev) => setId(ev.target.value)} />
            </Field>
            <Button type="submit" loading={byId.isPending} disabled={!id.trim() || busy}>Check</Button>
          </form>
          <p id="envelope-id-hint" className="mt-2 text-xs text-muted-foreground">Printed at the foot of every page, e.g. CD-ENV-7K3M-92QX.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">By file</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Field label="The PDF you were given" htmlFor="verify-file" hint="The file stays on your device; only its fingerprint is checked.">
            <Input id="verify-file" type="file" accept="application/pdf" disabled={busy} onChange={(ev) => { const f = ev.target.files?.[0]; if (f) byFile.mutate(f); }} />
          </Field>
          {byFile.isPending && <p className="text-sm text-muted-foreground">Checking…</p>}
        </CardContent>
      </Card>

      {failed && <p role="alert" className="text-sm text-destructive">We’re having trouble connecting right now. Please try again in a moment.</p>}

      {result && (
        <Card className={result.valid ? 'border-success/40' : 'border-destructive/40'} aria-live="polite">
          <CardContent className="space-y-3 p-5 sm:p-6">
            {result.valid && e ? (
              <>
                <p className="flex items-center gap-2 font-semibold text-success"><CheckCircle2 className="h-5 w-5" aria-hidden />{result.via === 'file' ? 'Genuine and unchanged' : 'Genuine envelope'}</p>
                <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-muted-foreground">Envelope</dt><dd className="font-mono">{e.envelopeId}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Signed</dt><dd>{formatDate(e.completedAt)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">What</dt><dd>{PURPOSE[e.purpose]}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Signed by</dt><dd>{e.signer}, countersigned by {e.countersignedBy}</dd></div>
                </dl>
                <ul className="space-y-1 text-sm">
                  {e.documents.map((d) => (
                    <li key={d.documentId} className={result.documentId === d.documentId ? 'font-semibold' : undefined}>
                      <span className="font-mono text-xs">{d.documentId}</span> · {d.title} (version {d.version}){result.documentId === d.documentId ? ' · this file' : ''}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="flex items-start gap-2 text-sm">
                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
                {result.via === 'file'
                  ? 'This file doesn’t match any document CatoDrive sealed. It may have been changed, or it may not be a CatoDrive copy.'
                  : 'No envelope has that ID. Check the letters and numbers and try again.'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground"><FileSearch className="h-4 w-4" aria-hidden />Only the signer’s initials and the dates are shown here; the documents themselves stay private.</p>
    </div>
  );
}
