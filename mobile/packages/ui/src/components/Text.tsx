import { Text as RNText, type TextProps } from 'react-native';
import { useTheme } from '../theme/theme';
import { type, type TypeVariant } from '../theme/tokens';

type Tone = 'default' | 'muted' | 'primary' | 'destructive' | 'success' | 'warning' | 'inverse';

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  tone?: Tone;
  center?: boolean;
}

export function Text({ variant = 'body', tone = 'default', center, style, ...rest }: AppTextProps) {
  const { c } = useTheme();
  const color = {
    default: c.foreground,
    muted: c.mutedForeground,
    primary: c.primary,
    destructive: c.destructive,
    success: c.success,
    warning: c.warning,
    inverse: c.primaryForeground,
  }[tone];
  return <RNText maxFontSizeMultiplier={1.6} style={[type[variant], { color }, center && { textAlign: 'center' }, style]} {...rest} />;
}
