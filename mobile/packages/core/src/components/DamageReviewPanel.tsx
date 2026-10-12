import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Eye, ScanSearch, ShieldCheck } from 'lucide-react-native';
import { Badge, Button, Card, Skeleton, Text, useTheme, useToast, space } from '@catodrive/ui';
import { aiApi, type DamageAssessment } from '../web/features/ai/api';
import { ApiError } from '../web/lib/api/types';

function Verdict({ d }: { d: DamageAssessment }) {
  const { c } = useTheme();
  const confident = d.findings.filter((f) => f.confidence >= 0.6).length;
  const [Icon, color, title, body] =
    d.verdict === 'no_new_damage' && !d.needsHuman
      ? [ShieldCheck, c.success, 'No new damage found', 'Nothing in the checkout photos that was not already in the check-in photos.']
      : d.needsHuman
        ? [Eye, c.warning, 'Worth a human look', 'Possible differences were noted, but none clearly enough to call. Lighting and angle explain most of these.']
        : [AlertTriangle, c.destructive, `${confident} change${confident === 1 ? '' : 's'} found since pickup`, 'Listed below with the photos each was seen in, so you can check for yourself.'];
  return (
    <View style={{ flexDirection: 'row', gap: space.md }}>
      <Icon size={20} color={color} />
      <View style={{ flex: 1 }}>
        <Text variant="label">{title}</Text>
        <Text variant="caption" tone="muted">{body}</Text>
      </View>
    </View>
  );
}

/** The AI comparison of pickup and return photos: advisory only, never a charge. Hosts can run it; guests see it. */
export function DamageReviewPanel({ tripId, canRun }: { tripId: string; canRun: boolean }) {
  const { c } = useTheme();
  const qc = useQueryClient();
  const toast = useToast();
  const enabled = useQuery({ queryKey: ['ai-status'], queryFn: () => aiApi.status(), staleTime: 300_000 });
  const review = useQuery({ queryKey: ['damage-review', tripId], queryFn: () => aiApi.damageReview(tripId), enabled: !!enabled.data?.enabled, retry: false });
  const run = useMutation({
    meta: { silentError: true },
    mutationFn: () => aiApi.runDamageReview(tripId),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Photo comparison complete' });
      void qc.invalidateQueries({ queryKey: ['damage-review', tripId] });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not run the comparison' }),
  });
  if (!enabled.data?.enabled) return null;
  const d = review.data;
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <ScanSearch size={18} color={c.primary} />
        <Text variant="heading" style={{ flex: 1 }}>Photo comparison</Text>
        <Badge label="AI" />
      </View>
      <Text variant="caption" tone="muted">Check-in photos against checkout photos, side by side.</Text>
      {canRun ? <Button title={d ? 'Run again' : 'Compare photos'} size="sm" full={false} loading={run.isPending} onPress={() => run.mutate()} style={{ marginTop: space.sm }} /> : null}
      <View style={{ marginTop: space.md, gap: space.md }}>
        {review.isPending ? (
          <Skeleton height={60} />
        ) : !d ? (
          <Text variant="caption" tone="muted">{canRun ? 'Not run yet. Needs photos from both pickup and return.' : 'Your host has not run a comparison for this trip.'}</Text>
        ) : (
          <>
            <Verdict d={d} />
            {d.findings.map((f, i) => {
              const strong = f.confidence >= 0.6;
              return (
                <View key={i} style={{ gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <Text variant="label" style={{ flex: 1, textTransform: 'capitalize' }}>{f.type.replace(/_/g, ' ')} - {f.area}</Text>
                    <Badge label={`${Math.round(f.confidence * 100)}% confident`} tone={strong ? 'warning' : 'neutral'} />
                  </View>
                  <Text variant="caption">{f.description}</Text>
                  {f.note ? <Text variant="caption" tone="muted">{f.note}</Text> : null}
                  <Text variant="caption" tone="muted">
                    Check-in photo{f.checkinPhotoIndexes.length === 1 ? '' : 's'} {f.checkinPhotoIndexes.join(', ') || '-'} · checkout photo{f.checkoutPhotoIndexes.length === 1 ? '' : 's'} {f.checkoutPhotoIndexes.join(', ') || '-'}
                  </Text>
                  {!strong ? <Text variant="caption" tone="muted">Low confidence - treated as advisory only.</Text> : null}
                </View>
              );
            })}
            {d.overallNote ? <Text variant="caption">{d.overallNote}</Text> : null}
            <Text variant="caption" tone="muted">
              Compared {d.photosCompared.pre} check-in and {d.photosCompared.post} checkout photos. This is a comparison of photographs, not a charge and not a decision - any claim is opened and settled by a person. Repair costs are never estimated here.
            </Text>
          </>
        )}
      </View>
    </Card>
  );
}
