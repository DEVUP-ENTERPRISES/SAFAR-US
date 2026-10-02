'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, FileText, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils/cn';
import { ApiError } from '@/lib/api/types';
import { TimedViewer } from '@/components/secure/timed-viewer';
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

      {view && (
        <TimedViewer
          title="Vehicle documents"
          subtitle="For a traffic stop only · your host has been told"
          seconds={view.viewSeconds}
          items={view.documents}
          load={(id) => tripDocumentsApi.file(bookingId, id, view.token)}
          onClose={() => setView(null)}
        />
      )}
    </Card>
  );
}
