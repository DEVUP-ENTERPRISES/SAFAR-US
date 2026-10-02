'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, FileText, Loader2, ShieldCheck, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils/cn';
import { ApiError } from '@/lib/api/types';
import { tripDocumentsApi, type TripDocumentsView } from '../documents-api';

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

/** The car's registration and insurance for a traffic stop: shown only during the trip, for a limited time. */
export function TripDocuments({ bookingId }: { bookingId: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(useSearchParams().get('documents') === '1');
  const [view, setView] = useState<TripDocumentsView | null>(null);

  const status = useQuery({
    queryKey: ['trip-documents', bookingId],
    queryFn: () => tripDocumentsApi.status(bookingId),
    retry: false,
    // While the guest waits on the host, look for the upload every 20 seconds.
    refetchInterval: (q) => (q.state.data?.live && q.state.data.requestedAt ? 20_000 : false),
  });

  const open = useMutation({
    mutationFn: () => tripDocumentsApi.open(bookingId),
    onSuccess: (v) => { setConfirming(false); setView(v); },
    onError: (e) => { setConfirming(false); toast({ tone: 'error', title: errorText(e) }); void qc.invalidateQueries({ queryKey: ['trip-documents', bookingId] }); },
  });

  const request = useMutation({
    mutationFn: () => tripDocumentsApi.request(bookingId),
    onSuccess: (r) => {
      toast({ tone: 'success', title: r.alerted ? 'We alerted your host and our support team.' : 'Your host was already alerted. We will tell you when the documents are ready.' });
      void qc.invalidateQueries({ queryKey: ['trip-documents', bookingId] });
    },
    onError: (e) => toast({ tone: 'error', title: errorText(e) }),
  });

  const s = status.data;
  if (!s?.live) return null;
  const anyOnFile = s.documents.some((d) => d.available);
  const missing = s.documents.filter((d) => !d.available);
  const minutes = Math.floor(s.viewSeconds / 60);
  const duration = minutes ? `${minutes} min ${s.viewSeconds % 60 ? `${s.viewSeconds % 60} s` : ''}`.trim() : `${s.viewSeconds} seconds`;

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="font-semibold">Vehicle documents</p>
            <p className="text-sm text-muted-foreground">Registration and proof of insurance, if an officer asks for them.</p>
          </div>
        </div>

        <ul className="grid gap-2 sm:grid-cols-2">
          {s.documents.map((d) => (
            <li key={d.category} className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm">
              <span className="truncate">{d.label}</span>
              <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', d.available ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400')}>
                {d.available ? 'On file' : d.expired ? 'Expired' : 'Missing'}
              </span>
            </li>
          ))}
        </ul>

        {s.requestedAt && missing.length > 0 && (
          <p className="flex items-center gap-2 rounded-xl bg-primary/5 px-3 py-2 text-sm">
            <BellRing className="h-4 w-4 shrink-0 text-primary" /> Your host has been alerted. This updates as soon as they upload.
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          {anyOnFile && (
            <Button className="sm:flex-1" onClick={() => setConfirming(true)}>
              <ShieldCheck className="mr-2 h-4 w-4" /> Show documents
            </Button>
          )}
          {missing.length > 0 && (
            <Button variant="outline" className="sm:flex-1" loading={request.isPending} onClick={() => request.mutate()}>
              <BellRing className="mr-2 h-4 w-4" /> Request documents
            </Button>
          )}
        </div>
      </CardContent>

      {confirming && anyOnFile && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-background p-5 shadow-xl">
            <p className="text-lg font-semibold">Show the car&apos;s documents?</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Show them only to a law-enforcement officer.</li>
              <li>They close automatically after {duration}. You can open them again.</li>
              <li>Your host is told you opened them, and every view is recorded.</li>
              <li>Each page is stamped with your name, trip and the time, so copies can be traced.</li>
            </ul>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirming(false)}>Cancel</Button>
              <Button className="flex-1" loading={open.isPending} onClick={() => open.mutate()}>Open now</Button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {view && <DocumentViewer bookingId={bookingId} view={view} onClose={() => setView(null)} />}
    </Card>
  );
}

type PageState = { id: string; label: string; state: 'loading' | 'ready' | 'error'; message?: string };

const bytesOf = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function drawImage(host: HTMLElement, bytes: Uint8Array) {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/jpeg' }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close();
  host.appendChild(canvas);
}

async function drawPdf(host: HTMLElement, bytes: Uint8Array) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  try {
    const width = Math.min(host.clientWidth || 800, 1000) * Math.min(window.devicePixelRatio || 1, 2);
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      host.appendChild(canvas);
    }
  } finally {
    await pdf.destroy();
  }
}

/** Full-screen, time-boxed view. Files are painted onto canvases, never kept as downloadable links, and wiped on close. */
function DocumentViewer({ bookingId, view, onClose }: { bookingId: string; view: TripDocumentsView; onClose: () => void }) {
  const deadline = useRef(Date.now() + view.viewSeconds * 1000);
  const hosts = useRef<Record<string, HTMLDivElement | null>>({});
  const [left, setLeft] = useState(view.viewSeconds);
  const [now, setNow] = useState(() => new Date());
  const [covered, setCovered] = useState(false);
  const [pages, setPages] = useState<PageState[]>(view.documents.map((d) => ({ id: d.id, label: d.label, state: 'loading' })));

  const close = useCallback(() => {
    for (const host of Object.values(hosts.current)) {
      host?.querySelectorAll('canvas').forEach((c) => { c.width = 0; c.height = 0; });
      host?.replaceChildren();
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    const t = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setLeft(remaining);
      setNow(new Date());
      if (remaining <= 0) close();
    }, 250);
    return () => clearInterval(t);
  }, [close]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const d of view.documents) {
        try {
          const f = await tripDocumentsApi.file(bookingId, d.id, view.token);
          const host = hosts.current[d.id];
          if (cancelled || !host) return;
          const bytes = bytesOf(f.data);
          if (f.contentType === 'application/pdf') await drawPdf(host, bytes);
          else await drawImage(host, bytes);
          if (!cancelled) setPages((p) => p.map((x) => (x.id === d.id ? { ...x, state: 'ready' } : x)));
        } catch (e) {
          if (!cancelled) setPages((p) => p.map((x) => (x.id === d.id ? { ...x, state: 'error', message: errorText(e) } : x)));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [bookingId, view]);

  // Deterrents a website can apply: cover the screen when the app loses focus, block print, save and copy keys, and lock scrolling behind.
  useEffect(() => {
    const hide = () => setCovered(true);
    const onVisibility = () => setCovered(document.visibilityState !== 'visible');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') { setCovered(true); void navigator.clipboard?.writeText('').catch(() => undefined); }
      if ((e.ctrlKey || e.metaKey) && ['p', 's', 'c'].includes(e.key.toLowerCase())) e.preventDefault();
    };
    const style = document.createElement('style');
    style.textContent = '@media print { body * { visibility: hidden !important; } }';
    document.head.appendChild(style);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('blur', hide);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    return () => {
      style.remove();
      document.body.style.overflow = overflow;
      window.removeEventListener('blur', hide);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
    };
  }, []);

  const clock = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex select-none flex-col bg-neutral-950 text-white [-webkit-touch-callout:none]"
      role="dialog"
      aria-modal="true"
      aria-label="Vehicle documents"
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onCopy={(e) => e.preventDefault()}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="font-semibold">Vehicle documents</p>
          <p className="text-xs text-white/60">For a traffic stop only · your host has been told</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('rounded-full px-3 py-1 font-mono text-sm tabular-nums', left <= 15 ? 'bg-red-600' : 'bg-white/10')} aria-live="polite">
            {mm}:{ss}
          </span>
          <Button variant="outline" size="sm" className="border-white/20 bg-transparent text-white hover:bg-white/10" onClick={close} aria-label="Close documents">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="h-1 bg-white/10">
        <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${(left / view.viewSeconds) * 100}%` }} />
      </div>

      <div className="relative flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-3xl space-y-6 p-4">
          {pages.map((p) => (
            <section key={p.id} className="space-y-2">
              <p className="text-sm font-medium text-white/80">{p.label}</p>
              {p.state === 'loading' && (
                <div className="flex h-48 items-center justify-center rounded-xl bg-white/5"><Loader2 className="h-6 w-6 animate-spin text-white/60" /></div>
              )}
              {p.state === 'error' && <p className="rounded-xl bg-white/5 p-4 text-sm text-white/80">{p.message}</p>}
              <div
                ref={(el) => { hosts.current[p.id] = el; }}
                className="space-y-3 [&>canvas]:pointer-events-none [&>canvas]:h-auto [&>canvas]:w-full [&>canvas]:rounded-lg [&>canvas]:bg-white"
              />
            </section>
          ))}
        </div>

        {/* A live clock over the pages: any photo of this screen shows exactly when it was taken. */}
        <div aria-hidden className="pointer-events-none fixed inset-0 top-16 overflow-hidden">
          <div className="absolute -inset-1/2 flex rotate-[-30deg] flex-wrap content-start gap-x-16 gap-y-24 text-sm font-semibold text-white/10 mix-blend-difference">
            {Array.from({ length: 120 }, (_, i) => <span key={i}>CatoDrive live view · {clock}</span>)}
          </div>
        </div>

        {covered && (
          <button
            type="button"
            className="fixed inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-neutral-950 text-center"
            onClick={() => setCovered(false)}
          >
            <ShieldCheck className="h-8 w-8 text-primary" />
            <span className="font-semibold">Documents hidden</span>
            <span className="text-sm text-white/60">Tap to show them again ({mm}:{ss} left)</span>
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
