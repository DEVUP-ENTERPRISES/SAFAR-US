import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react-native';
import { BottomSheet, Button, DateRangeCalendar, Text, space, useConfirm, useTheme, useToast } from '@catodrive/ui';
import { vehicleApi } from '@catodrive/core/web/features/vehicles/api';
import { fmtRange, groupRanges } from '@catodrive/core/web/features/vehicles/listing-form';

/** Block or reopen a window of dates, and see what is blocked over the next 90 days. */
export function AvailabilityPanel({ vehicleId, onChanged }: { vehicleId: string; onChanged: () => void }) {
  const { c } = useTheme();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [block, setBlock] = useState({ start: '', end: '' });
  const [picking, setPicking] = useState(false);
  const availability = useQuery({
    queryKey: ['vehicle-availability', vehicleId],
    queryFn: () => vehicleApi.getCalendar(vehicleId, new Date().toISOString(), new Date(Date.now() + 90 * 86_400_000).toISOString()),
  });
  const setAvail = useMutation({
    mutationFn: ({ action, start, end }: { action: 'block' | 'unblock'; start: string; end: string }) =>
      vehicleApi.setAvailability(vehicleId, new Date(start).toISOString(), new Date(end).toISOString(), action),
    onSuccess: (_r, { action }) => {
      onChanged();
      void qc.invalidateQueries({ queryKey: ['vehicle-availability', vehicleId] });
      toast({ tone: 'success', title: action === 'block' ? 'Dates blocked' : 'Dates reopened' });
    },
  });
  const blocked = groupRanges((availability.data ?? []).filter((d) => d.state === 'blocked').map((d) => d.dayKey).sort());
  const ready = !!block.start && !!block.end;

  const doBlock = async () => {
    const { ok } = await confirm({ title: 'Block these dates?', description: 'Guests will not be able to book this car for that window.', confirmLabel: 'Block dates', tone: 'destructive' });
    if (ok) setAvail.mutate({ action: 'block', ...block });
  };

  return (
    <View style={{ gap: space.md }}>
      <Button title={ready ? fmtRange(block.start, block.end) : 'Choose dates'} variant="outline" onPress={() => setPicking(true)} />
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Button title="Block" size="sm" disabled={!ready} loading={setAvail.isPending && setAvail.variables?.action === 'block'} onPress={() => void doBlock()} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Unblock" size="sm" variant="outline" disabled={!ready} onPress={() => setAvail.mutate({ action: 'unblock', ...block })} />
        </View>
      </View>
      <Text variant="small" tone="muted">CURRENTLY BLOCKED</Text>
      {availability.isPending ? (
        <Text variant="caption" tone="muted">Loading…</Text>
      ) : blocked.length === 0 ? (
        <Text variant="caption" tone="muted">No blocked dates in the next 90 days.</Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {blocked.map((r) => (
            <View key={r.from} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingLeft: 12, paddingRight: 6, paddingVertical: 6, backgroundColor: c.muted }}>
              <Text variant="caption">{fmtRange(r.from, r.to)}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Reopen these dates" hitSlop={8} onPress={() => setAvail.mutate({ action: 'unblock', start: r.from, end: r.to })}>
                <Trash2 size={14} color={c.destructive} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
      <BottomSheet visible={picking} onClose={() => setPicking(false)} title="Dates" footer={<Button title="Done" onPress={() => setPicking(false)} />}>
        <DateRangeCalendar from={block.start} to={block.end} onChange={(start, end) => setBlock({ start, end })} />
      </BottomSheet>
    </View>
  );
}
