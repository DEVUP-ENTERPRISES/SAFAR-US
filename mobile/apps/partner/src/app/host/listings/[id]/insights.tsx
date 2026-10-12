import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarCheck, ChevronRight, FileWarning, ShieldAlert, Star, TrendingUp } from 'lucide-react-native';
import { Badge, BarChart, Card, Divider, ErrorState, Screen, ScreenHeader, Section, Skeleton, StatTile, Text, space, useTheme } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { vehicleApi } from '@catodrive/core/web/features/vehicles/api';
import { formatDate, formatDay } from '@catodrive/core/web/lib/utils/format';

const money = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });

/** The website's /host/listings/[id]/insights: one car as an asset - earnings, occupancy, claims, bookings, reviews, paperwork. */
function Insights({ id }: { id: string }) {
  const { c } = useTheme();
  const router = useRouter();
  const q = useQuery({ queryKey: ['vehicle-insights', id], queryFn: () => vehicleApi.insights(id), retry: false });
  const header = <ScreenHeader title="Car insights" onBack={() => (router.canGoBack() ? router.back() : router.replace(`/host/listings/${id}`))} />;
  if (q.isPending) return <Screen header={header}><Skeleton height={320} /></Screen>;
  const d = q.data;
  if (q.isError || !d) return <Screen header={header}><ErrorState message="We couldn’t load this car’s numbers." onRetry={() => void q.refetch()} /></Screen>;
  const v = d.vehicle;
  const expiring = d.documents.filter((x) => x.expiringSoon);
  const icon = (I: typeof Star) => <I size={16} color={c.mutedForeground} />;

  return (
    <Screen header={header} onRefresh={() => void q.refetch()} refreshing={q.isRefetching}>
      <View style={{ gap: space.sm }}>
        <Text variant="title">{v.year} {v.make} {v.model}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm }}>
          <Badge label={v.status} tone={v.status === 'listed' ? 'success' : 'neutral'} />
          <Badge label={v.verificationStatus} tone={v.verificationStatus === 'verified' ? 'success' : 'warning'} />
          {v.ratingCount > 0 ? <Text variant="caption">★ {v.ratingAvg.toFixed(1)} ({v.ratingCount})</Text> : null}
        </View>
      </View>

      {expiring.length > 0 ? (
        <Card style={{ borderColor: c.warning, backgroundColor: c.warningSoft }}>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <AlertTriangle size={18} color={c.warning} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label">Paperwork expiring</Text>
              <Text variant="caption" tone="muted">
                {expiring.map((x) => `${x.category}${x.expiresAt ? ` (${formatDay(x.expiresAt)})` : ''}`).join(', ')} - this car is unlisted automatically when it lapses.
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        <StatTile icon={icon(TrendingUp)} label="Earned lifetime" value={money(d.earnings.lifetime)} sub={`${money(d.earnings.averagePerTrip)} per trip`} />
        <StatTile icon={icon(TrendingUp)} label="Last 30 days" value={money(d.earnings.last30d)} sub={`${d.utilisation.completedTrips} trips all-time`} />
        <StatTile icon={icon(CalendarCheck)} label="Occupancy" value={`${d.utilisation.occupancyPct}%`} sub={`${d.utilisation.daysRented90d} of the last 90 days`} />
        <StatTile icon={icon(ShieldAlert)} label="Claims" value={String(d.claims.total)} sub={d.claims.costToDate > 0 ? `${money(d.claims.costToDate)} paid out` : 'None settled'} tone={d.claims.open > 0 ? 'warning' : undefined} />
      </View>

      <Card>
        <Text variant="heading" style={{ marginBottom: space.md }}>Monthly earnings</Text>
        {d.earnings.byMonth.length === 0 ? (
          <Text variant="caption" tone="muted">No completed trips yet.</Text>
        ) : (
          <BarChart data={d.earnings.byMonth.slice(-12).map((m) => ({ label: monthLabel(m.month), value: m.amount }))} format={money} />
        )}
      </Card>

      <Section title="Upcoming trips">
        <Card padded={d.upcoming.length === 0}>
          {d.upcoming.length === 0 ? (
            <Text variant="caption" tone="muted">Nothing booked. Check your pricing and availability.</Text>
          ) : (
            d.upcoming.map((t, i) => (
              <View key={t.bookingId}>
                {i > 0 ? <Divider /> : null}
                <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.lg }} onPress={() => router.push(`/host/trips/${t.bookingId}`)} accessibilityRole="button">
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="label">{t.code}</Text>
                    <Text variant="caption" tone="muted">{formatDate(t.start)} → {formatDate(t.end)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Badge label={t.status === 'pending_approval' ? 'Awaiting you' : 'Confirmed'} tone={t.status === 'pending_approval' ? 'warning' : 'success'} />
                    <Text variant="label">{money(t.earnings)}</Text>
                  </View>
                  <ChevronRight size={16} color={c.mutedForeground} />
                </Pressable>
              </View>
            ))
          )}
        </Card>
      </Section>

      <Section title="What guests said">
        <Card>
          {d.reviews.recent.length === 0 ? (
            <Text variant="caption" tone="muted">No reviews yet.</Text>
          ) : (
            d.reviews.recent.map((r, i) => (
              <View key={i} style={{ gap: 2, paddingVertical: space.sm }}>
                <Text variant="caption">★ {r.rating.toFixed(1)} <Text variant="caption" tone="muted">· {formatDate(r.createdAt)}</Text></Text>
                {r.comment ? <Text variant="caption" tone="muted">{r.comment}</Text> : null}
              </View>
            ))
          )}
        </Card>
      </Section>

      <Section title="Documents">
        <Card>
          {d.documents.length === 0 ? (
            <Text variant="caption" tone="muted">No documents uploaded.</Text>
          ) : (
            d.documents.map((doc, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm }}>
                {doc.expiringSoon ? <FileWarning size={14} color={c.warning} /> : null}
                <Text variant="caption" style={{ flex: 1, textTransform: 'capitalize' }}>{doc.category}</Text>
                {doc.expiresAt ? <Text variant="caption" tone="muted">expires {formatDay(doc.expiresAt)}</Text> : null}
                <Badge label={doc.status} tone={doc.status === 'approved' ? 'success' : 'warning'} />
              </View>
            ))
          )}
        </Card>
      </Section>
    </Screen>
  );
}

export default function InsightsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireAuth>
      <Insights id={id} />
    </RequireAuth>
  );
}
