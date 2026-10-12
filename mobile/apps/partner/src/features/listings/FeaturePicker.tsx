import { useState } from 'react';
import { View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { Button, Chip, Input, Text, space, useTheme } from '@catodrive/ui';
import { FEATURE_GROUPS, KNOWN_FEATURES } from '@catodrive/core/web/features/vehicles/listing-options';

/** Vehicle features as a grouped checklist, plus free-text custom ones. */
export function FeaturePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { c } = useTheme();
  const [customInput, setCustomInput] = useState('');
  const custom = value.filter((v) => !KNOWN_FEATURES.has(v));
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const addCustom = () => {
    const v = customInput.trim();
    if (!v || value.includes(v)) return;
    onChange([...value, v]);
    setCustomInput('');
  };
  return (
    <View style={{ gap: space.md }}>
      {FEATURE_GROUPS.map((g) => (
        <View key={g.label} style={{ gap: space.sm }}>
          <Text variant="small" tone="muted">{g.label.toUpperCase()}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {g.items.map((item) => <Chip key={item.value} label={item.label} selected={value.includes(item.value)} onPress={() => toggle(item.value)} />)}
          </View>
        </View>
      ))}
      <View style={{ gap: space.sm }}>
        <Text variant="small" tone="muted">CUSTOM FEATURES</Text>
        {custom.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {custom.map((x) => <Chip key={x} label={`${x}  ✕`} selected onPress={() => onChange(value.filter((v) => v !== x))} />)}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Input value={customInput} onChangeText={setCustomInput} placeholder="e.g. Roof box" returnKeyType="done" onSubmitEditing={addCustom} />
          </View>
          <Button title="Add" size="sm" variant="outline" full={false} icon={<Plus size={14} color={c.foreground} />} onPress={addCustom} />
        </View>
      </View>
    </View>
  );
}
