import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Car, ChevronRight, Clock, ShieldCheck } from 'lucide-react-native';
import { Card, EmptyState, ErrorState, Screen, ScreenHeader, Section, SkeletonList, Text, space, useTheme } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { ABILITY_LABELS, captainApi } from '@catodrive/core/web/features/host/team-api';
import { formatDate } from '@catodrive/core/web/lib/utils/format';
import { AccountMenu } from '@/features/workspace/AccountMenu';

/** The website's /captain: the fleet a Captain works for, what they may do, and the trips due for handover. */
function CaptainQueue() {
  const { c } = useTheme();
  const router = useRouter();
  const q = useQuery({ queryKey: ['captain-queue'], queryFn: () => captainApi.queue() });
  const d = q.data;
  return (
    <Screen header={<ScreenHeader large title={d?.fleetName ?? 'Your jobs'} subtitle="Captain" />} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      {q.isPending ? <SkeletonList rows={3} height={80} /> : null}
      {q.isError ? <ErrorState message="Couldn't load your queue. Check your connection and try again." onRetry={() => void q.refetch()} /> : null}
      {q.isSuccess && !d ? <ErrorState message="You're not on a team yet. Ask whoever invited you to send a new invite link." /> : null}
      {d ? (
        <>
          <Card>
            <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <ShieldCheck size={20} color={c.primary} />
              </View>
              <Text variant="caption" tone="muted" style={{ flex: 1 }}>
                {d.staff.title ? `${d.staff.title} · ` : ''}
                {d.staff.abilities.map((a) => ABILITY_LABELS[a].label).join(', ')}
              </Text>
            </View>
          </Card>
          <Section title="Your jobs">
            {d.trips.length === 0 ? (
              <EmptyState icon={<Clock size={28} color={c.primary} />} title="Nothing due right now" body="Trips on your assigned cars will show up here as they're due for handover." />
            ) : (
              d.trips.map((t) => (
                <Card key={t._id} onPress={() => router.push(`/host/trips/${t.bookingId}`)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                    <Car size={20} color={c.primary} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="label">{t.vehicle ? `${t.vehicle.year} ${t.vehicle.make} ${t.vehicle.model}` : 'Vehicle'}</Text>
                      <Text variant="caption" tone="muted">
                        {t.vehicle?.licensePlate ? `${t.vehicle.licensePlate} · ` : ''}
                        {t.handover?.at ? `Handed over ${formatDate(t.handover.at)}` : 'Handover pending'}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={c.mutedForeground} />
                  </View>
                </Card>
              ))
            )}
          </Section>
        </>
      ) : null}
      <AccountMenu current="captain" />
    </Screen>
  );
}

export default function CaptainScreen() {
  return (
    <RequireAuth>
      <CaptainQueue />
    </RequireAuth>
  );
}
