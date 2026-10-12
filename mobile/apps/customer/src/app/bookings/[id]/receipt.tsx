import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react-native';
import { Badge, Button, Card, Divider, ErrorState, KeyValue, Screen, ScreenHeader, Skeleton, Text, useTheme, useToast, space } from '@catodrive/ui';
import { RequireAuth, printHtml } from '@catodrive/core';
import { bookingApi } from '@catodrive/core/web/features/bookings/api';
import { statusLabel } from '@catodrive/core/web/features/bookings/status';
import { vehicleApi } from '@catodrive/core/web/features/vehicles/api';
import { formatDate, formatDateRange, formatMoney } from '@catodrive/core/web/lib/utils/format';
import { receiptHtml } from '@/features/bookings/receipt-html';

function Receipt({ id }: { id: string }) {
  const { c } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const booking = useQuery({ queryKey: ['booking', id], queryFn: () => bookingApi.getById(id) });
  const receipts = useQuery({ queryKey: ['receipts', id], queryFn: () => bookingApi.receipts(id) });
  const b = booking.data;
  const vehicle = useQuery({ queryKey: ['vehicle', b?.vehicleId], queryFn: () => vehicleApi.getById(b!.vehicleId), enabled: !!b?.vehicleId });

  const header = <ScreenHeader title="Receipt" onBack={() => router.back()} />;
  if (booking.isPending || receipts.isPending) return <Screen header={header}><Skeleton height={300} /></Screen>;
  if (booking.isError || receipts.isError || !b || !receipts.data) return <Screen header={header}><ErrorState message="Booking not found." /></Screen>;

  const { receipts: list, summary, currency } = receipts.data;
  const v = vehicle.data;
  const pb = b.priceBreakdown;
  const paid = ['paid', 'confirmed', 'in_progress', 'completed'].includes(b.status);
  const m = (amount: number) => formatMoney({ amount: Math.abs(amount), currency });

  const print = async (only: string | null) => {
    const ok = await printHtml(receiptHtml(receipts.data, { code: b.code, status: b.status, vehicle: v ? `${v.make} ${v.model} ${v.year}` : undefined, createdAt: b.createdAt, paid, only }));
    if (!ok) toast({ tone: 'error', title: 'Printing isn’t available on this phone right now.' });
  };

  return (
    <Screen header={header}>
      <Card>
        <Text variant="small" tone="primary">BOOKING</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
          <Text variant="title">{b.code}</Text>
          <Badge label={statusLabel(b.status)} />
        </View>
        {v ? <Text>{v.make} {v.model} {v.year}</Text> : null}
        <Text tone="muted">{formatDateRange(summary.period.start, summary.period.end)}</Text>
        <Text variant="caption" tone="muted">Issued {formatDate(b.createdAt)}</Text>
        <Button title="Print all" variant="outline" size="sm" full={false} icon={<Printer size={16} color={c.foreground} />} style={{ marginTop: space.md }} onPress={() => void print(null)} />
      </Card>

      {list.map((r) => (
        <Card key={r.receiptNo}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View>
              <Text variant="small" tone="primary">{r.kind === 'original' ? 'RECEIPT' : 'EXTENSION RECEIPT'}</Text>
              <Text variant="heading">{r.receiptNo}</Text>
            </View>
            <Button title="Print" variant="ghost" size="sm" full={false} onPress={() => void print(r.receiptNo)} />
          </View>
          <Text tone="muted">{formatDateRange(r.period.start, r.period.end)}</Text>
          <Text variant="caption" tone="muted">Issued {formatDate(r.issuedAt)}{r.paymentRef ? ` · Payment ref ${r.paymentRef}` : ''}</Text>
          <View style={{ gap: space.sm, marginTop: space.md }}>
            {r.lines.map((l, i) => (
              <KeyValue key={`${l.label}-${i}`} label={l.label} value={`${l.amount < 0 ? '−' : ''}${m(l.amount)}`} />
            ))}
            <Divider />
            <KeyValue label={paid ? 'Total paid' : 'Total due'} value={formatMoney(r.total)} strong />
          </View>
        </Card>
      ))}

      {list.length > 1 ? (
        <Card>
          <Text variant="heading">Final summary · {summary.days} days</Text>
          <View style={{ gap: space.sm, marginTop: space.md }}>
            {list.map((r) => (
              <KeyValue key={r.receiptNo} label={`${r.receiptNo} · ${r.kind === 'original' ? 'Original booking' : 'Extension'}`} value={formatMoney(r.total)} />
            ))}
            <Divider />
            <KeyValue label={paid ? 'Total paid' : 'Total due'} value={formatMoney(summary.total)} strong />
          </View>
        </Card>
      ) : null}

      {pb.surgeDays || pb.delivery?.amount || (pb.memberSavings && pb.memberSavings.amount > 0) ? (
        <Card>
          {pb.surgeDays ? <Text variant="caption" tone="muted">Demand pricing applied on {pb.surgeDays} day{pb.surgeDays === 1 ? '' : 's'}{pb.surgeSource && pb.surgeSource !== 'none' ? ` (${pb.surgeSource})` : ''}.</Text> : null}
          {pb.memberSavings && pb.memberSavings.amount > 0 ? <Text variant="caption" tone="muted">CatoDrive Plus saved you {formatMoney(pb.memberSavings)} on this trip.</Text> : null}
          {b.delivery ? <Text variant="caption" tone="muted">Delivered to {b.delivery.address} ({b.delivery.mode}).</Text> : null}
          <Text variant="caption" tone="muted">Prices shown are what you were quoted and charged - CatoDrive does not change a price after booking.</Text>
        </Card>
      ) : null}
      <Text variant="caption" tone="muted" center>Issued by CatoDrive. Any refundable security deposit is authorised separately and is not included in these totals.</Text>
    </Screen>
  );
}

export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireAuth>
      <Receipt id={id} />
    </RequireAuth>
  );
}
