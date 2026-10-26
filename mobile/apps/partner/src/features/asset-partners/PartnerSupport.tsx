import { View } from 'react-native';
import { Mail, Phone } from 'lucide-react-native';
import { Card, MenuRow, Text, space, useTheme } from '@catodrive/ui';
import { openExternal } from '@catodrive/core';
import { CONTACT } from '@catodrive/core/web/features/contact/content';

/** The partner team's phone and email. */
export function PartnerSupport() {
  const { c } = useTheme();
  return (
    <Card>
      <Text variant="heading">Questions about your vehicle?</Text>
      <View style={{ marginTop: space.sm }}>
        <MenuRow icon={<Phone size={20} color={c.primary} />} label="Asset Partner hotline" value={CONTACT.assetPartnerHotlineDisplay} onPress={() => void openExternal(CONTACT.assetPartnerHotlineHref)} />
        <MenuRow icon={<Mail size={20} color={c.primary} />} label="Email" value={CONTACT.email} onPress={() => void openExternal(`mailto:${CONTACT.email}`)} />
      </View>
    </Card>
  );
}
