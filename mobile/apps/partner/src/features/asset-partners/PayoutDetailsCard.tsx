import { View } from 'react-native';
import { Wallet } from 'lucide-react-native';
import { Button, Card, Input, Text, space, useTheme } from '@catodrive/ui';

/** Where the monthly payout goes: a mailing address for checks, or a Zelle handle. */
export function PayoutDetailsCard({
  method,
  mailingAddress,
  setMailingAddress,
  zelleHandle,
  setZelleHandle,
  onSave,
  saving,
}: {
  method?: 'check' | 'zelle';
  mailingAddress: string;
  setMailingAddress: (v: string) => void;
  zelleHandle: string;
  setZelleHandle: (v: string) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const { c } = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Wallet size={18} color={c.primary} />
        <Text variant="heading">Where your money goes</Text>
      </View>
      <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
        You’re paid by {method ?? 'check'}. Keep this current - a wrong address or handle delays your payout.
      </Text>
      <View style={{ gap: space.md, marginTop: space.md }}>
        {!method || method === 'check' ? (
          <Input
            label="Mailing address"
            hint="Where we send your check."
            value={mailingAddress}
            onChangeText={setMailingAddress}
            placeholder="123 Main St, Apt 4B, Dallas, TX 75201"
            multiline
            autoComplete="street-address"
            style={{ minHeight: 72, textAlignVertical: 'top' }}
          />
        ) : null}
        {method === 'zelle' ? (
          <Input
            label="Zelle handle"
            hint="The email or phone your Zelle account uses."
            value={zelleHandle}
            onChangeText={setZelleHandle}
            placeholder="you@example.com or (214) 555-0142"
            autoCapitalize="none"
          />
        ) : null}
        <Button title="Save payout details" loading={saving} onPress={onSave} />
      </View>
    </Card>
  );
}
