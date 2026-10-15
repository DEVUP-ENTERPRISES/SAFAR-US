'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BadgeCheck, CheckCircle2, Clock, ScanFace } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/types';
import { TimedViewer } from '@/components/secure/timed-viewer';
import { guestPhotoApi, type TimedView } from '@/features/trips/guest-photo-api';

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

/** Before the pickup code: the host sees who is coming and confirms it is the same person. Hidden once the trip starts. */
export function GuestIdentityCard({ bookingId }: { bookingId: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<TimedView | null>(null);
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState('');

  const { data: s } = useQuery({
    queryKey: ['guest-photo', bookingId],
    queryFn: () => guestPhotoApi.status(bookingId),
    retry: false,
    // Re-check each minute so the photo appears on its own when the window opens.
    refetchInterval: 60_000,
  });

  const open = useMutation({
    mutationFn: () => guestPhotoApi.open(bookingId),
    onSuccess: setView,
    onError: (e) => toast({ tone: 'error', title: errorText(e) }),
  });

  const check = useMutation({
    mutationFn: (result: 'match' | 'mismatch') => guestPhotoApi.check(bookingId, result, note.trim() || undefined),
    onSuccess: (r) => {
      setReporting(false);
      toast(r.result === 'match'
        ? { tone: 'success', title: 'Thanks. Now enter the guest’s pickup code.' }
        : { tone: 'info', title: 'Trip on hold. Our team has been alerted and will contact you.' });
      void qc.invalidateQueries({ queryKey: ['guest-photo', bookingId] });
    },
    onError: (e) => toast({ tone: 'error', title: errorText(e) }),
  });

  if (!s || s.started) return null;
  const opensAt = new Date(s.opensAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

  return (
    <div className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <ScanFace className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="font-semibold">Who’s picking up</p>
          <p className="text-sm text-muted-foreground">Check the person at the car is the verified guest before you enter their pickup code.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-medium">{s.verifiedName ?? 'Name not verified yet'}</span>
        {s.age !== undefined && <span className="text-muted-foreground">Age {s.age}</span>}
        {s.verified && (
          <span className="inline-flex items-center gap-1 text-success"><BadgeCheck className="h-4 w-4" /> ID verified</span>
        )}
      </div>

      {s.check?.result === 'mismatch' ? (
        <p className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> You reported this is not the same person. The trip is on hold while our team checks. Don’t hand over the keys.
        </p>
      ) : s.check?.result === 'match' ? (
        <p className="flex items-center gap-2 text-sm font-medium text-success"><CheckCircle2 className="h-4 w-4" /> You confirmed it’s the guest. Enter their pickup code next.</p>
      ) : !s.open ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4" /> The guest’s photo appears {opensAt}.</p>
      ) : (
        <div className="space-y-3">
          {s.photoAvailable ? (
            <Button variant="outline" className="w-full" loading={open.isPending} onClick={() => open.mutate()}>
              <ScanFace className="mr-2 h-4 w-4" /> See the guest’s photo
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">The guest’s photo isn’t available. Compare their name with their driving licence in person.</p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="sm:flex-1" loading={check.isPending && check.variables === 'match'} onClick={() => check.mutate('match')}>
              Yes, it’s them
            </Button>
            <Button variant="outline" className="text-destructive sm:flex-1" onClick={() => setReporting(true)}>
              Not the same person
            </Button>
          </div>
        </div>
      )}

      {view && (
        <TimedViewer
          title="Guest’s verified photo"
          subtitle="For the pickup identity check only · every view is recorded"
          seconds={view.viewSeconds}
          items={view.items}
          load={() => guestPhotoApi.file(bookingId, view.token)}
          onClose={() => setView(null)}
        />
      )}

      {reporting && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-background p-5 shadow-xl">
            <p className="text-lg font-semibold">Not the same person?</p>
            <p className="text-sm text-muted-foreground">The trip goes on hold and our team is alerted right away. Don’t hand over the keys until we confirm.</p>
            <Textarea rows={3} maxLength={300} placeholder="What didn’t match? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setReporting(false)}>Cancel</Button>
              <Button variant="destructive" className="flex-1" loading={check.isPending} onClick={() => check.mutate('mismatch')}>Report and hold trip</Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
