import { StyleSheet, View } from 'react-native';
import { Star, Zap } from 'lucide-react-native';
import { BottomSheet, Button, Chip, Input, Text, useTheme, space } from '@catodrive/ui';
import { FUELS, SEAT_OPTIONS, EMPTY_FILTERS, type SearchFilters } from '@catodrive/core/web/features/search/search-params';
import type { FilterCounts } from '@catodrive/core/web/features/vehicles/api';
import type { CategoryFacet } from '@catodrive/core/web/features/vehicles/api';
import { FUEL_LABEL } from '@catodrive/core/web/lib/utils/format';

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="label">{title}</Text>
      <View style={styles.wrap}>{children}</View>
    </View>
  );
}

/** Every filter the website's dropdowns offer, in one sheet. An option with no cars nearby is hidden. */
export function FilterSheet({
  visible,
  onClose,
  value,
  onChange,
  categories,
  counts,
  total,
}: {
  visible: boolean;
  onClose: () => void;
  value: SearchFilters;
  onChange: (next: SearchFilters) => void;
  categories: CategoryFacet[];
  counts?: FilterCounts;
  total?: number;
}) {
  const { c } = useTheme();
  const set = (patch: Partial<SearchFilters>) => onChange({ ...value, ...patch });
  const dead = (n: number | undefined, on: boolean) => n === 0 && !on;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Filters"
      footer={
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button title="Clear all" variant="outline" full={false} style={{ flex: 1 }} onPress={() => onChange({ ...EMPTY_FILTERS, sort: value.sort })} />
          <Button title={total === undefined ? 'Show cars' : `Show ${total} cars`} full={false} style={{ flex: 2 }} onPress={onClose} />
        </View>
      }
    >
      <Group title="Daily price">
        <View style={styles.pair}>
          <View style={{ flex: 1 }}><Input placeholder="Min $" keyboardType="number-pad" value={value.priceMin} onChangeText={(t) => set({ priceMin: t.replace(/\D/g, '') })} /></View>
          <View style={{ flex: 1 }}><Input placeholder="Max $" keyboardType="number-pad" value={value.priceMax} onChangeText={(t) => set({ priceMax: t.replace(/\D/g, '') })} /></View>
        </View>
      </Group>

      {categories.length ? (
        <Group title="Vehicle type">
          {categories.map((x) => {
            const on = value.category === x.category;
            return dead(counts?.category[x.category], on) ? null : (
              <Chip key={x.category} label={x.category[0].toUpperCase() + x.category.slice(1)} selected={on} onPress={() => set({ category: on ? '' : x.category })} />
            );
          })}
        </Group>
      ) : null}

      <Group title="Make">
        <View style={{ flex: 1 }}><Input placeholder="e.g. Tesla, BMW" value={value.make} onChangeText={(t) => set({ make: t })} autoCapitalize="words" /></View>
      </Group>

      <Group title="Year">
        <View style={styles.pair}>
          <View style={{ flex: 1 }}><Input placeholder="From" keyboardType="number-pad" maxLength={4} value={value.yearMin} onChangeText={(t) => set({ yearMin: t.replace(/\D/g, '') })} /></View>
          <View style={{ flex: 1 }}><Input placeholder="To" keyboardType="number-pad" maxLength={4} value={value.yearMax} onChangeText={(t) => set({ yearMax: t.replace(/\D/g, '') })} /></View>
        </View>
      </Group>

      <Group title="Minimum seats">
        {SEAT_OPTIONS.map((s) => {
          const on = value.seatsMin === String(s);
          return dead(counts?.seats[String(s)], on) ? null : <Chip key={s} label={`${s}+`} selected={on} onPress={() => set({ seatsMin: on ? '' : String(s) })} />;
        })}
      </Group>

      <Group title="Fuel type">
        {FUELS.map((f) => {
          const on = value.fuelType === f;
          return dead(counts?.fuelType[f], on) ? null : (
            <Chip key={f} label={f === 'ev' ? 'Electric' : FUEL_LABEL[f]} icon={f === 'ev' ? <Zap size={14} color={on ? c.inkForeground : c.primary} /> : undefined} selected={on} onPress={() => set({ fuelType: on ? '' : f })} />
          );
        })}
      </Group>

      <Group title="Transmission">
        {['automatic', 'manual'].map((t) => {
          const on = value.transmission === t;
          return dead(counts?.transmission[t], on) ? null : <Chip key={t} label={t[0].toUpperCase() + t.slice(1)} selected={on} onPress={() => set({ transmission: on ? '' : t })} />;
        })}
      </Group>

      <Group title="Minimum rating">
        {[4, 4.5].map((r) => {
          const on = value.ratingMin === r;
          return <Chip key={r} label={`${r}+`} icon={<Star size={14} color={on ? c.inkForeground : c.primary} fill={on ? c.inkForeground : c.primary} />} selected={on} onPress={() => set({ ratingMin: on ? 0 : r })} />;
        })}
      </Group>

      <Group title="Booking">
        <Chip label="Instant Book" icon={<Zap size={14} color={value.instantBook ? c.inkForeground : c.warning} />} selected={value.instantBook} onPress={() => set({ instantBook: !value.instantBook })} />
        <Chip label="Deliver to me" selected={value.delivery} onPress={() => set({ delivery: !value.delivery })} />
      </Group>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pair: { flexDirection: 'row', gap: space.sm, flex: 1 },
});
