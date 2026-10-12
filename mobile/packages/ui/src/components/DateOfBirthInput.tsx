import { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { space } from '../theme/tokens';
import { Input } from './Input';
import { Text } from './Text';

const pad = (n: string, len: number) => n.padStart(len, '0');

/** Month / day / year boxes for a date of birth; emits "YYYY-MM-DD" once all three are valid, '' otherwise. */
export function DateOfBirthInput({ label = 'Date of birth', value, onChange, error, hint }: { label?: string; value: string; onChange: (iso: string) => void; error?: string; hint?: string }) {
  const [mm, setMm] = useState(value ? value.slice(5, 7) : '');
  const [dd, setDd] = useState(value ? value.slice(8, 10) : '');
  const [yyyy, setYyyy] = useState(value ? value.slice(0, 4) : '');
  const dayRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!value) return;
    setYyyy(value.slice(0, 4));
    setMm(value.slice(5, 7));
    setDd(value.slice(8, 10));
  }, [value]);

  const emit = (m: string, d: string, y: string) => {
    const mi = Number(m);
    const di = Number(d);
    const yi = Number(y);
    const valid = y.length === 4 && mi >= 1 && mi <= 12 && di >= 1 && di <= new Date(Date.UTC(yi, mi, 0)).getUTCDate();
    onChange(valid ? `${y}-${pad(String(mi), 2)}-${pad(String(di), 2)}` : '');
  };

  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">{label}</Text>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Input
            placeholder="MM"
            accessibilityLabel="Birth month"
            keyboardType="number-pad"
            maxLength={2}
            value={mm}
            onChangeText={(t) => {
              const v = t.replace(/\D/g, '');
              setMm(v);
              emit(v, dd, yyyy);
              if (v.length === 2) dayRef.current?.focus();
            }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            ref={dayRef}
            placeholder="DD"
            accessibilityLabel="Birth day"
            keyboardType="number-pad"
            maxLength={2}
            value={dd}
            onChangeText={(t) => {
              const v = t.replace(/\D/g, '');
              setDd(v);
              emit(mm, v, yyyy);
              if (v.length === 2) yearRef.current?.focus();
            }}
          />
        </View>
        <View style={{ flex: 1.5 }}>
          <Input
            ref={yearRef}
            placeholder="YYYY"
            accessibilityLabel="Birth year"
            keyboardType="number-pad"
            maxLength={4}
            value={yyyy}
            onChangeText={(t) => {
              const v = t.replace(/\D/g, '');
              setYyyy(v);
              emit(mm, dd, v);
            }}
          />
        </View>
      </View>
      {error ? <Text variant="caption" tone="destructive">{error}</Text> : hint ? <Text variant="caption" tone="muted">{hint}</Text> : null}
    </View>
  );
}
