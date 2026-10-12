import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Printer, ShieldCheck } from 'lucide-react-native';
import { Badge, Button, Card, Divider, ErrorState, KeyValue, Screen, ScreenHeader, Skeleton, Text, space, useTheme, useToast } from '@catodrive/ui';
import { RequireAuth, openInAppBrowser, printHtml, webUrl } from '@catodrive/core';
import { hostTripsApi } from '@catodrive/core/web/features/host/trips.api';
import { formatDate, formatDateRange, kmToMiles, perKmToPerMile } from '@catodrive/core/web/lib/utils/format';
import { hostReceipt, hostReceiptHtml } from '@/features/host/host-receipt-html';

/** The website's host trip receipt: what the guest paid, the commission, and the host's earnings. */
function HostReceipt({ bookingId }: { bookingId: string }) {
  const { c } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const q = useQuery({ queryKey: ['host-trip', bookingId], queryFn: () => hostTripsApi.one(bookingId) });
  const header = <ScreenHeader title="Receipt" onBack={() => (router.canGoBack() ? router.back() : router.replace(`/host/trips/${bookingId}`))} />;
  if (q.isPending) return <Screen header={header}><Skeleton height={320} /></Screen>;
  const t = q.data;
  if (q.isError || !t) return <Screen header={header}><ErrorState message="Receipt not found." onRetry={() => void q.refetch()} /></Screen>;

  const { hasBreakdown, r, m, guest, payout, paid } = hostReceipt(t);
  const verifyUrl = webUrl(`/verify/${bookingId}`);
  const sign = (s?: '-' | '+') => (s === '-' ? '−' : s === '+' ? '+' : '');
  const print = async () => {
    if (!(await printHtml(hostReceiptHtml(t, verifyUrl)))) toast({ tone: 'error', title: 'Printing isn’t available on this phone right now.' });
  };

  return (
    <Screen header={header}>
      <Card>
        <Text variant="small" tone="primary">CATODRIVE · TRIP RECEIPT</Text>
        <Text variant="title" style={{ marginTop: 4 }}>{t.code}</Text>
        <Text variant="caption" tone="muted">Issued {formatDate(r.issuedAt)}</Text>
        <View style={{ marginTop: space.sm }}>
          <Badge label={paid ? 'Paid' : t.status.replace(/_/g, ' ')} tone={paid ? 'success' : 'neutral'} />
        </View>
        <Button title="Print or save as PDF" variant="outline" size="sm" full={false} icon={<Printer size={16} color={c.foreground} />} style={{ marginTop: space.md }} onPress={() => void print()} />
      </Card>
      <Card>
        <View style={{ gap: space.sm }}>
          <KeyValue label="Vehicle" value={`${t.vehicle.make} ${t.vehicle.model} ${t.vehicle.year}${t.vehicle.plate ? ` · ${t.vehicle.plate}` : ''}`} />
          <KeyValue label="Trip dates" value={`${formatDateRange(t.period.start, t.period.end)}${hasBreakdown ? ` · ${r.days} day${r.days === 1 ? '' : 's'}` : ''}`} />
          <KeyValue label="Guest" value={`${t.guest.name} · ${t.guest._id.slice(0, 8)}`} />
          <KeyValue
            label="Mileage"
            value={`${t.mileage.includedKm === 0 ? 'Unlimited' : `${kmToMiles(t.mileage.includedKm)} miles included`}${t.mileage.overageFeePerKm ? ` · ${m(perKmToPerMile(t.mileage.overageFeePerKm))}/mile over` : ''}`}
          />
        </View>
      </Card>
      <Card>
        <View style={{ gap: space.sm }}>
          {hasBreakdown ? (
            <>
              <Text variant="small" tone="muted">GUEST CHARGES</Text>
              {guest.map((l) => <KeyValue key={l.label} label={l.label} value={`${sign(l.sign)}${l.value}`} tone={l.label.startsWith('Rental') ? undefined : 'muted'} />)}
              <KeyValue label="Guest total" value={m(r.total)} />
              <Divider />
              <Text variant="small" tone="muted">YOUR PAYOUT</Text>
              {payout.map((l) => <KeyValue key={l.label} label={l.label} value={`${sign(l.sign)}${l.value}`} tone="muted" />)}
              <Divider />
            </>
          ) : null}
          <KeyValue label="Your earnings" value={m(r.hostEarnings)} strong />
        </View>
      </Card>
      <Text variant="caption" tone="muted">Booking ID · {t.bookingId}</Text>
      <Text variant="caption" tone="muted">
        Issued by CatoDrive. Figures are the price locked at booking and never change afterward. Any refundable security deposit is authorised separately and not included here.
      </Text>
      <Button title="Verify this receipt" variant="ghost" icon={<ShieldCheck size={16} color={c.foreground} />} onPress={() => void openInAppBrowser(verifyUrl)} />
    </Screen>
  );
}

export default function HostReceiptScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  return (
    <RequireAuth>
      <HostReceipt bookingId={bookingId} />
    </RequireAuth>
  );
}
