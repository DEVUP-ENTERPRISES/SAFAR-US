'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Receipt, Plus, X, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/types';
import { api } from '@/lib/api/client';

type Kind = 'fuel' | 'cleaning' | 'smoking' | 'pet' | 'late_return' | 'toll' | 'fine' | 'other';

/** Types priced by admin config vs types where the host names the amount. */
const RATED: Record<string, { label: string; unit?: string }> = {
  cleaning: { label: 'Extra cleaning' },
  smoking: { label: 'Smoked in the car' },
  pet: { label: 'Unapproved pet' },
  fuel: { label: 'Fuel shortfall', unit: '% of tank' },
  late_return: { label: 'Late return', unit: 'hours late' },
};
const FREEFORM: Record<string, string> = {
  toll: 'Toll',
  fine: 'Fine',
  other: 'Other',
};

interface Line { type: Kind; qty?: number; amount?: number; note: string }

/**
 * Post-trip charges.
 *
 * This bills a card the guest already handed over, with nobody standing
 * between the host and that card — so the server enforces a window, a ceiling
 * on free-form amounts, and a required explanation. This screen states those
 * limits up front rather than letting a host write out a $900 charge and
 * discover on submit that it was never allowed.
 *
 * Rated types take a quantity and are priced by the platform, so a host cannot
 * decide what an hour of lateness is worth. Only tolls, fines and "other" take
 * an amount, and those are the ones that are capped.
 */
export function IncidentalsForm({ bookingId, onDone }: { bookingId: string; onDone?: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([{ type: 'cleaning', note: '' }]);

  const submit = useMutation({
    mutationFn: () =>
      api.post(`/bookings/${bookingId}/incidentals`, {
        items: lines.map((l) => ({
          type: l.type,
          ...(l.qty ? { qty: l.qty } : {}),
          ...(l.amount ? { amount: Math.round(l.amount * 100) } : {}),
          note: l.note.trim() || undefined,
        })),
      }),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Charges applied', description: 'Your guest has been notified with the reason.' });
      setOpen(false);
      setLines([{ type: 'cleaning', note: '' }]);
      qc.invalidateQueries({ queryKey: ['host-trip', bookingId] });
      onDone?.();
    },
    // The server's message names the actual limit that was hit; passing it
    // through is more useful than a generic failure.
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not apply those charges' }),
  });

  const update = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const isFreeform = (t: Kind) => t in FREEFORM;
  const valid = lines.every((l) =>
    isFreeform(l.type)
      ? (l.amount ?? 0) > 0 && l.note.trim().length >= 10
      : RATED[l.type]?.unit
        ? (l.qty ?? 0) > 0
        : true,
  );

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Receipt className="h-4 w-4" /> Add a post-trip charge
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div>
          <p className="font-semibold">Post-trip charges</p>
          {/* The rules, before the form rather than after the rejection. */}
          <p className="mt-1 text-sm text-muted-foreground">
            Within 7 days of the trip ending. Tolls, fines and other charges are capped at $250 each and need an
            explanation your guest will read — anything larger belongs in a damage claim.
          </p>
        </div>

        {lines.map((l, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border p-3">
            <div className="flex items-start gap-2">
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <Field label="What happened">
                  <Select
                    size="sm"
                    value={l.type}
                    onChange={(e) => update(i, { type: e.target.value as Kind, qty: undefined, amount: undefined })}
                  >
                    {Object.entries(RATED).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    {Object.entries(FREEFORM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </Field>

                {RATED[l.type]?.unit && (
                  <Field label={RATED[l.type].unit!}>
                    <Input
                      size="sm"
                      type="number"
                      min={0}
                      value={l.qty ?? ''}
                      onChange={(e) => update(i, { qty: Number(e.target.value) || undefined })}
                    />
                  </Field>
                )}

                {isFreeform(l.type) && (
                  <Field label="Amount ($)" hint="Capped at $250">
                    <Input
                      size="sm"
                      type="number"
                      min={0}
                      max={250}
                      step="0.01"
                      value={l.amount ?? ''}
                      onChange={(e) => update(i, { amount: Number(e.target.value) || undefined })}
                    />
                  </Field>
                )}
              </div>
              {lines.length > 1 && (
                <button
                  onClick={() => setLines((p) => p.filter((_, j) => j !== i))}
                  aria-label="Remove line"
                  className="mt-7 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <Field
              label={isFreeform(l.type) ? 'Explain the charge' : 'Note'}
              hint={isFreeform(l.type) ? 'Required — your guest sees this' : 'Optional'}
            >
              <Input
                size="sm"
                value={l.note}
                onChange={(e) => update(i, { note: e.target.value })}
                placeholder="Toll on I-30 during the trip, receipt attached"
              />
            </Field>

            {isFreeform(l.type) && l.note.trim().length > 0 && l.note.trim().length < 10 && (
              <p className="flex items-center gap-1.5 text-xs text-warning">
                <AlertTriangle className="h-3.5 w-3.5" /> A bit more detail — an unexplained charge gets disputed.
              </p>
            )}
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setLines((p) => [...p, { type: 'cleaning', note: '' }])}>
            <Plus className="h-4 w-4" /> Another charge
          </Button>
          <span className="flex-1" />
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" disabled={!valid} loading={submit.isPending} onClick={() => submit.mutate()}>
            Apply charges
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
