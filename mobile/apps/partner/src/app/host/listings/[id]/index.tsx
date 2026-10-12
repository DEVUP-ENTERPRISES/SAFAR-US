import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { AlertTriangle, CalendarX, Camera, DollarSign, FileText, MapPin, Pencil, Power, ShieldCheck, SlidersHorizontal, Star, TrendingUp } from 'lucide-react-native';
import { Button, Card, ErrorState, Input, MenuRow, Screen, ScreenHeader, Section, Skeleton, Text, space, useConfirm, useTheme, useToast } from '@catodrive/ui';
import { RequireAuth, openInAppBrowser, webUrl } from '@catodrive/core';
import { vehicleApi } from '@catodrive/core/web/features/vehicles/api';
import { useVehicle } from '@catodrive/core/web/features/vehicles/hooks';
import { listingStatusText } from '@catodrive/core/web/features/vehicles/listing-form';
import { FUEL_LABEL, formatMoney, kmToMiles, perKmToPerMile } from '@catodrive/core/web/lib/utils/format';
import { AvailabilityPanel } from '@/features/listings/AvailabilityPanel';
import { DetailsPanel } from '@/features/listings/DetailsPanel';
import { LocationPanel } from '@/features/listings/LocationPanel';
import { PhotosPanel } from '@/features/listings/PhotosPanel';
import { PickupEditor } from '@/features/listings/PickupEditor';
import { SafetyDocsPanel } from '@/features/listings/SafetyDocsPanel';
import { TripPanel } from '@/features/listings/TripPanel';
import { VehicleHistoryCard } from '@/features/listings/VehicleHistoryCard';

type Panel = null | 'photos' | 'availability' | 'details' | 'safety' | 'location' | 'trip';
const PANELS: Panel[] = ['photos', 'availability', 'details', 'safety', 'location', 'trip'];

/** The website's /host/listings/[id]: every setting of one car, its status, and removing it. */
function ManageListing({ id, open }: { id: string; open?: string }) {
  const { c } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const { data: v, isPending, isError, refetch } = useVehicle(id);
  const reqs = useQuery({ queryKey: ['listing-requirements'], queryFn: () => vehicleApi.requirements() });
  const minPhotos = reqs.data?.minPhotos ?? 4;
  const [panel, setPanel] = useState<Panel>(PANELS.includes(open as Panel) ? (open as Panel) : null);
  const [editingPlate, setEditingPlate] = useState(false);
  const [plateDraft, setPlateDraft] = useState('');
  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['vehicle', id] });
    void qc.invalidateQueries({ queryKey: ['my-vehicles'] });
  };

  const submit = useMutation({ mutationFn: () => vehicleApi.submit(id), onSuccess: invalidate });
  const update = useMutation({
    mutationFn: (patch: Record<string, unknown>) => vehicleApi.update(id, patch),
    onSuccess: () => {
      invalidate();
      toast({ tone: 'success', title: 'Listing updated' });
    },
  });
  const delist = useMutation({
    mutationFn: () => vehicleApi.delist(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['my-vehicles'] });
      toast({ tone: 'success', title: 'Listing removed' });
      router.replace('/host/listings');
    },
  });

  const header = <ScreenHeader title="Listing" onBack={() => (router.canGoBack() ? router.back() : router.replace('/host/listings'))} />;
  if (isPending) return <Screen header={header}><Skeleton height={360} /></Screen>;
  if (isError || !v) return <Screen header={header}><ErrorState message="Listing not found." onRetry={() => void refetch()} /></Screen>;

  const photos = v.photos ?? [];
  const cover = photos.find((p) => p.isCover) ?? photos[0];
  const photosNeeded = Math.max(0, minPhotos - photos.length);
  const canSubmit = v.status === 'draft' && photosNeeded === 0;
  const unlimited = !v.mileageLimit?.perDayKm;
  const delivery = v.listing?.deliveryLocations?.some((l) => l.enabled) || (v.listing?.delivery && (v.listing.delivery.airport || v.listing.delivery.home || v.listing.delivery.hotel));
  const icon = (I: typeof Camera) => <I size={20} color={c.mutedForeground} />;
  const save = (patch: Record<string, unknown>) => update.mutate(patch);

  const doSubmit = async () => {
    const { ok } = await confirm({
      title: 'Submit for verification?',
      description: 'Our team reviews the car and its documents. You cannot edit the listing while it is in review, and it goes live once approved.',
      confirmLabel: 'Submit listing',
    });
    if (ok) submit.mutate();
  };
  const doDelist = async () => {
    const { ok } = await confirm({
      title: `Remove ${v.make} ${v.model} from CatoDrive?`,
      description: 'The car stops appearing in search and can no longer be booked. Trips already booked are not cancelled - handle those first.',
      confirmLabel: 'Remove listing',
      tone: 'destructive',
      requireText: 'REMOVE',
    });
    if (ok) delist.mutate();
  };

  const row = (p: Exclude<Panel, null>, I: typeof Camera, label: string, value: string | undefined, body: ReactNode) => (
    <>
      <MenuRow icon={icon(I)} label={label} value={value} onPress={() => toggle(p)} />
      {panel === p ? <View style={{ padding: space.lg, paddingTop: 0 }}>{body}</View> : null}
    </>
  );

  return (
    <Screen header={header} onRefresh={() => void refetch()} refreshing={false}>
      <Card padded={false}>
        <View style={{ aspectRatio: 16 / 10, backgroundColor: c.muted, alignItems: 'center', justifyContent: 'center' }}>
          {cover?.url ? (
            <Image source={{ uri: cover.url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
          ) : (
            <View style={{ alignItems: 'center', gap: 4 }}>
              <Camera size={24} color={c.mutedForeground} />
              <Text variant="caption" tone="muted">No photos yet</Text>
            </View>
          )}
          <View style={{ position: 'absolute', left: space.md, top: space.md, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: v.status === 'listed' ? c.success : 'rgba(0,0,0,0.75)' }}>
            <Text variant="small" style={{ color: '#fff', textTransform: 'uppercase' }}>{v.status}</Text>
          </View>
        </View>
      </Card>
      <Button title="View listing as a guest" variant="ghost" size="sm" onPress={() => void openInAppBrowser(webUrl(`/vehicles/${v._id}`))} />

      <View style={{ gap: 4 }}>
        <Text variant="title">{v.make} {v.model} {v.year}</Text>
        {editingPlate ? (
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Input autoFocus value={plateDraft} onChangeText={(t) => setPlateDraft(t.toUpperCase())} placeholder="XCW2O63 (TX)" autoCapitalize="characters" />
            </View>
            <Button title="Save" size="sm" full={false} loading={update.isPending} onPress={() => update.mutate({ registrationNumber: plateDraft.trim() || undefined }, { onSuccess: () => setEditingPlate(false) })} />
            <Button title="Cancel" size="sm" variant="ghost" full={false} onPress={() => setEditingPlate(false)} />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Text variant="caption" tone="muted" style={{ textTransform: 'capitalize' }}>{v.registrationNumber ?? 'No plate'} · {v.category}</Text>
            <Button title="Edit" variant="ghost" size="sm" full={false} icon={<Pencil size={14} color={c.foreground} />} onPress={() => { setPlateDraft(v.registrationNumber ?? ''); setEditingPlate(true); }} />
          </View>
        )}
        {v.ratingCount > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Star size={14} color={c.warning} fill={c.warning} />
            <Text variant="caption">{v.ratingAvg.toFixed(1)} <Text variant="caption" tone="muted">({v.totalTrips} trips)</Text></Text>
          </View>
        ) : null}
        <Button title="Earnings & performance" variant="outline" size="sm" icon={<TrendingUp size={16} color={c.foreground} />} onPress={() => router.push(`/host/listings/${id}/insights`)} />
      </View>

      {photosNeeded > 0 ? (
        <Card style={{ borderColor: c.warning, backgroundColor: c.warningSoft }}>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <AlertTriangle size={18} color={c.warning} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label">{photosNeeded} more photo{photosNeeded === 1 ? '' : 's'} required</Text>
              <Text variant="caption" tone="muted">Listings need at least {minPhotos} photos before they can be submitted for verification.</Text>
              <Button title="Add photos" variant="ghost" size="sm" full={false} onPress={() => setPanel('photos')} />
            </View>
          </View>
        </Card>
      ) : null}

      <Card padded={false}>
        <MenuRow icon={icon(DollarSign)} label="Pricing & discounts" value={`${formatMoney({ amount: v.pricing.dailyPrice, currency: v.pricing.currency })} / day`} onPress={() => router.push(`/host/listings/${id}/pricing`)} />
        {row('location', MapPin, 'Location & delivery', `${v.location?.address || v.location?.city || 'Not set'} · ${delivery ? 'Delivery on' : 'Pickup only'}`, <LocationPanel vehicle={v} onSave={save} saving={update.isPending} />)}
        {row(
          'trip',
          SlidersHorizontal,
          'Trip preferences',
          `${unlimited ? 'Unlimited mileage' : `${kmToMiles(v.mileageLimit!.perDayKm)} miles/day included · ${formatMoney({ amount: perKmToPerMile(v.mileageLimit!.overageFeePerKm), currency: v.pricing.currency })}/mile over`} · ${v.listing?.instantBook ? 'Instant Book' : 'Request'}`,
          <TripPanel vehicle={v} onSave={save} saving={update.isPending} />,
        )}
        {row('photos', Camera, 'Photos', photos.length === 0 ? `None yet - ${minPhotos} required` : `${photos.length} uploaded${photosNeeded > 0 ? ` · ${photosNeeded} more required` : ''}`, <PhotosPanel vehicle={v} onChanged={invalidate} />)}
        {row('details', FileText, 'Details', `${v.seats} seats · ${v.transmission} · ${FUEL_LABEL[v.fuelType]} · ${v.vinVerified ? 'VIN verified' : 'VIN pending'}`, <DetailsPanel vehicle={v} onSave={save} saving={update.isPending} />)}
        {row('safety', ShieldCheck, 'Safety & inspections', v.recallHold ? 'On recall hold - repair receipt needed' : 'Registration and insurance documents', <SafetyDocsPanel vehicle={v} onChanged={invalidate} />)}
        {row('availability', CalendarX, 'Block dates', 'Make the car unavailable for a window', <AvailabilityPanel vehicleId={id} onChanged={invalidate} />)}
      </Card>

      <Section title="Safety & history">
        <VehicleHistoryCard vehicleId={id} />
      </Section>
      <Section title="Pickup">
        <PickupEditor vehicleId={id} initial={v.pickup} onSaved={invalidate} />
      </Section>
      <Section title="Status">
        <Card>
          <Text variant="label">{v.status === 'listed' ? 'Listed' : `Status: ${v.status}`}</Text>
          <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>{listingStatusText(v, photosNeeded)}</Text>
          {v.status === 'draft' ? <Button title="Submit" size="sm" disabled={!canSubmit} loading={submit.isPending} style={{ marginTop: space.md }} onPress={() => void doSubmit()} /> : null}
        </Card>
      </Section>
      <Section title="Danger zone">
        <Card>
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <Power size={18} color={c.destructive} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label">Remove this listing</Text>
              <Text variant="caption" tone="muted">Stops new bookings and hides the car from search.</Text>
            </View>
          </View>
          <Button title="Remove" variant="destructive" size="sm" loading={delist.isPending} style={{ marginTop: space.md }} onPress={() => void doDelist()} />
        </Card>
      </Section>
      <Text variant="caption" tone="muted" center>VIN #{v.vin ?? '-'}</Text>
    </Screen>
  );
}

export default function ManageListingScreen() {
  const { id, open } = useLocalSearchParams<{ id: string; open?: string }>();
  return (
    <RequireAuth>
      <ManageListing id={id} open={open} />
    </RequireAuth>
  );
}
