import { useEffect } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  Award, CalendarCheck, Check, ChevronLeft, ClipboardList, DoorOpen, Flame, Fuel, Gauge, Headphones, LifeBuoy, MapPin, Share2, ShieldCheck, Sparkles, Truck, Umbrella, Users, Zap,
} from 'lucide-react-native';
import { Badge, Button, Card, ErrorState, Screen, Skeleton, Text, useTheme, radius, space } from '@catodrive/ui';
import { webUrl } from '@catodrive/core';
import { useVehicle } from '@catodrive/core/web/features/vehicles/hooks';
import { vehicleApi } from '@catodrive/core/web/features/vehicles/api';
import { usePlatformConfig, describeCancellation } from '@catodrive/core/web/features/platform/config';
import { useHostPublicProfile } from '@catodrive/core/web/features/host/public-profile';
import { useSearchBar } from '@catodrive/core/web/features/search/search-store';
import { tripDays } from '@catodrive/core/web/features/bookings/booking-selection';
import { FUEL_LABEL, formatMoney, kmToMiles, perKmToPerMile } from '@catodrive/core/web/lib/utils/format';
import { useAuthStore } from '@catodrive/core/web/features/auth/store';
import { useCheckout } from '@/features/bookings/checkout-store';
import { PhotoGallery } from '@/features/vehicles/PhotoGallery';
import { VehicleRating } from '@/features/vehicles/VehicleRating';
import { DailyPrice } from '@/features/vehicles/DailyPrice';
import { InfoItem } from '@/features/vehicles/InfoItem';
import { HostCard } from '@/features/vehicles/HostCard';
import { AskHost } from '@/features/vehicles/AskHost';
import { VehicleCalendar } from '@/features/vehicles/VehicleCalendar';
import { ReviewsBlock } from '@/features/vehicles/ReviewsBlock';
import { SimilarCars } from '@/features/vehicles/SimilarCars';
import { WishlistButton } from '@/features/favorites/WishlistButton';

function Spec({ icon: Icon, label }: { icon: React.ComponentType<{ size?: number; color?: string }>; label: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.spec, { backgroundColor: c.card, borderColor: c.border }]}>
      <Icon size={18} color={c.mutedForeground} />
      <Text variant="label" style={{ textTransform: 'capitalize' }}>{label}</Text>
    </View>
  );
}

function Heading({ children }: { children: string }) {
  return <Text variant="title" accessibilityRole="header">{children}</Text>;
}

/** The website's /vehicles/[id]: everything about the car, its calendar and reviews, with booking one tap away. */
export default function VehicleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const router = useRouter();
  const { data: v, isPending, isError, refetch } = useVehicle(id);
  const cfg = usePlatformConfig().data;
  const host = useHostPublicProfile(v?.hostId).data;
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  const choices = useCheckout((s) => s.forVehicle(id));
  const setChoices = useCheckout((s) => s.set);
  const searched = useSearchBar();

  // Dates searched for carry over to the car, like the website.
  useEffect(() => {
    if (choices.start || choices.end || !searched.fromDate || !searched.untilDate) return;
    setChoices(id, { start: `${searched.fromDate}T${searched.fromTime || '10:00'}`, end: `${searched.untilDate}T${searched.untilTime || '10:00'}` });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const interest = useQuery({ queryKey: ['vehicle-interest', id], queryFn: () => vehicleApi.interest(id), staleTime: 5 * 60_000 });
  const market = useQuery({
    queryKey: ['price-suggestion', id],
    queryFn: () => vehicleApi.priceSuggestion({ lng: v!.location.coordinates[0], lat: v!.location.coordinates[1], category: v!.category, fuelType: v!.fuelType }),
    enabled: !!v?.location?.coordinates,
  });

  if (isPending) {
    return (
      <Screen padded={false}>
        <Skeleton height={300} round={0} />
        <View style={{ padding: space.lg, gap: space.md }}>
          <Skeleton height={28} width="70%" />
          <Skeleton height={18} width="40%" />
          <Skeleton height={120} />
        </View>
      </Screen>
    );
  }
  if (isError || !v) {
    return (
      <Screen>
        <ErrorState message="Vehicle not found." onRetry={() => void refetch()} />
      </Screen>
    );
  }

  const title = `${v.year} ${v.make} ${v.model}`;
  const days = tripDays(choices.start, choices.end);
  const median = market.data?.median ?? 0;
  const dealPct = median > 0 && v.pricing.dailyPrice < median ? Math.round(((median - v.pricing.dailyPrice) / median) * 100) : 0;
  const cancelTerms = describeCancellation(v.listing.cancellationPolicy, cfg);
  const mileage = v.mileageLimit;
  const delivery = (v.listing.deliveryLocations ?? []).filter((l) => l.enabled);
  const cheapestDelivery = delivery.length ? Math.min(...delivery.map((l) => l.fee)) : 0;
  const d = v.listing.delivery;
  const badges = [
    v.fleetOwned && { icon: ShieldCheck, label: 'Owned & inspected by CatoDrive' },
    v.hostIsSuperhost && { icon: Award, label: 'Superhost' },
    v.listing.instantBook && { icon: Zap, label: 'Instant Book' },
    v.listing.cancellationPolicy === 'flexible' && { icon: CalendarCheck, label: 'Flexible cancellation' },
    d && (d.airport || d.home || d.hotel || d.business) && { icon: Truck, label: 'Delivery available' },
  ].filter(Boolean) as { icon: React.ComponentType<{ size?: number; color?: string }>; label: string }[];

  const book = () => {
    if (!signedIn) return router.push({ pathname: '/login', params: { returnTo: `/vehicles/${id}/checkout` } });
    router.push(`/vehicles/${id}/checkout`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Screen padded={false} edges={['left', 'right']} onRefresh={() => void refetch()} refreshing={false}>
        <PhotoGallery
          photos={v.photos ?? []}
          title={title}
          fallback={`${v.make.slice(0, 1)}${v.model.slice(0, 1)}`}
          overlay={
            <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
              <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.round}>
                <ChevronLeft size={24} color="#fff" />
              </Pressable>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Pressable accessibilityRole="button" accessibilityLabel="Share this car" onPress={() => void Share.share({ message: `${title} on CatoDrive: ${webUrl(`/vehicles/${v._id}`)}` })} style={styles.round}>
                  <Share2 size={20} color="#fff" />
                </Pressable>
                <WishlistButton vehicleId={v._id} />
              </View>
            </SafeAreaView>
          }
        />

        <View style={styles.body}>
          <View style={{ gap: space.sm }}>
            <Text variant="display" accessibilityRole="header">{v.make} {v.model} {v.year}</Text>
            <View style={styles.meta}>
              <Text tone="muted" style={{ textTransform: 'capitalize' }}>{v.bodyType} · {v.transmission}</Text>
              <VehicleRating vehicle={v} />
            </View>
            {badges.length ? (
              <View style={styles.wrap}>
                {badges.map(({ icon: Icon, label }) => (
                  <View key={label} style={[styles.badge, { borderColor: c.border, backgroundColor: c.muted }]}>
                    <Icon size={15} color={c.primary} />
                    <Text variant="caption">{label}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {interest.data && interest.data.viewersLast24h >= 3 ? (
              <View style={[styles.badge, { backgroundColor: c.warningSoft, borderColor: 'transparent', alignSelf: 'flex-start' }]}>
                <Flame size={14} color={c.warning} />
                <Text variant="caption" tone="warning">{interest.data.viewersLast24h} people viewed this car today</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.specs}>
            <Spec icon={Users} label={`${v.seats} seats`} />
            <Spec icon={DoorOpen} label={`${v.specs?.doors || 4} doors`} />
            <Spec icon={Fuel} label={FUEL_LABEL[v.fuelType]} />
            <Spec icon={Gauge} label={v.transmission} />
          </View>

          {dealPct > 0 ? (
            <Card style={{ backgroundColor: c.successSoft, borderColor: 'transparent' }}>
              <Text variant="heading" tone="success">Great deal!</Text>
              <Text tone="muted">About {dealPct}% below the typical {v.category} in {v.location.city || 'this area'}.</Text>
            </Card>
          ) : null}

          <View style={styles.section}>
            <Heading>Pickup & return location</Heading>
            <InfoItem icon={MapPin} title={v.location.address || v.location.city || 'On-site at Airport'} />
          </View>

          <View style={styles.section}>
            <Heading>Cancellation policy</Heading>
            <InfoItem icon={Check} title={`${cancelTerms.title} cancellation`} detail={cancelTerms.detail} />
          </View>

          <View style={styles.section}>
            <Heading>Payment options</Heading>
            <InfoItem icon={ClipboardList} title="Flexible payment" detail="$0 due now when you choose the Refundable option at checkout." />
          </View>

          <View style={styles.section}>
            <Heading>Distance included</Heading>
            {mileage && mileage.perDayKm > 0 ? (
              <InfoItem
                icon={Gauge}
                title={`${kmToMiles(mileage.perDayKm).toLocaleString()} miles/day${days ? ` · ${kmToMiles(mileage.perDayKm * days).toLocaleString()} miles this trip` : ''}`}
                detail={`${formatMoney({ amount: perKmToPerMile(mileage.overageFeePerKm), currency: v.pricing.currency })}/mile for additional distance driven`}
              />
            ) : (
              <InfoItem icon={Gauge} title="Unlimited distance" detail="Drive as far as you like - no mileage cap on this car." />
            )}
          </View>

          <View style={styles.section}>
            <Heading>Insurance & protection</Heading>
            <InfoItem icon={ShieldCheck} title="Every trip is insured" detail="Choose your protection level at checkout. A refundable security deposit is authorised at pickup and released after the trip." />
          </View>

          <View style={styles.section}>
            <Heading>Peace of mind</Heading>
            <InfoItem icon={Sparkles} title="No car wash necessary" detail="Just keep the car tidy and return it as you found it." />
            {v.insurance?.approved ? (
              <InfoItem
                icon={Umbrella}
                title="Insured trip"
                detail={`Covered under ${v.insurance.planLabel || 'the car’s insurance plan'}.${v.insurance.minRenterAge ? ` Drivers must be ${v.insurance.minRenterAge} or older.` : ''}`}
              />
            ) : null}
            <InfoItem icon={CalendarCheck} title={`${cancelTerms.title} cancellation`} detail={cancelTerms.detail || 'Cancel per the host’s policy for a refund.'} />
            <InfoItem icon={LifeBuoy} title="Support when you need it" detail="Message your host in-app, and reach our team from your trip screen." />
            <InfoItem icon={Headphones} title="Two-way reviews" detail="Verified guests and hosts rate each trip, so you always know who you’re booking with." />
          </View>

          <View style={styles.section}>
            <Heading>Hosted by</Heading>
            <HostCard hostId={v.hostId} />
            <AskHost vehicleId={v._id} hostName={host?.displayName ?? 'the host'} />
          </View>

          {v.listing.description ? <Text>{v.listing.description}</Text> : null}

          {v.features.length ? (
            <View style={styles.section}>
              <Heading>Features</Heading>
              <View style={styles.wrap}>
                {v.features.map((f) => (
                  <View key={f} style={[styles.badge, { borderColor: c.border }]}>
                    <Check size={14} color={c.primary} />
                    <Text variant="caption">{f}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {delivery.length ? (
            <Card>
              <Text variant="label">Delivery</Text>
              <Text variant="caption" tone="muted">{`${delivery.map((l) => l.name).join(', ')} · from ${formatMoney({ amount: cheapestDelivery, currency: v.pricing.currency })}`}</Text>
            </Card>
          ) : null}
          {v.tripRules?.length ? (
            <Card>
              <Text variant="label">Trip rules</Text>
              {v.tripRules.map((r, i) => (
                <Text key={i} variant="caption" tone="muted">• {r}</Text>
              ))}
            </Card>
          ) : null}

          <View style={styles.section}>
            <Heading>Availability</Heading>
            <VehicleCalendar
              vehicle={v}
              from={choices.start.slice(0, 10)}
              to={choices.end.slice(0, 10)}
              onChange={(f, t) =>
                setChoices(id, {
                  start: f ? `${f}T${choices.start.slice(11, 16) || searched.fromTime || '10:00'}` : '',
                  end: t ? `${t}T${choices.end.slice(11, 16) || searched.untilTime || '10:00'}` : '',
                })
              }
            />
          </View>

          <ReviewsBlock vehicle={v} />
          <SimilarCars vehicleId={v._id} start={choices.start ? new Date(choices.start).toISOString() : undefined} end={choices.end ? new Date(choices.end).toISOString() : undefined} />
        </View>
      </Screen>

      <SafeAreaView edges={['bottom']} style={[styles.footer, { backgroundColor: c.card, borderTopColor: c.border }]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <DailyPrice amount={v.pricing.dailyPrice} currency={v.pricing.currency} variant="heading" />
            <Text variant="caption" tone="muted"> / day</Text>
          </View>
          {days ? <Text variant="caption" tone="muted">{days} {days === 1 ? 'day' : 'days'} selected</Text> : <Badge label={v.listing.instantBook ? 'Instant Book' : 'Request to book'} tone="primary" />}
        </View>
        <Button title={signedIn ? (v.listing.instantBook ? 'Book' : 'Request') : 'Sign in to book'} full={false} onPress={book} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.sm },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  body: { padding: space.lg, gap: space.xl, paddingBottom: 120 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  specs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  spec: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.md },
  section: { gap: space.md },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.md, borderTopWidth: StyleSheet.hairlineWidth },
});
