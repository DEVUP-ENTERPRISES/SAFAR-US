import { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTheme } from '../theme/theme';
import { fonts, radius, space } from '../theme/tokens';
import { Text } from './Text';

/** A 6-digit code field. One hidden input drives the boxes, so paste and SMS autofill just work. */
export function OtpInput({ value, onChange, length = 6, error }: { value: string; onChange: (v: string) => void; length?: number; error?: string }) {
  const { c } = useTheme();
  const ref = useRef<TextInput>(null);
  return (
    <View style={{ gap: space.sm }}>
      <Pressable accessibilityLabel="Enter the code" onPress={() => ref.current?.focus()} style={styles.row}>
        {Array.from({ length }, (_, i) => {
          const active = i === Math.min(value.length, length - 1);
          return (
            <View key={i} style={[styles.box, { backgroundColor: c.card, borderColor: error ? c.destructive : active ? c.primary : c.input }]}>
              <Text style={styles.digit}>{value[i] ?? ''}</Text>
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoFocus
        maxLength={length}
        style={styles.hidden}
        accessibilityLabel="Verification code"
      />
      {error ? <Text variant="caption" tone="destructive">{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  box: { flex: 1, aspectRatio: 0.85, maxWidth: 56, borderWidth: 1.5, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  digit: { fontFamily: fonts.semibold, fontSize: 22 },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
});
