import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { BellRing } from 'lucide-react-native';
import { Button, Card, Text, space, useTheme, useToast } from '@catodrive/ui';
import { enablePush, notificationsModule } from '../push';

/** Offers to turn on notifications while the phone hasn't granted them and can still be asked; hidden where push can't run. */
export function PushPrompt({ title, detail, successBody }: { title?: string; detail: string; successBody: string }) {
  const { c } = useTheme();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const permission = useQuery({
    queryKey: ['push-permission'],
    queryFn: async () => (await notificationsModule()?.getPermissionsAsync().catch(() => null)) ?? null,
  });
  if (!permission.data || permission.data.granted || !permission.data.canAskAgain) return null;

  const turnOn = async () => {
    setBusy(true);
    try {
      const ok = await enablePush();
      toast(ok ? { tone: 'success', title: 'Notifications on', body: successBody } : { tone: 'error', title: 'Notifications not enabled', body: 'Permission was denied or unavailable.' });
      void permission.refetch();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
        <BellRing size={18} color={c.primary} />
        <View style={{ flex: 1, gap: 2 }}>
          {title ? <Text variant="label">{title}</Text> : null}
          <Text variant="caption" tone={title ? 'muted' : 'default'}>{detail}</Text>
        </View>
      </View>
      <Button title="Enable notifications" size="sm" full={false} loading={busy} style={{ marginTop: space.sm }} onPress={() => void turnOn()} />
    </Card>
  );
}
