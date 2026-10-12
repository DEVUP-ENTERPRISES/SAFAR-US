import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, Car, HeartPulse, Phone, ShieldAlert, Wrench } from 'lucide-react-native';
import { Button, Card, Input, Text, useTheme, useToast, radius, space } from '@catodrive/ui';
import { INCIDENT_TYPES, reportIncident, type IncidentType } from '../web/features/trips/incidents';
import { openExternal } from '../links';

const ICONS: Record<IncidentType, React.ComponentType<{ size?: number; color?: string }>> = { accident: Car, breakdown: Wrench, medical: HeartPulse, theft: Ban, unsafe: ShieldAlert };

/** "Something has gone wrong": 911 first, then a report that pauses the trip and alerts the host and support. */
export function IncidentReport({ tripId }: { tripId: string }) {
  const { c } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<IncidentType | null>(null);
  const [note, setNote] = useState('');
  const report = useMutation({
    meta: { silentError: true },
    mutationFn: () => reportIncident(tripId, type!, note),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Reported - we are on it', body: 'Your host and our support team have been alerted. This trip is paused.' });
      setOpen(false);
      setType(null);
      setNote('');
      void qc.invalidateQueries({ queryKey: ['trip', tripId] });
    },
    onError: () => toast({ tone: 'error', title: 'Could not send that. Call support if it is urgent.' }),
  });

  if (!open) return <Button title="Something has gone wrong" variant="outline" icon={<AlertTriangle size={18} color={c.foreground} />} onPress={() => setOpen(true)} />;

  return (
    <Card style={{ borderColor: c.destructive }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Call 911" onPress={() => void openExternal('tel:911')} style={[styles.call, { backgroundColor: c.destructive }]}>
        <Phone size={20} color={c.destructiveForeground} />
        <View style={{ flex: 1 }}>
          <Text variant="label" style={{ color: c.destructiveForeground }}>If anyone is hurt or in danger, call 911 first.</Text>
          <Text variant="caption" style={{ color: c.destructiveForeground, opacity: 0.85 }}>Tap to call. Report it here afterwards.</Text>
        </View>
      </Pressable>
      <Text variant="label" style={{ marginTop: space.md }}>What happened?</Text>
      <View style={{ gap: space.sm, marginTop: space.sm }}>
        {INCIDENT_TYPES.map((t) => {
          const Icon = ICONS[t.key];
          const on = type === t.key;
          return (
            <Pressable key={t.key} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setType(t.key)} style={[styles.type, { borderColor: on ? c.destructive : c.border, backgroundColor: on ? c.destructiveSoft : c.card }]}>
              <Icon size={20} color={on ? c.destructive : c.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text variant="label">{t.label}</Text>
                <Text variant="caption" tone="muted">{t.detail}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {type ? <Input value={note} onChangeText={setNote} placeholder="Anything that helps - where you are, what you need. Optional." multiline style={{ minHeight: 72, textAlignVertical: 'top' }} /> : null}
      <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>Reporting pauses this trip. No late return, mileage or fuel charge can be applied while an incident is open, so telling us costs you nothing.</Text>
      <View style={{ gap: space.sm, marginTop: space.md }}>
        <Button title="Report it" variant="destructive" disabled={!type} loading={report.isPending} onPress={() => report.mutate()} />
        <Button title="Cancel" variant="ghost" onPress={() => { setOpen(false); setType(null); }} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  call: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.lg, padding: space.md },
  type: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1.5, borderRadius: radius.lg, padding: space.md },
});
