import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Card, EmptyState, Skeleton, Text, space, useTheme } from '@catodrive/ui';
import { hostTripsApi, type HostTrip } from '@catodrive/core/web/features/host/trips.api';
import { useMyVehicles } from '@catodrive/core/web/features/vehicles/hooks';

const DAYS = 14;
const ROW = 56;
const CELL = 64;
const NAME_COL = 120;

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
const key = (d: Date) => d.toISOString().slice(0, 10);

/** The website's fleet calendar: cars down, a fortnight across; each free day shows what a guest would pay, booked days open the trip. */
export function HostCalendar() {
  const { c } = useTheme();
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  const vehicles = useMyVehicles(true);
  const booked = useQuery({ queryKey: ['host-trips', 'booked'], queryFn: () => hostTripsApi.booked() });
  const start = useMemo(() => addDays(new Date(), offset * DAYS), [offset]);
  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(start, i)), [start]);

  if (vehicles.isPending) return <Skeleton height={380} />;
  if (!vehicles.data || vehicles.data.length === 0) return <EmptyState title="No vehicles" body="List a car to see its calendar." />;

  const spans = new Map<string, { from: string; to: string; trip: HostTrip }[]>();
  for (const t of booked.data ?? []) {
    const list = spans.get(t.vehicle._id) ?? [];
    list.push({ from: key(new Date(t.period.start)), to: key(new Date(t.period.end)), trip: t });
    spans.set(t.vehicle._id, list);
  }
  const bookingOn = (vid: string, d: Date) => {
    const k = key(d);
    return (spans.get(vid) ?? []).find((s) => k >= s.from && k <= s.to);
  };
  const todayKey = key(new Date());
  const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text variant="label" style={{ flex: 1 }}>
          {start.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} – {addDays(start, DAYS - 1).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </Text>
        <NavButton label="Previous fortnight" onPress={() => setOffset((o) => o - 1)} icon={<ChevronLeft size={18} color={c.foreground} />} />
        <NavButton label="Next fortnight" onPress={() => setOffset((o) => o + 1)} icon={<ChevronRight size={18} color={c.foreground} />} />
      </View>

      <Card padded={false}>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ width: NAME_COL, borderRightWidth: 1, borderColor: c.border }}>
            <View style={{ height: ROW, justifyContent: 'center', paddingHorizontal: space.sm, borderBottomWidth: 1, borderColor: c.border }}>
              <Text variant="small" tone="muted">VEHICLE</Text>
            </View>
            {vehicles.data.map((v) => (
              <View key={v._id} style={{ height: ROW, justifyContent: 'center', paddingHorizontal: space.sm, borderBottomWidth: 1, borderColor: c.border }}>
                <Text variant="caption" numberOfLines={1} style={{ fontWeight: '600' }}>{v.make} {v.model}</Text>
                <Text variant="small" tone="muted" numberOfLines={1}>{v.registrationNumber ?? '-'}</Text>
              </View>
            ))}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={{ flexDirection: 'row', height: ROW, borderBottomWidth: 1, borderColor: c.border }}>
                {days.map((d) => (
                  <View key={key(d)} style={{ width: CELL, alignItems: 'center', justifyContent: 'center', backgroundColor: isWeekend(d) ? c.subtle : undefined }}>
                    <Text variant="small" tone="muted">{d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}</Text>
                    <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: key(d) === todayKey ? c.foreground : undefined }}>
                      <Text variant="label" style={{ color: key(d) === todayKey ? c.background : c.foreground }}>{d.getDate()}</Text>
                    </View>
                  </View>
                ))}
              </View>
              {vehicles.data.map((v) => (
                <View key={v._id} style={{ flexDirection: 'row', height: ROW, borderBottomWidth: 1, borderColor: c.border }}>
                  {days.map((d) => {
                    const weekend = isWeekend(d);
                    const span = bookingOn(v._id, d);
                    const request = span?.trip.status === 'pending_approval';
                    const first = !!span && (span.from === key(d) || key(d) === key(days[0]));
                    const rate = Math.round((v.pricing.dailyPrice * (weekend ? v.pricing.weekendMultiplierBps ?? 10000 : 10000)) / 10000);
                    const cellBg = span ? (request ? c.warningSoft : c.primarySoft) : weekend ? c.subtle : undefined;
                    return span ? (
                      <Pressable
                        key={key(d)}
                        accessibilityRole="button"
                        accessibilityLabel={`${request ? 'Request' : 'Booked'} · ${span.trip.guest.name} · ${span.trip.code}`}
                        onPress={() => router.push(`/host/trips/${span.trip.bookingId}`)}
                        style={{ width: CELL, backgroundColor: cellBg, justifyContent: 'center', gap: 4, paddingHorizontal: 2, borderLeftWidth: 1, borderColor: c.border }}
                      >
                        <View style={{ height: 6, borderRadius: 3, backgroundColor: request ? c.warning : c.primary }} />
                        {first ? <Text variant="small" numberOfLines={1}>{request ? 'Request' : span.trip.guest.name.split(' ')[0]}</Text> : null}
                      </Pressable>
                    ) : (
                      <View key={key(d)} style={{ width: CELL, backgroundColor: cellBg, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderColor: c.border }}>
                        <Text variant="caption" style={{ fontWeight: '600' }}>${(rate / 100).toFixed(0)}</Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </Card>

      <Text variant="caption" tone="muted">
        Teal bar: booked · amber bar: request waiting for you · tap a booked day to open it · prices shown are what a guest pays that day (weekend rates included).
      </Text>
    </View>
  );
}

function NavButton({ label, onPress, icon }: { label: string; onPress: () => void; icon: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={{ width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', marginLeft: space.xs }}>
      {icon}
    </Pressable>
  );
}
