import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, Receipt, X } from 'lucide-react-native';
import { Button, Card, Chip, Input, Text, space, useTheme, useToast } from '@catodrive/ui';
import { FREEFORM, NEW_INCIDENTAL, RATED, applyIncidentals, incidentalsValid, isFreeform, type IncidentalKind, type IncidentalLine } from '@catodrive/core/web/features/host/incidentals';
import { ApiError } from '@catodrive/core/web/lib/api/types';

const KINDS: { value: IncidentalKind; label: string }[] = [
  ...Object.entries(RATED).map(([k, v]) => ({ value: k as IncidentalKind, label: v.label })),
  ...Object.entries(FREEFORM).map(([k, v]) => ({ value: k as IncidentalKind, label: v })),
];

/** Post-trip charges: platform-priced types take a quantity, tolls/fines/other take a capped amount and an explanation. */
export function IncidentalsForm({ bookingId }: { bookingId: string }) {
  const { c } = useTheme();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<IncidentalLine[]>([NEW_INCIDENTAL]);
  const submit = useMutation({
    meta: { silentError: true },
    mutationFn: () => applyIncidentals(bookingId, lines),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Charges applied', body: 'Your guest has been notified with the reason.' });
      setOpen(false);
      setLines([NEW_INCIDENTAL]);
      void qc.invalidateQueries({ queryKey: ['host-trip', bookingId] });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not apply those charges' }),
  });
  const update = (i: number, patch: Partial<IncidentalLine>) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  if (!open) return <Button title="Add a post-trip charge" variant="outline" icon={<Receipt size={16} color={c.foreground} />} onPress={() => setOpen(true)} />;

  return (
    <Card>
      <Text variant="heading">Post-trip charges</Text>
      <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
        Within 7 days of the trip ending. Tolls, fines and other charges are capped at $250 each and need an explanation your guest will read - anything larger belongs in a damage claim.
      </Text>
      {lines.map((l, i) => {
        const free = isFreeform(l.type);
        const unit = RATED[l.type]?.unit;
        return (
          <View key={i} style={{ gap: space.sm, marginTop: space.lg, paddingTop: space.md, borderTopWidth: i > 0 ? 1 : 0, borderColor: c.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text variant="label" style={{ flex: 1 }}>What happened</Text>
              {lines.length > 1 ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Remove line" hitSlop={10} onPress={() => setLines((p) => p.filter((_, j) => j !== i))}>
                  <X size={18} color={c.mutedForeground} />
                </Pressable>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
              {KINDS.map((k) => <Chip key={k.value} label={k.label} selected={l.type === k.value} onPress={() => update(i, { type: k.value, qty: undefined, amount: undefined })} />)}
            </View>
            {unit ? <Input label={unit} keyboardType="number-pad" value={l.qty ? String(l.qty) : ''} onChangeText={(v) => update(i, { qty: Number(v) || undefined })} /> : null}
            {free ? <Input label="Amount ($)" hint="Capped at $250" keyboardType="decimal-pad" value={l.amount ? String(l.amount) : ''} onChangeText={(v) => update(i, { amount: Number(v) || undefined })} /> : null}
            <Input
              label={free ? 'Explain the charge' : 'Note'}
              hint={free ? 'Required - your guest sees this' : 'Optional'}
              value={l.note}
              onChangeText={(v) => update(i, { note: v })}
              placeholder="Toll on I-30 during the trip, receipt attached"
            />
            {free && l.note.trim().length > 0 && l.note.trim().length < 10 ? (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <AlertTriangle size={14} color={c.warning} />
                <Text variant="caption" tone="warning">A bit more detail - an unexplained charge gets disputed.</Text>
              </View>
            ) : null}
          </View>
        );
      })}
      <View style={{ gap: space.sm, marginTop: space.lg }}>
        <Button title="Another charge" variant="ghost" size="sm" icon={<Plus size={16} color={c.foreground} />} onPress={() => setLines((p) => [...p, NEW_INCIDENTAL])} />
        <Button title="Apply charges" disabled={!incidentalsValid(lines)} loading={submit.isPending} onPress={() => submit.mutate()} />
        <Button title="Cancel" variant="ghost" onPress={() => setOpen(false)} />
      </View>
    </Card>
  );
}
