import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Card, Chip, Input, Text, radius, space, useTheme } from '@catodrive/ui';
import { PhoneInput } from '@catodrive/core';
import { ABILITY_LABELS, CAPTAIN_ABILITIES, DEFAULT_CAPTAIN_ABILITIES, captainInviteValid, type AssignableVehicle, type CaptainAbility, type CaptainInput } from '@catodrive/core/web/features/host/team-api';

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** Invite a Captain: who they are, what they may do, and which cars (none means the whole fleet). */
export function CaptainInviteForm({ vehicles, busy, onSubmit }: { vehicles: AssignableVehicle[]; busy: boolean; onSubmit: (b: CaptainInput) => void }) {
  const { c } = useTheme();
  const [f, setF] = useState({ name: '', email: '', phone: '', title: '' });
  const [abilities, setAbilities] = useState<CaptainAbility[]>(DEFAULT_CAPTAIN_ABILITIES);
  const [vehicleIds, setVehicleIds] = useState<string[]>([]);
  return (
    <Card>
      <View style={{ gap: space.md }}>
        <Input label="Name" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} placeholder="Marcus Reed" autoComplete="off" />
        <Input label="Email" hint="Where their invite goes" value={f.email} onChangeText={(v) => setF({ ...f, email: v })} placeholder="marcus@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="off" />
        <Input label="Role" hint="Shown on their profile" value={f.title} onChangeText={(v) => setF({ ...f, title: v })} placeholder="Valet" />
        <PhoneInput label="Phone (optional)" value={f.phone} onChange={(v) => setF((p) => ({ ...p, phone: v }))} />
        <Text variant="label">What can they do?</Text>
        {CAPTAIN_ABILITIES.map((a) => {
          const on = abilities.includes(a);
          return (
            <Pressable
              key={a}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => setAbilities((l) => toggle(l, a))}
              style={{ borderWidth: 1.5, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primarySoft : c.card, borderRadius: radius.lg, padding: space.md, gap: 2 }}
            >
              <Text variant="label">{ABILITY_LABELS[a].label}</Text>
              <Text variant="caption" tone="muted">{ABILITY_LABELS[a].detail}</Text>
            </Pressable>
          );
        })}
        <Text variant="label">Which cars?</Text>
        <Text variant="caption" tone="muted">Pick none to give them the whole fleet, including cars you add later.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {vehicles.map((v) => <Chip key={v._id} label={`${v.year} ${v.make} ${v.model}`} selected={vehicleIds.includes(v._id)} onPress={() => setVehicleIds((l) => toggle(l, v._id))} />)}
          {vehicles.length === 0 ? <Text variant="caption" tone="muted">No cars listed yet.</Text> : null}
        </View>
        <Button
          title="Send invite"
          disabled={!captainInviteValid(f, abilities)}
          loading={busy}
          onPress={() => onSubmit({ name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim() || undefined, title: f.title.trim() || undefined, abilities, vehicleIds })}
        />
      </View>
    </Card>
  );
}
