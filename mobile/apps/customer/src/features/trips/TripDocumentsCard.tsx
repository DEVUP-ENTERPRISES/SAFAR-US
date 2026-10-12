import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, FileText, ShieldCheck } from 'lucide-react-native';
import { Badge, Button, Card, Text, useConfirm, useTheme, useToast, space } from '@catodrive/ui';
import { TimedViewer } from '@catodrive/core';
import { tripDocumentsApi, type TripDocumentsView } from '@catodrive/core/web/features/trips/documents-api';
import { ApiError } from '@catodrive/core/web/lib/api/types';

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

/** Registration and proof of insurance for a traffic stop: shown briefly, watermarked, logged, host alerted. */
export function TripDocumentsCard({ bookingId }: { bookingId: string }) {
  const { c } = useTheme();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [view, setView] = useState<TripDocumentsView | null>(null);

  const status = useQuery({
    queryKey: ['trip-documents', bookingId],
    queryFn: () => tripDocumentsApi.status(bookingId),
    retry: false,
    refetchInterval: (q) => (q.state.data?.live && q.state.data.requestedAt ? 20_000 : false),
  });
  const open = useMutation({
    meta: { silentError: true },
    mutationFn: () => tripDocumentsApi.open(bookingId),
    onSuccess: setView,
    onError: (e) => {
      toast({ tone: 'error', title: errorText(e) });
      void qc.invalidateQueries({ queryKey: ['trip-documents', bookingId] });
    },
  });
  const request = useMutation({
    meta: { silentError: true },
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

  const onShow = async () => {
    const { ok } = await confirm({
      title: 'Show the car’s documents?',
      description: `• Show them only to a law-enforcement officer.\n• They close automatically after ${duration}. You can open them again.\n• Your host is told you opened them, and every view is recorded.\n• Each page is stamped with your name, trip and the time, so copies can be traced.`,
      confirmLabel: 'Open now',
    });
    if (ok) open.mutate();
  };

  return (
    <Card>
      <View style={styles.row}>
        <FileText size={20} color={c.primary} />
        <View style={{ flex: 1 }}>
          <Text variant="heading">Vehicle documents</Text>
          <Text variant="caption" tone="muted">Registration and proof of insurance, if an officer asks for them.</Text>
        </View>
      </View>
      <View style={styles.list}>
        {s.documents.map((d) => (
          <View key={d.category} style={styles.doc}>
            <Text style={{ flex: 1 }}>{d.label}</Text>
            <Badge label={d.available ? 'On file' : d.expired ? 'Expired' : 'Missing'} tone={d.available ? 'success' : 'warning'} />
          </View>
        ))}
      </View>
      {s.requestedAt && missing.length ? (
        <View style={styles.row}>
          <BellRing size={16} color={c.warning} />
          <Text variant="caption" tone="muted" style={{ flex: 1 }}>Your host has been alerted. This updates as soon as they upload.</Text>
        </View>
      ) : null}
      <View style={styles.actions}>
        {anyOnFile ? <Button title="Show documents" icon={<ShieldCheck size={18} color={c.primaryForeground} />} loading={open.isPending} onPress={() => void onShow()} /> : null}
        {missing.length ? <Button title="Request documents" variant="outline" icon={<BellRing size={18} color={c.foreground} />} loading={request.isPending} onPress={() => request.mutate()} /> : null}
      </View>
      {view ? (
        <TimedViewer
          title="Vehicle documents"
          subtitle="For a traffic stop only · your host has been told"
          seconds={view.viewSeconds}
          items={view.documents}
          load={(id) => tripDocumentsApi.file(bookingId, id, view.token)}
          onClose={() => setView(null)}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  list: { gap: space.sm, marginVertical: space.md },
  doc: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  actions: { gap: space.sm, marginTop: space.sm },
});
