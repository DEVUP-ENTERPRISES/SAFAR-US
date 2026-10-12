import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react-native';
import { Button, Card, Screen, ScreenHeader, Text, space, useTheme } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { usePlatformConfig } from '@catodrive/core/web/features/platform/config';
import { vehicleApi } from '@catodrive/core/web/features/vehicles/api';
import { LISTING_STEPS, createListingInput, listingBlockers, listingStepErrors } from '@catodrive/core/web/features/vehicles/new-listing';
import { BasicsStep } from '@/features/listings/new/BasicsStep';
import { DeliveryStep } from '@/features/listings/new/DeliveryStep';
import { DetailsStep } from '@/features/listings/new/DetailsStep';
import { PhotosStep } from '@/features/listings/new/PhotosStep';
import { PricingStep } from '@/features/listings/new/PricingStep';
import { ReviewStep } from '@/features/listings/new/ReviewStep';
import { StandardsStep } from '@/features/listings/new/StandardsStep';
import { useListingDraft } from '@/features/listings/new/draft-store';

/** The website's /host/listings/new: seven steps from VIN to a draft listing, each step checking only what it owns. */
function NewListing() {
  const { c } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { draft: d, step, goTo, reset } = useListingDraft();
  const reqs = useQuery({ queryKey: ['listing-requirements'], queryFn: () => vehicleApi.requirements() });
  const minPhotos = reqs.data?.minPhotos ?? 4;
  const dailyMiles = usePlatformConfig().data?.booking?.dailyMileageMiles ?? 200;
  const errors = listingStepErrors(d, step, minPhotos);
  const blockers = listingBlockers(d, minPhotos);
  const last = step === LISTING_STEPS.length - 1;
  const create = useMutation({
    meta: { silentError: true },
    mutationFn: () => vehicleApi.create(createListingInput(d, dailyMiles)),
    onSuccess: (v) => {
      reset();
      void qc.invalidateQueries({ queryKey: ['my-vehicles'] });
      router.replace(`/host/listings/${v._id}`);
    },
  });

  return (
    <Screen
      header={<ScreenHeader title="List your vehicle" subtitle={`Step ${step + 1} of ${LISTING_STEPS.length}: ${LISTING_STEPS[step]}`} onBack={() => (step > 0 ? goTo(step - 1) : router.canGoBack() ? router.back() : router.replace('/host/listings'))} />}
      footer={
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Button title="Back" variant="outline" disabled={step === 0} onPress={() => goTo(step - 1)} />
          </View>
          <View style={{ flex: 1 }}>
            {last ? (
              <Button title="Create listing" loading={create.isPending} disabled={blockers.length > 0} onPress={() => create.mutate()} />
            ) : (
              <Button title="Continue" disabled={Object.keys(errors).length > 0} onPress={() => goTo(step + 1)} />
            )}
          </View>
        </View>
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }} accessibilityLabel={`Step ${step + 1} of ${LISTING_STEPS.length}`}>
        {LISTING_STEPS.map((s, i) => (
          <View key={s} style={{ flex: i < LISTING_STEPS.length - 1 ? 1 : 0, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: i < step ? c.primary : i === step ? c.primarySoft : c.muted, borderWidth: i === step ? 2 : 0, borderColor: c.primary }}>
              {i < step ? <Check size={14} color={c.primaryForeground} /> : <Text variant="small" tone={i === step ? 'primary' : 'muted'}>{i + 1}</Text>}
            </View>
            {i < LISTING_STEPS.length - 1 ? <View style={{ flex: 1, height: 2, marginHorizontal: 2, backgroundColor: i < step ? c.primary : c.border }} /> : null}
          </View>
        ))}
      </View>
      <Card>
        {step === 0 ? <BasicsStep errors={errors} /> : null}
        {step === 1 ? <DetailsStep errors={errors} /> : null}
        {step === 2 ? <PhotosStep errors={errors} minPhotos={minPhotos} /> : null}
        {step === 3 ? <PricingStep errors={errors} /> : null}
        {step === 4 ? <DeliveryStep errors={errors} dailyMiles={dailyMiles} /> : null}
        {step === 5 ? <StandardsStep errors={errors} /> : null}
        {step === 6 ? <ReviewStep minPhotos={minPhotos} createError={create.error} /> : null}
      </Card>
    </Screen>
  );
}

export default function NewListingScreen() {
  return (
    <RequireAuth>
      <NewListing />
    </RequireAuth>
  );
}
