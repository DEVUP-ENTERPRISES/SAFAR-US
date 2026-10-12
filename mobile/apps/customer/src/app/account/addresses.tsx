import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react-native';
import { Badge, Button, Card, Checkbox, Input, Screen, ScreenHeader, Section, Skeleton, Text, useConfirm, useTheme, space } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { accountApi } from '@catodrive/core/web/features/account/api';

const EMPTY = { line1: '', line2: '', city: '', state: '', zip: '' };

function Addresses() {
  const { c } = useTheme();
  const router = useRouter();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => accountApi.me() });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['me'] });
  const [addr, setAddr] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [makeMain, setMakeMain] = useState(true);
  const reset = () => {
    setAddr(EMPTY);
    setEditingId(null);
    setMakeMain(true);
  };

  const save = useMutation({
    mutationFn: () => {
      const body = { line1: addr.line1.trim(), line2: addr.line2.trim() || undefined, city: addr.city.trim(), state: addr.state.trim(), zip: addr.zip.trim(), country: 'US', isDefault: makeMain };
      return editingId ? accountApi.updateAddress(editingId, body) : accountApi.addAddress(body);
    },
    onSuccess: () => {
      reset();
      refresh();
      void qc.invalidateQueries({ queryKey: ['profile-status'] });
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => accountApi.removeAddress(id), onSuccess: refresh });
  const setDefault = useMutation({ mutationFn: (id: string) => accountApi.setDefaultAddress(id), onSuccess: refresh });
  const ready = !!(addr.line1.trim() && addr.city.trim() && addr.state.trim() && addr.zip.trim());

  return (
    <Screen header={<ScreenHeader title="Saved addresses" onBack={() => router.back()} />}>
      {me.isPending ? <Skeleton height={120} /> : null}
      {me.data?.addresses.map((a) => (
        <Card key={a.id}>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
                <Text variant="label">{a.line1}{a.line2 ? `, ${a.line2}` : ''}</Text>
                {a.isDefault ? <Badge label="Default" tone="success" /> : null}
              </View>
              <Text variant="caption" tone="muted">{[a.city, [a.state, a.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${a.line1}`}
              hitSlop={8}
              onPress={async () => {
                const { ok } = await confirm({ title: `Remove "${a.line1}"?`, description: 'This saved address will be deleted.', confirmLabel: 'Remove address', tone: 'destructive' });
                if (ok) remove.mutate(a.id);
              }}
            >
              <Trash2 size={20} color={c.mutedForeground} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
            <Button title="Edit" size="sm" variant="outline" full={false} onPress={() => { setAddr({ line1: a.line1, line2: a.line2 ?? '', city: a.city, state: a.state, zip: a.zip }); setEditingId(a.id); setMakeMain(a.isDefault); }} />
            {!a.isDefault ? <Button title="Set default" size="sm" variant="outline" full={false} onPress={() => setDefault.mutate(a.id)} /> : null}
          </View>
        </Card>
      ))}

      <Section title={editingId ? 'Edit address' : 'Add a new address'}>
        <Input label="Address" placeholder="Street address" autoComplete="street-address" value={addr.line1} onChangeText={(t) => setAddr({ ...addr, line1: t })} />
        <Input label="Apt, suite, unit (optional)" placeholder="Apt 4B" value={addr.line2} onChangeText={(t) => setAddr({ ...addr, line2: t })} />
        <Input label="City" autoComplete="postal-address-locality" value={addr.city} onChangeText={(t) => setAddr({ ...addr, city: t })} />
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <View style={{ flex: 1 }}><Input label="State" autoComplete="postal-address-region" value={addr.state} onChangeText={(t) => setAddr({ ...addr, state: t })} autoCapitalize="characters" /></View>
          <View style={{ flex: 1 }}><Input label="ZIP" autoComplete="postal-code" keyboardType="number-pad" value={addr.zip} onChangeText={(t) => setAddr({ ...addr, zip: t })} /></View>
        </View>
        <Checkbox checked={makeMain} onChange={setMakeMain} label="Use this as my main address (shown when verifying your identity)" />
        <Button title={editingId ? 'Save changes' : 'Add address'} disabled={!ready} loading={save.isPending} onPress={() => save.mutate()} />
        {editingId ? <Button title="Cancel" variant="outline" onPress={reset} /> : null}
      </Section>
    </Screen>
  );
}

export default function AddressesScreen() {
  return (
    <RequireAuth>
      <Addresses />
    </RequireAuth>
  );
}
