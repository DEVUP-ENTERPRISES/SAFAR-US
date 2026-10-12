import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Location from 'expo-location';
import { CalendarDays, LocateFixed, MapPin, Search } from 'lucide-react-native';
import { BottomSheet, Button, Card, DateRangeCalendar, Divider, Text, useTheme, useToast, space, TOUCH } from '@catodrive/ui';
import { useFacets } from '@catodrive/core/web/features/vehicles/hooks';
import { useSearchBar } from '@catodrive/core/web/features/search/search-store';
import { formatClock } from '@catodrive/core/web/lib/utils/format';
import { TimeSheet } from './TimeSheet';


const shortDate = (d: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '');

function Row({ icon, label, value, placeholder, onPress }: { icon: React.ReactNode; label: string; value?: string; placeholder: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value || placeholder}`} onPress={onPress} android_ripple={{ color: 'rgba(0,0,0,0.06)' }} style={styles.row}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text variant="small" tone="muted">{label.toUpperCase()}</Text>
        <Text variant="label" tone={value ? 'default' : 'muted'} numberOfLines={1}>{value || placeholder}</Text>
      </View>
    </Pressable>
  );
}

/** Where / From / Until, shared with the Search tab through the same store the website uses. */
export function SearchBar({ onSearch }: { onSearch?: () => void }) {
  const { c } = useTheme();
  const toast = useToast();
  const s = useSearchBar();
  const cities = useFacets().data?.cities ?? [];
  const activeCity = cities.find((x) => x.city === s.city) ?? cities[0];
  const placeLabel = s.center?.label ?? activeCity?.city ?? '';
  const [sheet, setSheet] = useState<'place' | 'dates' | 'from-time' | 'until-time' | null>(null);
  const [locating, setLocating] = useState(false);

  const nearMe = async () => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        toast({ tone: 'info', title: 'Location is off', body: 'Pick a city instead, or allow location in Settings.' });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      s.patch({ center: { lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Near you' } });
      setSheet(null);
    } catch {
      toast({ tone: 'error', title: "Couldn't find your location", body: 'Pick a city instead.' });
    } finally {
      setLocating(false);
    }
  };

  return (
    <>
      <Card padded={false}>
        <Row icon={<MapPin size={20} color={c.primary} />} label="Where" value={placeLabel} placeholder="Where are you going?" onPress={() => setSheet('place')} />
        <Divider inset={52} />
        <Row
          icon={<CalendarDays size={20} color={c.primary} />}
          label="From"
          value={s.fromDate ? `${shortDate(s.fromDate)} · ${formatClock(s.fromTime)}` : ''}
          placeholder="Add date"
          onPress={() => setSheet('dates')}
        />
        <Divider inset={52} />
        <Row
          icon={<CalendarDays size={20} color={c.primary} />}
          label="Until"
          value={s.untilDate ? `${shortDate(s.untilDate)} · ${formatClock(s.untilTime)}` : ''}
          placeholder="Add date"
          onPress={() => setSheet('dates')}
        />
        {onSearch ? (
          <View style={styles.action}>
            <Button title="Search" icon={<Search size={18} color={c.primaryForeground} />} onPress={onSearch} />
          </View>
        ) : null}
      </Card>

      <BottomSheet visible={sheet === 'place'} onClose={() => setSheet(null)} title="Select a city">
        <Button title={locating ? 'Finding you…' : 'Use my location'} variant="outline" loading={locating} icon={<LocateFixed size={18} color={c.foreground} />} onPress={() => void nearMe()} />
        {cities.length === 0 ? <Text tone="muted" center>No cities yet.</Text> : null}
        {cities.map((x) => {
          const on = (s.center?.label ?? s.city) === x.city;
          return (
            <Pressable
              key={x.city}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => {
                s.patch({ city: x.city, center: null });
                setSheet(null);
              }}
              style={[styles.option, on && { backgroundColor: c.primarySoft }]}
            >
              <MapPin size={18} color={on ? c.primary : c.mutedForeground} />
              <Text variant="label" style={{ flex: 1 }}>{x.city}</Text>
              <Text variant="caption" tone="muted">{x.vehicles} {x.vehicles === 1 ? 'car' : 'cars'}</Text>
            </Pressable>
          );
        })}
      </BottomSheet>

      <BottomSheet
        visible={sheet === 'dates'}
        onClose={() => setSheet(null)}
        title="Trip dates"
        footer={<Button title={s.fromDate && s.untilDate ? 'Next: pick-up time' : 'Pick both dates'} disabled={!s.fromDate || !s.untilDate} onPress={() => setSheet('from-time')} />}
      >
        <DateRangeCalendar from={s.fromDate} to={s.untilDate} onChange={(f, t) => s.patch({ fromDate: f, untilDate: t })} />
      </BottomSheet>

      <TimeSheet visible={sheet === 'from-time'} title="Pick-up time" value={s.fromTime} onClose={() => setSheet(null)} onPick={(t) => { s.patch({ fromTime: t }); setSheet('until-time'); }} />
      <TimeSheet visible={sheet === 'until-time'} title="Return time" value={s.untilTime} onClose={() => setSheet(null)} onPick={(t) => { s.patch({ untilTime: t }); setSheet(null); }} />
    </>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: TOUCH + 12, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  action: { padding: space.md, paddingTop: space.sm },
  option: { minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, borderRadius: 12 },
});
