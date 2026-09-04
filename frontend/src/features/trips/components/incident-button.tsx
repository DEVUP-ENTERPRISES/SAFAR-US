'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { ShieldAlert, Car, Wrench, HeartPulse, Ban, AlertTriangle, Phone } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils/cn';
import { api } from '@/lib/api/client';

type IncidentType = 'accident' | 'breakdown' | 'medical' | 'theft' | 'unsafe';

/**
 * Reporting that something has gone wrong during a trip.
 *
 * The endpoint for this existed and nothing on any screen called it — a guest
 * in an accident had no button. That is the gap least acceptable to ship with,
 * because the whole point of a platform standing between two strangers is that
 * someone answers when it goes badly.
 *
 * Three things this does that a plain form would not:
 *
 *  - EMERGENCY SERVICES COME FIRST. If someone is hurt, the right action is 911,
 *    not a form on our website. Saying so is not a disclaimer, it is the correct
 *    first instruction, and burying it under a text field would be indefensible.
 *  - REPORTING PAUSES THE TRIP. An open incident stops the trip completing, so
 *    no late-return or mileage charge lands on someone while they are dealing
 *    with a crash. The screen says that, because a guest weighing whether to
 *    report should know it costs them nothing.
 *  - IT TAKES TWO TAPS, NOT A FORM. Type first, detail optional. Someone at the
 *    roadside is not writing paragraphs.
 */

const TYPES: { key: IncidentType; label: string; detail: string; icon: typeof Car }[] = [
  { key: 'accident', label: 'Accident', detail: 'A collision, however minor', icon: Car },
  { key: 'breakdown', label: 'Breakdown', detail: 'The car will not drive', icon: Wrench },
  { key: 'medical', label: 'Medical', detail: 'Someone needs help', icon: HeartPulse },
  { key: 'theft', label: 'Theft', detail: 'The car or belongings are gone', icon: Ban },
  { key: 'unsafe', label: 'Feeling unsafe', detail: 'Something is not right', icon: ShieldAlert },
];

export function IncidentButton({ tripId }: { tripId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<IncidentType | null>(null);
  const [note, setNote] = useState('');

  const report = useMutation({
    mutationFn: () => api.post(`/trips/${tripId}/incident`, { type, note: note.trim() || undefined }),
    onSuccess: () => {
      toast({
        tone: 'success',
        title: 'Reported — we are on it',
        description: 'Your host and our support team have been alerted. This trip is paused.',
      });
      setOpen(false);
      setType(null);
      setNote('');
      qc.invalidateQueries({ queryKey: ['trip', tripId] });
    },
    onError: () => toast({ tone: 'error', title: 'Could not send that. Call support if it is urgent.' }),
  });

  if (!open) {
    return (
      <Button variant="outline" className="w-full border-destructive/40 text-destructive" onClick={() => setOpen(true)}>
        <AlertTriangle className="h-4 w-4" /> Something has gone wrong
      </Button>
    );
  }

  return (
    <Card className="border-destructive/40">
      <CardContent className="space-y-4 py-5">
        {/* First, and unmissable. A form is not the answer to an injury. */}
        <a
          href="tel:911"
          className="flex items-center gap-3 rounded-xl bg-destructive px-4 py-3 text-destructive-foreground transition-opacity hover:opacity-90"
        >
          <Phone className="h-5 w-5 shrink-0" />
          <span className="text-sm font-semibold">
            If anyone is hurt or in danger, call 911 first.
            <span className="block font-normal opacity-90">Tap to call. Report it here afterwards.</span>
          </span>
        </a>

        <div>
          <p className="text-sm font-medium">What happened?</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {TYPES.map((t) => {
              const on = type === t.key;
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setType(t.key)}
                  className={cn(
                    'flex items-start gap-2.5 rounded-xl border p-3 text-start transition-colors',
                    on ? 'border-destructive bg-destructive/5' : 'border-border hover:border-destructive/40',
                  )}
                >
                  <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', on ? 'text-destructive' : 'text-muted-foreground')} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{t.label}</span>
                    <span className="block text-xs text-muted-foreground">{t.detail}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {type && (
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything that helps — where you are, what you need. Optional."
          />
        )}

        {/* The reason to report rather than tough it out. */}
        <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          Reporting pauses this trip. No late return, mileage or fuel charge can be applied while an incident is
          open, so telling us costs you nothing.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button variant="destructive" disabled={!type} loading={report.isPending} onClick={() => report.mutate()}>
            Report it
          </Button>
          <Button variant="ghost" onClick={() => { setOpen(false); setType(null); }}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
