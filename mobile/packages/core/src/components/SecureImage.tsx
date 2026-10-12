import { View, type StyleProp, type ImageStyle } from 'react-native';
import { Image } from 'expo-image';
import { Lock } from 'lucide-react-native';
import { Skeleton, Text, useTheme } from '@catodrive/ui';
import { useSecureUrl } from '../web/features/media/secure-url';

/** A photo that may be private (chat, licence, claim): fetched through a short-lived signed link, like the website. */
export function SecureImage({ url, style, alt }: { url: string; style: StyleProp<ImageStyle>; alt?: string }) {
  const { c } = useTheme();
  const { src, loading, denied } = useSecureUrl(url);
  if (loading) return <Skeleton height={160} />;
  if (denied || !src) {
    return (
      <View style={[{ alignItems: 'center', justifyContent: 'center', backgroundColor: c.muted, padding: 16 }, style as object]}>
        <Lock size={18} color={c.mutedForeground} />
        <Text variant="caption" tone="muted">No access</Text>
      </View>
    );
  }
  return <Image source={{ uri: src }} style={style} contentFit="cover" accessibilityLabel={alt ?? 'Shared photo'} />;
}
