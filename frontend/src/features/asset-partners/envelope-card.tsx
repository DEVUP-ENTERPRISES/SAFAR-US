'use client';

import { useState } from 'react';
import { ChevronDown, Copy, Download, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/format';
import { saveFile } from '@/lib/utils/save-file';
import { SIGNING_EVENT_LABEL, type SignatureEnvelope } from './api';

const PURPOSE: Record<SignatureEnvelope['purpose'], string> = { onboarding: 'Partner agreement and NDA', amendment: 'Change to terms' };
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

/** One sealed signing: its ID, the documents with downloads, and every step. Used by the partner and by CatoDrive staff. */
export function EnvelopeCard({
  envelope: e,
  download,
  actions,
}: {
  envelope: SignatureEnvelope;
  download: (documentId: string) => Promise<{ blob: Blob; filename?: string }>;
  actions?: React.ReactNode;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const history = [...e.events, ...e.after];

  const get = async (documentId: string) => {
    setBusy(documentId);
    try {
      const { blob, filename } = await download(documentId);
      saveFile(blob, filename ?? `${documentId}.pdf`);
    } catch {
      toast({ tone: 'error', title: 'That download didn’t work. Try again.' });
    } finally {
      setBusy(null);
    }
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(e.envelopeId);
      toast({ tone: 'success', title: 'Envelope ID copied' });
    } catch {
      /* clipboard can be blocked; the ID is on screen to copy by hand */
    }
  };

  return (
    <div className="space-y-3 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {PURPOSE[e.purpose]}
            <Badge tone="success"><ShieldCheck className="me-1 h-3 w-3" aria-hidden />Sealed</Badge>
          </p>
          <button type="button" onClick={() => void copyId()} className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground" aria-label={`Copy envelope ID ${e.envelopeId}`}>
            {e.envelopeId} <Copy className="h-3 w-3" aria-hidden />
          </button>
          <p className="text-xs text-muted-foreground">Signed by {e.signer.name} · countersigned by {e.countersigner.name} · {formatDate(e.completedAt)}</p>
        </div>
        {actions}
      </div>

      <ul className="space-y-2">
        {e.documents.map((d) => (
          <li key={d.documentId} className="flex flex-col gap-2 rounded-sm border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">{d.title}</p>
              <p className="font-mono text-xs text-muted-foreground">{d.documentId} · version {d.version}</p>
            </div>
            <Button variant="outline" size="sm" className="w-full sm:w-auto" loading={busy === d.documentId} onClick={() => void get(d.documentId)}>
              <Download className="h-4 w-4" aria-hidden /> PDF
            </Button>
          </li>
        ))}
      </ul>

      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden /> {open ? 'Hide history' : 'Show history'}
      </button>
      {open && (
        <ol className="space-y-1.5 border-s border-border ps-4 text-xs">
          {history.map((h, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-x-4">
              <span className="font-medium">{SIGNING_EVENT_LABEL[h.type] ?? h.type}{h.detail ? <span className="font-normal text-muted-foreground"> · {h.detail}</span> : null}</span>
              <span className="text-muted-foreground tabular-nums">{when(h.at)}{h.ip ? ` · ${h.ip}` : ''}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
