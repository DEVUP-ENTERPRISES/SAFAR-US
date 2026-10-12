import { useState } from 'react';
import { Pressable } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { Input, useTheme } from '@catodrive/ui';

/** A password field with a show/hide toggle; never autofilled from the phone's saved passwords. */
export function PasswordInput({ label, value, onChangeText }: { label: string; value: string; onChangeText: (v: string) => void }) {
  const { c } = useTheme();
  const [show, setShow] = useState(false);
  return (
    <Input
      label={label}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={!show}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="off"
      textContentType="none"
      right={
        <Pressable accessibilityRole="button" accessibilityLabel={show ? 'Hide password' : 'Show password'} hitSlop={10} onPress={() => setShow((s) => !s)}>
          {show ? <EyeOff size={18} color={c.mutedForeground} /> : <Eye size={18} color={c.mutedForeground} />}
        </Pressable>
      }
    />
  );
}
