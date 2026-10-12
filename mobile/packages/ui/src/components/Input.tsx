import { forwardRef, useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../theme/theme';
import { fonts, radius, space, TOUCH } from '../theme/tokens';
import { Text } from './Text';

export interface InputProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
  left?: ReactNode;
  right?: ReactNode;
}

export const Input = forwardRef<TextInput, InputProps>(function Input({ label, hint, error, left, right, style, onFocus, onBlur, ...rest }, ref) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      {label ? <Text variant="label">{label}</Text> : null}
      <View style={[styles.field, { backgroundColor: c.card, borderColor: error ? c.destructive : focused ? c.primary : c.input }]}>
        {left}
        <TextInput
          ref={ref}
          placeholderTextColor={c.mutedForeground}
          accessibilityLabel={label ?? rest.placeholder}
          style={[styles.input, { color: c.foreground }, style]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {right}
      </View>
      {error ? (
        <Text variant="caption" tone="destructive">{error}</Text>
      ) : hint ? (
        <Text variant="caption" tone="muted">{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  field: { minHeight: TOUCH + 4, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 16, paddingVertical: space.md },
});
