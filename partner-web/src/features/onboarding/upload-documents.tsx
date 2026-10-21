'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, FileUp, Loader2, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { uploadFiles } from '@/features/media/upload';
import { documentsApi } from '@/features/documents/api';
import type { OnboardingDocument, PartnerDocCategory } from '@/features/asset-partners/api';
import { DOC_ACCEPT } from '@/lib/upload-formats';

/** Agreement Exhibit E: the papers CatoDrive needs before the car can go live. */
export function UploadDocuments({ documents, onChange }: { documents: OnboardingDocument[]; onChange: () => void }) {
  const [busy, setBusy] = useState<PartnerDocCategory | null>(null);
  const [error, setError] = useState<{ category: PartnerDocCategory; message: string } | null>(null);
  const done = documents.filter((d) => d.uploaded).length;
  const inputs = useRef<Partial<Record<PartnerDocCategory, HTMLInputElement | null>>>({});

  const upload = async (category: PartnerDocCategory, file?: File) => {
    if (!file) return;
    setBusy(category);
    setError(null);
    try {
      const [up] = await uploadFiles(category, [file]);
      await documentsApi.create({ category, url: up.url, key: up.key });
      onChange();
    } catch (e) {
      setError({ category, message: e instanceof Error && e.message.includes('PDF') ? e.message : 'That file didn’t upload. Try again.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Upload your papers</h2>
            <p className="text-sm text-muted-foreground">PDF or a clear photo. Your dashboard opens once all five are in; CatoDrive checks each before your car goes live.</p>
          </div>
          <Badge tone={done === documents.length ? 'success' : 'warning'}>{done}/{documents.length} uploaded</Badge>
        </div>
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {documents.map((d) => {
            const rejected = d.status === 'rejected';
            return (
              <li key={d.category} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {d.uploaded && <CheckCircle2 className="h-4 w-4 text-success" />}
                    {d.label}
                    {d.status === 'verified' && <Badge tone="success">Checked</Badge>}
                    {rejected && <Badge tone="destructive">Upload again</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">{d.hint}</p>
                  {error?.category === d.category && <p role="alert" className="mt-1 text-xs text-destructive">{error.message}</p>}
                </div>
                <div className="shrink-0">
                  <input ref={(el) => { inputs.current[d.category] = el; }} type="file" accept={DOC_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void upload(d.category, e.target.files?.[0]); e.target.value = ''; }} />
                  <Button variant={d.uploaded ? 'outline' : 'primary'} size="sm" className="w-full sm:w-auto" disabled={!!busy} onClick={() => inputs.current[d.category]?.click()} aria-label={`${d.uploaded ? 'Replace' : 'Upload'} ${d.label}`}>
                    {busy === d.category ? <Loader2 className="h-4 w-4 animate-spin" /> : d.uploaded ? <RotateCcw className="h-4 w-4" /> : <FileUp className="h-4 w-4" />}
                    {busy === d.category ? 'Uploading…' : d.uploaded ? 'Replace' : 'Upload'}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
