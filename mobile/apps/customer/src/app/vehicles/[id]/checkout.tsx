import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { CalendarDays, CreditCard, Plane, Sparkles } from 'lucide-react-native';
import {
  BottomSheet, Button, Card, Checkbox, Chip, Divider, ErrorState, Input, KeyValue, RadioCard, Screen, ScreenHeader, Section, Skeleton, Text, useTheme, useToast, space,
} from '@catodrive/ui';
import { RequireAuth, openInAppBrowser, webUrl } from '@catodrive/core';
import { useVehicle } from '@catodrive/core/web/features/vehicles/hooks';
import { bookingApi } from '@catodrive/core/web/features/bookings/api';
import { useCreateBooking, useQuote } from '@catodrive/core/web/features/bookings/queries';
import { bookingInput, canQuote, freeCancellationUntil, tripDays, type BookingChoices } from '@catodrive/core/web/features/bookings/booking-selection';
import { walletApi } from '@catodrive/core/web/features/wallet/api';
import { usePlatformConfig, describeCancellation } from '@catodrive/core/web/features/platform/config';
import { useMembership } from '@catodrive/core/web/features/subscriptions/hooks';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { formatClock, formatMoney, kmToMiles, perKmToPerMile } from '@catodrive/core/web/lib/utils/format';
import { useCheckout } from '@/features/bookings/checkout-store';
import { usePayments } from '@/features/payments/usePayments';
import { VehicleCalendar } from '@/features/vehicles/VehicleCalendar';
import { TimeSheet } from '@/features/search/TimeSheet';
import { safeMessage } from '@catodrive/core/web/lib/utils/safe-message';

/** Where the guest is, only if location was already allowed: the risk check is best effort and never prompts at checkout. */
async function knownCoords(): Promise<{ lat: number; lng: number } | undefined> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return undefined;
    const pos = await Location.getLastKnownPositionAsync({ maxAge: 300_000 });
    return pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : undefined;
  } catch {
    return undefined;
  }
}

const dateLabel = (local: string) =>
  local ? `${new Date(local).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${formatClock(local.slice(11, 16))}` : 'Add date';

function Checkout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const { data: v, isPending, isError, refetch } = useVehicle(id);
  const cfg = usePlatformConfig().data;
  const membership = useMembership();
  const choices = useCheckout((s) => s.forVehicle(id));
  const patch = (p: Partial<BookingChoices>) => useCheckout.getState().set(id, p);
  const payments = usePayments();

  const [sheet, setSheet] = useState<'dates' | 'from-time' | 'until-time' | 'landing' | null>(null);
  const [couponCode, setCouponCode] = useState(choices.appliedCoupon);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [paying, setPaying] = useState(false);

  const plans = useQuery({ queryKey: ['protection-plans', id], queryFn: () => bookingApi.protectionPlans(id) });
  const wallet = useQuery({ queryKey: ['wallet', 'balance'], queryFn: () => walletApi.balance() });
  const quote = useQuote();
  const createBooking = useCreateBooking(knownCoords);

  const ready = canQuote(choices);
  const input = useMemo(() => (v && ready ? bookingInput(id, choices, { instantBook: v.listing.instantBook, termsVersion: cfg?.legal?.termsVersion }) : null), [v, ready, id, choices, cfg?.legal?.termsVersion]);
  const quoteKey = input ? JSON.stringify({ ...input, useWallet: undefined, payWith: undefined }) : '';

  useEffect(() => {
    if (!input) return;
    const t = setTimeout(() => {
      quote.mutate(input, {
        onError: (err) => {
          if (choices.appliedCoupon && err instanceof ApiError && err.details?.some((d) => d.field === 'couponCode')) {
            setCouponError(err.message);
            patch({ appliedCoupon: '' });
          }
        },
      });
    }, 350);
    return () => clearTimeout(t);
  }, [quoteKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isPending) {
    return (
      <Screen header={<ScreenHeader title="Checkout" onBack={() => router.back()} />}>
        <Skeleton height={120} />
        <Skeleton height={220} />
      </Screen>
    );
  }
  if (isError || !v) return <Screen><ErrorState message="Vehicle not found." onRetry={() => void refetch()} /></Screen>;

  const cur = v.pricing.currency;
  const days = tripDays(choices.start, choices.end);
  const locations = (v.listing.deliveryLocations ?? []).filter((l) => l.enabled);
  const picked = locations.find((l) => l.id === choices.deliveryLocationId);
  const cancelTerms = describeCancellation(v.listing.cancellationPolicy, cfg);
  const freeUntil = freeCancellationUntil(choices.start, cfg?.cancellation?.[v.listing.cancellationPolicy]?.fullBeforeHours);
  const q = ready ? quote.data : undefined;
  const balance = wallet.data?.balance ?? 0;
  const needsCard = createBooking.error instanceof ApiError && (createBooking.error.code === 'PAYMENT_METHOD_REQUIRED' || createBooking.error.code === 'CARD_DECLINED');

  const toggleAddOn = (code: string) => patch({ addOnCodes: choices.addOnCodes.includes(code) ? choices.addOnCodes.filter((x) => x !== code) : [...choices.addOnCodes, code] });

  const proceed = async () => {
    if (!input) return;
    let b;
    try {
      b = await createBooking.mutateAsync(input);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PROFILE_INCOMPLETE') {
        createBooking.reset();
        router.push({ pathname: '/account/setup', params: { returnTo: `/vehicles/${id}/checkout` } });
      } else if (err instanceof ApiError && err.code === 'IDENTITY_REQUIRED') {
        createBooking.reset();
        toast({ tone: 'info', title: 'Verify your ID to book this trip', body: err.message });
        router.push({ pathname: '/account/verify-identity', params: { returnTo: `/vehicles/${id}/checkout` } });
      }
      return;
    }
    setPaying(true);
    try {
      if (b.requiresPayment && b.clientSecret) {
        const paid = await payments.payIntent(b.clientSecret);
        if (!paid.ok && !paid.cancelled) toast({ tone: 'error', title: 'The payment didn’t go through', body: paid.message ?? 'Your trip is held. Finish paying from Trips.' });
        if (!paid.ok && paid.cancelled) toast({ tone: 'info', title: 'Your trip is held', body: 'Finish paying from Trips to confirm it.' });
      } else if (b.requiresAction && b.clientSecret) {
        const ok = await payments.confirmNextAction(b.clientSecret);
        if (!ok) toast({ tone: 'error', title: 'Your bank did not approve the payment', body: 'The trip is held. Try again from your trips, or use another card.' });
      }
    } finally {
      setPaying(false);
    }
    useCheckout.getState().clear();
    router.replace(`/bookings/${b._id}`);
  };

  const addCardThenBook = async () => {
    const saved = await payments.saveCard().catch((e: unknown) => ({ ok: false as const, cancelled: false, message: e instanceof Error ? safeMessage(e.message) : undefined }));
    if (saved.ok) {
      createBooking.reset();
      toast({ tone: 'success', title: 'Card saved' });
      await proceed();
    } else if (!saved.cancelled) {
      toast({ tone: 'error', title: saved.message ?? 'That card could not be saved' });
    }
  };

  return (
    <Screen
      header={<ScreenHeader title="Checkout" subtitle={`${v.year} ${v.make} ${v.model}`} onBack={() => router.back()} />}
      footer={
        <>
          {q ? <KeyValue label="Total" value={formatMoney(q.total)} strong /> : null}
          <Button
            title={v.listing.instantBook ? 'Continue' : 'Request to book'}
            loading={createBooking.isPending || paying}
            disabled={!q || quote.isPending || !agreedTerms}
            onPress={() => void proceed()}
          />
          {!v.listing.instantBook ? <Text variant="caption" tone="muted" center>You won&apos;t be charged until the host accepts</Text> : null}
        </>
      }
    >
      <Section title="Your trip">
        <Card padded={false}>
          <Pressable accessibilityRole="button" onPress={() => setSheet('dates')} style={styles.tripRow}>
            <CalendarDays size={20} color={c.primary} />
            <View style={{ flex: 1 }}>
              <Text variant="small" tone="muted">FROM</Text>
              <Text variant="label">{dateLabel(choices.start)}</Text>
            </View>
          </Pressable>
          <Divider inset={52} />
          <Pressable accessibilityRole="button" onPress={() => setSheet('dates')} style={styles.tripRow}>
            <CalendarDays size={20} color={c.primary} />
            <View style={{ flex: 1 }}>
              <Text variant="small" tone="muted">UNTIL</Text>
              <Text variant="label">{dateLabel(choices.end)}</Text>
            </View>
          </Pressable>
        </Card>
      </Section>

      {locations.length ? (
        <Section title="Delivery">
          <View style={styles.wrap}>
            <Chip label="Pick up myself" selected={!choices.deliveryLocationId} onPress={() => patch({ deliveryLocationId: '', deliveryMode: '', deliveryAddress: '' })} />
            {locations.map((loc) => (
              <Chip
                key={loc.id}
                label={`${loc.name}${loc.fee > 0 ? ` · +${formatMoney({ amount: loc.fee, currency: cur })}` : ''}`}
                selected={choices.deliveryLocationId === loc.id}
                onPress={() => patch({ deliveryLocationId: loc.id, deliveryMode: loc.kind === 'custom' ? 'home' : loc.kind, deliveryAddress: loc.kind === 'custom' ? '' : loc.address || loc.name })}
              />
            ))}
          </View>
          {picked ? (
            <View style={{ gap: space.md }}>
              {picked.minTripDays > 0 && !!days && days < picked.minTripDays ? (
                <Text variant="caption" tone="warning">{picked.name} delivery needs a trip of at least {picked.minTripDays} days.</Text>
              ) : null}
              {picked.kind === 'custom' ? (
                <Input value={choices.deliveryAddress} onChangeText={(t) => patch({ deliveryAddress: t })} placeholder={`Delivery address (within ${picked.radiusMiles ?? 20} miles)`} autoComplete="street-address" />
              ) : null}
              {picked.kind === 'airport' ? (
                <>
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    <View style={{ flex: 3 }}>
                      <Input value={choices.flightNumber} onChangeText={(t) => patch({ flightNumber: t.toUpperCase() })} placeholder="Flight no. (AA123)" autoCapitalize="characters" left={<Plane size={18} color={c.mutedForeground} />} />
                    </View>
                    <View style={{ flex: 2 }}>
                      <Input value={choices.terminal} onChangeText={(t) => patch({ terminal: t })} placeholder="Terminal (opt.)" />
                    </View>
                  </View>
                  <Button
                    title={choices.arrivesAt ? `Flight lands ${formatClock(choices.arrivesAt.slice(11, 16))}` : 'Choose landing time'}
                    variant="outline"
                    disabled={!choices.start}
                    onPress={() => setSheet('landing')}
                  />
                  <Text variant="caption" tone="muted">Your host meets your flight. If it’s delayed, your pickup window moves with it.</Text>
                </>
              ) : null}
            </View>
          ) : null}
        </Section>
      ) : null}

      {plans.data?.length ? (
        <Section title="Protection">
          {plans.data.map((p) => (
            <RadioCard
              key={p.code}
              selected={choices.protectionPlan === p.code}
              onPress={() => patch({ protectionPlan: p.code })}
              title={p.label}
              detail={[
                p.description,
                p.insurer
                  ? [
                      `Covered by ${p.insurer.name}`,
                      typeof p.deductibleCents === 'number' ? `${formatMoney({ amount: p.deductibleCents, currency: cur })} deductible` : null,
                      p.liabilityLimitCents ? `${formatMoney({ amount: p.liabilityLimitCents, currency: cur })} liability` : null,
                    ].filter(Boolean).join(' · ')
                  : null,
                ...(p.coverage ?? []).map((c) => `• ${c}`),
              ].filter(Boolean).join('\n')}
              aside={p.pricePerDay === 0 ? 'Free' : `${formatMoney({ amount: p.pricePerDay, currency: cur })}/day`}
            />
          ))}
        </Section>
      ) : null}

      {v.addOns?.length ? (
        <Section title="Extras">
          {v.addOns.map((a) => (
            <Checkbox
              key={a.code}
              checked={choices.addOnCodes.includes(a.code)}
              onChange={() => toggleAddOn(a.code)}
              label={a.label}
              right={<Text variant="label">{formatMoney({ amount: a.amount, currency: cur })}{a.priceType === 'per_day' ? '/day' : ''}</Text>}
            />
          ))}
        </Section>
      ) : null}

      <Section title="Promo code">
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Input value={couponCode} onChangeText={(t) => setCouponCode(t.toUpperCase())} placeholder="Optional" autoCapitalize="characters" error={couponError ?? undefined} />
          </View>
          <Button
            title={choices.appliedCoupon && couponCode.trim() === choices.appliedCoupon ? 'Applied' : 'Apply'}
            variant="outline"
            full={false}
            disabled={!couponCode.trim() || couponCode.trim() === choices.appliedCoupon}
            loading={quote.isPending && !!choices.appliedCoupon}
            onPress={() => {
              setCouponError(null);
              patch({ appliedCoupon: couponCode.trim() });
            }}
          />
        </View>
      </Section>

      <Section title="Price details">
        {!ready ? (
          <Text tone="muted">{choices.start && choices.end ? 'Add the delivery details to see your total.' : 'Pick your dates to see the total.'}</Text>
        ) : quote.isPending && !quote.data ? (
          <Skeleton height={120} />
        ) : quote.isError && !couponError ? (
          <Text tone="destructive">{quote.error instanceof ApiError ? quote.error.message : 'Could not price this trip'}</Text>
        ) : q ? (
          <Card>
            <View style={{ gap: space.sm }}>
              <KeyValue label={`${q.days} ${q.days === 1 ? 'day' : 'days'}`} value={formatMoney(q.base)} />
              {q.cleaningFee.amount > 0 ? <KeyValue label="Cleaning fee" value={formatMoney(q.cleaningFee)} /> : null}
              {q.delivery?.amount > 0 ? <KeyValue label="Delivery" value={formatMoney(q.delivery)} /> : null}
              {q.selectedAddOns?.map((a) => <KeyValue key={a.code} label={a.label} value={formatMoney(a.amount)} />)}
              {q.protection.amount > 0 ? <KeyValue label="Protection" value={formatMoney(q.protection)} /> : null}
              {q.serviceFee?.amount > 0 ? <KeyValue label="Service fee" value={formatMoney(q.serviceFee)} /> : null}
              {q.serviceFee?.amount === 0 && membership.benefits?.waiveServiceFee ? <KeyValue label="Service fee" value="Waived · PRO" /> : null}
              {q.discount.amount > 0 ? <KeyValue label="Discount" value={`−${formatMoney(q.discount)}`} tone="success" /> : null}
              <Divider />
              <KeyValue label="Total" value={formatMoney(q.total)} strong />
              {v.mileageLimit?.perDayKm ? (
                <Text variant="caption" tone="muted">
                  {kmToMiles(v.mileageLimit.perDayKm * q.days).toLocaleString()} miles included
                  {v.mileageLimit.overageFeePerKm ? ` · ${formatMoney({ amount: perKmToPerMile(v.mileageLimit.overageFeePerKm), currency: cur })}/mile after` : ''}
                </Text>
              ) : null}
              {freeUntil ? (
                <Text variant="caption" tone="success">
                  Free cancellation until {freeUntil.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </Text>
              ) : null}
              {q.memberSavings && q.memberSavings.amount > 0 ? <Text variant="caption" tone="warning">PRO · You save {formatMoney(q.memberSavings)} on this trip</Text> : null}
              {q.memberOffer ? (
                <Pressable accessibilityRole="link" onPress={() => router.push('/membership')} style={[styles.offer, { backgroundColor: c.warningSoft }]}>
                  <Sparkles size={18} color={c.warning} />
                  <Text variant="caption" style={{ flex: 1 }}>
                    Save {formatMoney(q.memberOffer.savings)} on this trip with {q.memberOffer.planName} · ${(q.memberOffer.monthlyCents / 100).toFixed(0)}/month, cancel any time
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </Card>
        ) : null}
      </Section>

      {q && v.listing.instantBook && balance > 0 ? (
        <Checkbox checked={choices.payWithWallet} onChange={(next) => patch({ payWithWallet: next })} label="Pay with CatoDrive Wallet">
          <Text variant="label">Pay with CatoDrive Wallet</Text>
          <Text variant="caption" tone="muted">({formatMoney({ amount: balance, currency: q.total.currency })} available)</Text>
          {choices.payWithWallet ? (
            <Text variant="caption" tone="primary">
              {formatMoney({ amount: Math.min(balance, q.total.amount), currency: q.total.currency })} from wallet
              {q.total.amount - Math.min(balance, q.total.amount) > 0 ? ` · ${formatMoney({ amount: q.total.amount - Math.min(balance, q.total.amount), currency: q.total.currency })} on card` : ''}
            </Text>
          ) : null}
        </Checkbox>
      ) : null}

      {cfg?.checkout?.otherMethodsEnabled && v.listing.instantBook ? (
        <Section title="How to pay">
          <RadioCard selected={!choices.payOther} onPress={() => patch({ payOther: false })} title="Saved card" detail="One tap" />
          <RadioCard selected={choices.payOther} onPress={() => patch({ payOther: true })} title="Other ways" detail="Google Pay, Apple Pay, Klarna, Cash App…" />
        </Section>
      ) : null}

      {createBooking.isError ? (
        needsCard ? (
          <Card>
            <Text tone="destructive">{(createBooking.error as ApiError).message}</Text>
            <Button title="Add a card" variant="outline" icon={<CreditCard size={18} color={c.foreground} />} style={{ marginTop: space.md }} onPress={() => void addCardThenBook()} />
          </Card>
        ) : (
          <Text tone="destructive" accessibilityRole="alert">{createBooking.error instanceof ApiError ? createBooking.error.message : 'Booking failed'}</Text>
        )
      ) : null}

      <Checkbox checked={agreedTerms} onChange={setAgreedTerms} label="I agree to the privacy policy and terms and conditions">
        <Text variant="caption">
          I have read, understood and agree with the{' '}
          <Text variant="caption" tone="primary" onPress={() => void openInAppBrowser(cfg?.legal?.privacyUrl || webUrl('/privacy'))}>privacy policy</Text> and all other{' '}
          <Text variant="caption" tone="primary" onPress={() => void openInAppBrowser(cfg?.legal?.termsUrl || webUrl('/terms'))}>terms and conditions</Text> of CatoDrive Inc. I also agree to receive communication via email, phone, etc. as and when required during the rental period or till any billing/incident issues are resolved.
        </Text>
      </Checkbox>

      {v.insurance?.minRenterAge ? <Text variant="caption" tone="muted">Drivers must be {v.insurance.minRenterAge} or older to be insured on this car.</Text> : null}
      <Card>
        <Text variant="label">{cancelTerms.title} cancellation</Text>
        <Text variant="caption" tone="muted">{cancelTerms.detail || 'Refunds follow the host’s cancellation policy.'}</Text>
      </Card>

      <BottomSheet
        visible={sheet === 'dates'}
        onClose={() => setSheet(null)}
        title="Trip dates"
        footer={<Button title="Next: pick-up time" disabled={!choices.start || !choices.end} onPress={() => setSheet('from-time')} />}
      >
        <VehicleCalendar
          vehicle={v}
          from={choices.start.slice(0, 10)}
          to={choices.end.slice(0, 10)}
          onChange={(f, t) => patch({ start: f ? `${f}T${choices.start.slice(11, 16) || '10:00'}` : '', end: t ? `${t}T${choices.end.slice(11, 16) || '10:00'}` : '' })}
        />
      </BottomSheet>
      <TimeSheet visible={sheet === 'from-time'} title="Pick-up time" value={choices.start.slice(11, 16)} onClose={() => setSheet(null)} onPick={(t) => { patch({ start: `${choices.start.slice(0, 10)}T${t}` }); setSheet('until-time'); }} />
      <TimeSheet visible={sheet === 'until-time'} title="Return time" value={choices.end.slice(11, 16)} onClose={() => setSheet(null)} onPick={(t) => { patch({ end: `${choices.end.slice(0, 10)}T${t}` }); setSheet(null); }} />
      <TimeSheet visible={sheet === 'landing'} title="Flight lands at" value={choices.arrivesAt.slice(11, 16)} onClose={() => setSheet(null)} onPick={(t) => { patch({ arrivesAt: choices.start ? `${choices.start.slice(0, 10)}T${t}` : '' }); setSheet(null); }} />
    </Screen>
  );
}

export default function CheckoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequireAuth>
      <Checkout key={id} />
    </RequireAuth>
  );
}

const styles = StyleSheet.create({
  tripRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  offer: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: 12, padding: space.md },
});
