'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ScanSearch, ShieldCheck, AlertTriangle, Eye, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils/cn';
import { ApiError } from '@/lib/api/types';
import { aiApi, type DamageFinding } from '@/features/ai/api';

/**
 * The damage verdict, shown identically to the host and the guest.
 *
 * Both sides seeing the same words is the entire point — a verdict that reads
 * differently depending on who opened it is just another thing to argue about.
 * Only the host gets the button to run it; the guest reads the result.
 *
 * The copy is careful about what this is: a comparison of photographs, not a
 * bill and not a judgement. It says so on the card, because a guest who thinks
 * a robot just fined them will escalate before reading anything else.
 */
export function DamageReviewPanel({
  tripId,
  canRun,
}: {
  tripId: string;
  /** Host only. Running costs money and a guest could otherwise loop it. */
  canRun: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();

  const enabled = useQuery({ queryKey: ['ai-status'], queryFn: () => aiApi.status(), staleTime: 300_000 });
  const review = useQuery({
    queryKey: ['damage-review', tripId],
    queryFn: () => aiApi.damageReview(tripId),
    enabled: !!enabled.data?.enabled,
    retry: false,
  });

  const run = useMutation({
    mutationFn: () => aiApi.runDamageReview(tripId),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Photo comparison complete' });
      qc.invalidateQueries({ queryKey: ['damage-review', tripId] });
    },
    onError: (e) =>
      toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not run the comparison' }),
  });

  // No key configured: render nothing rather than a button that errors.
  if (!enabled.data?.enabled) return null;

  const d = review.data;

  return (
    <Card>
      <CardContent className="py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold">
              <ScanSearch className="h-5 w-5 text-primary" /> Photo comparison
              <Badge tone="muted">
                <Sparkles className="me-1 inline h-3 w-3" />AI
              </Badge>
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Check-in photos against checkout photos, side by side.
            </p>
          </div>
          {canRun && (
            <Button size="sm" loading={run.isPending} onClick={() => run.mutate()}>
              {d ? 'Run again' : 'Compare photos'}
            </Button>
          )}
        </div>

        {review.isLoading ? (
          <Skeleton className="mt-4 h-20 w-full" />
        ) : !d ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {canRun
              ? 'Not run yet. Needs photos from both pickup and return.'
              : 'Your host has not run a comparison for this trip.'}
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <Verdict assessment={d} />

            {d.findings.length > 0 && (
              <ul className="space-y-2">
                {d.findings.map((f, i) => (
                  <Finding key={i} f={f} />
                ))}
              </ul>
            )}

            {d.overallNote && (
              <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">{d.overallNote}</p>
            )}

            {/* What this is and is not. Stated on the card, not buried. */}
            <p className="border-t border-border pt-3 text-xs text-muted-foreground">
              Compared {d.photosCompared.pre} check-in and {d.photosCompared.post} checkout photos. This is a
              comparison of photographs, not a charge and not a decision — any claim is opened and settled by a
              person. Repair costs are never estimated here.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Verdict({ assessment: d }: { assessment: { verdict: string; needsHuman: boolean; findings: DamageFinding[] } }) {
  const confident = d.findings.filter((f) => f.confidence >= 0.6).length;

  if (d.verdict === 'no_new_damage' && !d.needsHuman) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/5 p-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
        <div>
          <p className="font-semibold">No new damage found</p>
          <p className="text-sm text-muted-foreground">
            Nothing in the checkout photos that was not already in the check-in photos.
          </p>
        </div>
      </div>
    );
  }

  // Something was seen, but not confidently. Say exactly that.
  if (d.needsHuman) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/5 p-3">
        <Eye className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <div>
          <p className="font-semibold">Worth a human look</p>
          <p className="text-sm text-muted-foreground">
            Possible differences were noted, but none clearly enough to call. Lighting and angle explain most of
            these.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
      <div>
        <p className="font-semibold">
          {confident} change{confident === 1 ? '' : 's'} found since pickup
        </p>
        <p className="text-sm text-muted-foreground">
          Listed below with the photos each was seen in, so you can check for yourself.
        </p>
      </div>
    </div>
  );
}

function Finding({ f }: { f: DamageFinding }) {
  const strong = f.confidence >= 0.6;
  const pct = Math.round(f.confidence * 100);
  return (
    <li className={cn('rounded-lg border p-3', strong ? 'border-border' : 'border-dashed border-border/70')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          <span className="capitalize">{f.type.replace(/_/g, ' ')}</span> — {f.area}
        </p>
        <span
          className={cn(
            'numeric rounded-full px-2 py-0.5 text-xs font-semibold',
            strong ? 'bg-foreground/10' : 'bg-muted text-muted-foreground',
          )}
        >
          {pct}% confident
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{f.description}</p>
      {f.note && <p className="mt-1 text-xs italic text-muted-foreground">{f.note}</p>}
      <p className="mt-1.5 text-xs text-muted-foreground">
        Check-in photo{f.checkinPhotoIndexes.length === 1 ? '' : 's'} {f.checkinPhotoIndexes.join(', ') || '—'}
        {' · '}checkout photo{f.checkoutPhotoIndexes.length === 1 ? '' : 's'} {f.checkoutPhotoIndexes.join(', ') || '—'}
      </p>
      {!strong && (
        <p className="mt-1 text-xs text-warning">Low confidence — treated as advisory only.</p>
      )}
    </li>
  );
}
