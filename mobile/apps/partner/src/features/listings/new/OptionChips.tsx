import { ScrollView, View } from 'react-native';
import { Chip, Text, space } from '@catodrive/ui';

type Opt = string | { value: string; label: string };

/** A labelled single choice as chips, for the wizard's short option lists. */
export function OptionChips({ label, value, options, onChange, scroll }: { label: string; value: string; options: Opt[]; onChange: (v: string) => void; scroll?: boolean }) {
  const norm = options.map((o) => (typeof o === 'string' ? { value: o, label: o[0]?.toUpperCase() + o.slice(1) } : o));
  const chips = norm.map((o) => <Chip key={o.value || 'none'} label={o.label} selected={value === o.value} onPress={() => onChange(o.value)} />);
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="label">{label}</Text>
      {scroll ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {chips}
        </ScrollView>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>{chips}</View>
      )}
    </View>
  );
}
