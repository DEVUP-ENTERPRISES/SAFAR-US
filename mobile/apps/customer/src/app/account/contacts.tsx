import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react-native';
import { Button, Card, Input, Screen, ScreenHeader, Section, Skeleton, Text, useConfirm, useTheme, space } from '@catodrive/ui';
import { PhoneInput, RequireAuth } from '@catodrive/core';
import { accountApi } from '@catodrive/core/web/features/account/api';

function Contacts() {
  const { c } = useTheme();
  const router = useRouter();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => accountApi.me() });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['me'] });
  const [contact, setContact] = useState({ name: '', phone: '', relation: '' });
  const add = useMutation({
    mutationFn: () => accountApi.addContact(contact),
    onSuccess: () => {
      setContact({ name: '', phone: '', relation: '' });
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => accountApi.removeContact(id), onSuccess: refresh });

  return (
    <Screen header={<ScreenHeader title="Emergency contacts" onBack={() => router.back()} />}>
      {me.isPending ? <Skeleton height={100} /> : null}
      {me.data?.emergencyContacts.map((x) => (
        <Card key={x.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Text variant="label">{x.name}</Text>
              <Text variant="caption" tone="muted">{x.phone}{x.relation ? ` · ${x.relation}` : ''}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${x.name}`}
              hitSlop={8}
              onPress={async () => {
                const { ok } = await confirm({ title: `Remove ${x.name}?`, description: 'This emergency contact will no longer be notified during a trip SOS.', confirmLabel: 'Remove contact', tone: 'destructive' });
                if (ok) remove.mutate(x.id);
              }}
            >
              <Trash2 size={20} color={c.mutedForeground} />
            </Pressable>
          </View>
        </Card>
      ))}
      <Section title="Add a contact">
        <Input placeholder="Name" value={contact.name} onChangeText={(t) => setContact({ ...contact, name: t })} autoComplete="name" />
        <PhoneInput value={contact.phone} onChange={(v) => setContact((prev) => ({ ...prev, phone: v }))} />
        <Input placeholder="Relation" value={contact.relation} onChangeText={(t) => setContact({ ...contact, relation: t })} />
        <Button title="Add contact" disabled={!contact.name || !contact.phone} loading={add.isPending} onPress={() => add.mutate()} />
      </Section>
    </Screen>
  );
}

export default function ContactsScreen() {
  return (
    <RequireAuth>
      <Contacts />
    </RequireAuth>
  );
}
