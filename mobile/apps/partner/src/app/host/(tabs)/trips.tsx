import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Car } from 'lucide-react-native';
import { Chip, EmptyState, ErrorState, Screen, ScreenHeader, SkeletonList, Text, space, useTheme } from '@catodrive/ui';
import { hostTripsApi } from '@catodrive/core/web/features/host/trips.api';
import { groupByDay } from '@catodrive/core/web/features/host/trip-timing';
import { HostCalendar } from '@/features/host/HostCalendar';
import { TripCard } from '@/features/host/TripCard';

type Tab = 'booked' | 'history' | 'calendar';
const TABS: { key: Tab; label: string }[] = [
  { key: 'booked', label: 'Booked' },
  { key: 'history', label: 'History' },
  { key: 'calendar', label: 'Calendar' },
];

/** The website's /host/trips: upcoming trips by day, past trips, and the fleet calendar. */
export default function HostTripsScreen() {
  const { c } = useTheme();
  const [tab, setTab] = useState<Tab>('booked');
  const booked = useQuery({ queryKey: ['host-trips', 'booked'], queryFn: () => hostTripsApi.booked(), enabled: tab !== 'history' });
  const history = useQuery({ queryKey: ['host-trips', 'history'], queryFn: () => hostTripsApi.history(), enabled: tab === 'history' });
  const active = tab === 'history' ? history : booked;
  const grouped = useMemo(() => (active.data ? groupByDay(active.data, tab === 'booked' ? 'start' : 'end') : []), [active.data, tab]);

  return (
    <Screen header={<ScreenHeader large title="Trips" subtitle="Host" />} onRefresh={() => void active.refetch()} refreshing={active.isRefetching}>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {TABS.map((t) => <Chip key={t.key} label={t.label} selected={tab === t.key} onPress={() => setTab(t.key)} />)}
      </View>
      {tab === 'calendar' ? (
        <HostCalendar />
      ) : active.isPending ? (
        <SkeletonList rows={4} height={150} />
      ) : active.isError && !active.data ? (
        <ErrorState message="We couldn’t load your trips." onRetry={() => void active.refetch()} />
      ) : !active.data || active.data.length === 0 ? (
        <EmptyState
          icon={tab === 'booked' ? <Car size={28} color={c.primary} /> : <CalendarDays size={28} color={c.primary} />}
          title={tab === 'booked' ? 'No upcoming trips' : 'No past trips'}
          body={tab === 'booked' ? 'When a guest books one of your cars, the trip appears here.' : 'Completed and cancelled trips show up here.'}
        />
      ) : (
        grouped.map(([label, trips]) => (
          <View key={label} style={{ gap: space.md }}>
            <Text variant="small" tone="muted">{label}</Text>
            {trips.map((t) => <TripCard key={t.bookingId} trip={t} />)}
          </View>
        ))
      )}
    </Screen>
  );
}
