import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Clock, Lightbulb, PieChart, TrendingUp } from 'lucide-react-native';
import { BarChart, Card, Chip, Divider, EmptyState, KeyValue, Section, Skeleton, Text, space, useTheme } from '@catodrive/ui';
import { hostApi, type VehicleEconomics } from '@catodrive/core/web/features/host/api';

const money = (c: number) => `$${Math.round(c / 100).toLocaleString('en-US')}`;
const money2 = (c: number) => `$${(c / 100).toFixed(2)}`;
const WINDOWS = [30, 90, 365];

/** Rates rather than totals: each car's earnings per available day, idle cost, the money split, and booking patterns. */
export function EarningsInsights() {
  const { c } = useTheme();
  const [days, setDays] = useState(90);
  const q = useQuery({ queryKey: ['earnings-insights', days], queryFn: () => hostApi.earningsInsights(days), retry: false });
  if (q.isPending) return <Skeleton height={200} />;
  if (q.isError || !q.data) return null;
  const d = q.data;
  const earning = d.fleet.filter((f) => f.trips > 0);
  const totalIdle = d.fleet.reduce((s, f) => s + f.idleCostCents, 0);
  const icon = (I: typeof Clock) => <I size={16} color={c.primary} />;

  return (
    <Section title="Business insight">
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {WINDOWS.map((n) => <Chip key={n} label={n === 365 ? '1 year' : `${n} days`} selected={days === n} onPress={() => setDays(n)} />)}
      </View>
      {d.headline ? (
        <Card style={{ backgroundColor: c.primarySoft, borderColor: c.primary }}>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Lightbulb size={18} color={c.primary} />
            <Text style={{ flex: 1 }}>{d.headline}</Text>
          </View>
        </Card>
      ) : null}
      {d.fleet.length === 0 ? (
        <EmptyState title="No cars yet" body="List a car and its economics appear here." />
      ) : (
        <>
          <Card>
            <Heading icon={icon(TrendingUp)} text="Earnings per available day" />
            <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
              What each car returns for every day you had it listed - the fair way to compare cars that have been on the platform for different lengths of time.
            </Text>
            <View style={{ gap: space.md, marginTop: space.md }}>
              {d.fleet.map((f) => <FleetRow key={f.vehicleId} f={f} best={d.fleet[0].revPerAvailableDayCents} />)}
            </View>
          </Card>
          {totalIdle > 0 ? (
            <Card>
              <Heading icon={icon(CalendarClock)} text={`Idle days cost you ${money(totalIdle)}`} />
              <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
                That is your own daily rate multiplied by the days each car sat unbooked in this window. It is not a bill - it is what the fleet could have earned at full occupancy, which no fleet reaches. Use it to decide which car to reprice first.
              </Text>
            </Card>
          ) : null}
          <Card>
            <Heading icon={icon(PieChart)} text="Where the money went" />
            <View style={{ gap: space.sm, marginTop: space.md }}>
              <KeyValue label="Guests paid (before tax and fees)" value={money(d.split.grossCents)} />
              <KeyValue label={`Our cut (${d.split.commissionPct}%)`} value={`−${money(d.split.commissionCents)}`} tone="muted" />
              <Divider />
              <KeyValue label="You earned" value={money(d.split.netCents)} strong />
            </View>
          </Card>
          <Card>
            <Heading icon={icon(CalendarClock)} text="Which days trips start" />
            {d.byWeekday.every((w) => w.trips === 0) ? (
              <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>No completed trips in this window yet.</Text>
            ) : (
              <View style={{ marginTop: space.md, gap: space.sm }}>
                <BarChart height={150} format={money} data={d.byWeekday.map((w) => ({ label: w.label.slice(0, 3), value: w.earnedCents }))} />
                <Text variant="caption" tone="muted">If weekends dominate, your weekend multiplier is probably too low.</Text>
              </View>
            )}
          </Card>
          {d.leadTime.length > 0 ? (
            <Card>
              <Heading icon={icon(Clock)} text="How far ahead guests book" />
              <View style={{ marginTop: space.md, gap: space.sm }}>
                <BarChart height={140} format={money} data={d.leadTime.map((l) => ({ label: l.bucket, value: l.earnedCents }))} />
                <Text variant="caption" tone="muted">Mostly last-minute means an early-bird discount is giving away money nobody asked for. Mostly far ahead means the opposite.</Text>
              </View>
            </Card>
          ) : null}
          {earning.length === 0 ? (
            <Text variant="caption" tone="muted">No completed trips in this window, so the rates above are all zero. They fill in after your first trip settles.</Text>
          ) : null}
        </>
      )}
    </Section>
  );
}

function Heading({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {icon}
      <Text variant="label" style={{ flex: 1 }}>{text}</Text>
    </View>
  );
}

function FleetRow({ f, best }: { f: VehicleEconomics; best: number }) {
  const { c } = useTheme();
  const pct = best > 0 ? Math.max(2, Math.round((f.revPerAvailableDayCents / best) * 100)) : 0;
  return (
    <View style={{ gap: 4 }} accessibilityLabel={`${f.label}: ${money2(f.revPerAvailableDayCents)} per available day`}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
        <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>{f.label}</Text>
        <Text variant="label">{money2(f.revPerAvailableDayCents)}<Text variant="caption" tone="muted">/available day</Text></Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: c.muted, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', borderRadius: 4, backgroundColor: c.primary }} />
      </View>
      <Text variant="caption" tone="muted">
        {f.trips} trip{f.trips === 1 ? '' : 's'} · {f.utilisationPct}% booked · {money(f.earnedCents)} earned over {f.daysAvailable} days listed
      </Text>
    </View>
  );
}
