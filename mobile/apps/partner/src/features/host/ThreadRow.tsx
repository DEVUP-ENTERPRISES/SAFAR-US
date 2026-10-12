import { View } from 'react-native';
import { Avatar, Card, Text, radius, space, useTheme } from '@catodrive/ui';

/** One conversation in the host inbox: who, which car, the last line, and the unread count. */
export function ThreadRow({ name, avatar, title, preview, fromMe, unread, onPress }: { name: string; avatar?: string; title: string; preview: string; fromMe: boolean; unread: number; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel={`${name}, ${title}${unread ? `, ${unread} unread` : ''}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Avatar uri={avatar} name={name} size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label" numberOfLines={1}>{name}</Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>{title}</Text>
          <Text variant="caption" numberOfLines={1} style={unread ? { fontWeight: '600' } : undefined}>
            {fromMe ? 'You: ' : ''}{preview || '-'}
          </Text>
        </View>
        {unread > 0 ? (
          <View style={{ minWidth: 22, height: 22, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, backgroundColor: c.primary }}>
            <Text variant="small" style={{ color: c.primaryForeground }}>{unread}</Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}
