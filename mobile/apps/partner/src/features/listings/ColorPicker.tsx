import { Pressable, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text, space, useTheme } from '@catodrive/ui';
import { CAR_COLORS, LIGHT_COLORS } from '@catodrive/core/web/features/vehicles/listing-options';

const OTHER = ['#DC2626', '#EAB308', '#15803D', '#1D4ED8'];

/** Car colour as swatches, one canonical value per colour. */
export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { c } = useTheme();
  const selected = CAR_COLORS.find((x) => x.value === value.toLowerCase());
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        {CAR_COLORS.map((x) => {
          const on = x.value === value.toLowerCase();
          const other = x.hex.startsWith('conic');
          return (
            <Pressable
              key={x.value}
              accessibilityRole="radio"
              accessibilityLabel={x.label}
              accessibilityState={{ selected: on }}
              onPress={() => onChange(x.value)}
              style={{ width: 40, height: 40, borderRadius: 20, borderWidth: on ? 2 : 0, borderColor: c.primary, padding: 2 }}
            >
              <View style={{ flex: 1, borderRadius: 18, overflow: 'hidden', backgroundColor: other ? undefined : x.hex, borderWidth: x.ring ? 1 : 0, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
                {other ? (
                  <View style={{ position: 'absolute', inset: 0, flexDirection: 'row', flexWrap: 'wrap' }}>
                    {OTHER.map((h) => <View key={h} style={{ width: '50%', height: '50%', backgroundColor: h }} />)}
                  </View>
                ) : null}
                {on ? <Check size={16} strokeWidth={3} color={LIGHT_COLORS.includes(x.value) ? '#000' : '#fff'} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text variant="caption" tone="muted">{selected ? selected.label : 'Pick a colour'}</Text>
    </View>
  );
}
