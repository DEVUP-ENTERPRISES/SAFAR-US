import { Pressable, View } from 'react-native';
import { Card, KeyValue, Text, space, useTheme } from '@catodrive/ui';
import { LISTING_STEPS, listingBlockers, plateWithState } from '@catodrive/core/web/features/vehicles/new-listing';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { useListingDraft } from './draft-store';

/** A summary of the listing, anything still missing (each a link back to its step), and the server's own field errors. */
export function ReviewStep({ minPhotos, createError }: { minPhotos: number; createError: unknown }) {
  const { c } = useTheme();
  const d = useListingDraft((s) => s.draft);
  const goTo = useListingDraft((s) => s.goTo);
  const blockers = listingBlockers(d, minPhotos);
  return (
    <View style={{ gap: space.md }}>
      <Card>
        <View style={{ gap: space.sm }}>
          <KeyValue label="Vehicle" value={`${d.make} ${d.model} ${d.year}`} />
          <KeyValue label="Category" value={d.category} />
          <KeyValue label="Location" value={d.city ? `${d.address || d.city} · ${d.city}` : 'Not set'} />
          <KeyValue label="Photos" value={String(d.photos.length)} />
          <KeyValue label="License plate" value={plateWithState(d) ?? 'Not set'} />
          <KeyValue label="VIN" value={d.vin || 'Not set'} />
          <KeyValue label="Daily price" value={`$${d.dailyPrice}`} />
          <KeyValue label="Instant book" value={d.instantBook ? 'Yes' : 'No'} />
        </View>
      </Card>
      {blockers.length > 0 ? (
        <Card style={{ borderColor: c.warning, backgroundColor: c.warningSoft }}>
          <Text variant="label">{blockers.length} thing{blockers.length === 1 ? '' : 's'} still needed</Text>
          {blockers.map((b) => (
            <Pressable key={`${b.step}-${b.field}`} accessibilityRole="link" onPress={() => goTo(b.step)} style={{ paddingVertical: 6 }}>
              <Text variant="caption" tone="primary">{LISTING_STEPS[b.step]}: {b.msg}</Text>
            </Pressable>
          ))}
        </Card>
      ) : null}
      {createError ? (
        <Card style={{ borderColor: c.destructive }}>
          <Text variant="label" tone="destructive">{createError instanceof ApiError ? createError.message : 'Failed to create listing'}</Text>
          {createError instanceof ApiError && createError.details?.length
            ? createError.details.map((det, i) => <Text key={i} variant="caption" tone="muted">{det.field ? `${det.field} - ` : ''}{det.issue}</Text>)
            : null}
        </Card>
      ) : null}
      <Text variant="caption" tone="muted">Your listing will be created as a draft. Submit it for verification to go live.</Text>
    </View>
  );
}
