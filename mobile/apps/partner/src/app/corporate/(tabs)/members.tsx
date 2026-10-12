import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react-native';
import { Badge, Button, Card, Chip, Input, Screen, ScreenHeader, SkeletonList, Text, space, useConfirm, useTheme } from '@catodrive/ui';
import { corporateApi } from '@catodrive/core/web/features/corporate/api';

const ROLES = [
  { value: 'employee', label: 'Employee' },
  { value: 'manager', label: 'Manager' },
  { value: 'corp_admin', label: 'Admin' },
];

/** The website's /corporate/members: invite people by work email and remove them. */
export default function CorporateMembersScreen() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const members = useQuery({ queryKey: ['corp-members'], queryFn: () => corporateApi.members() });
  const [form, setForm] = useState({ email: '', role: 'employee' });
  const invite = useMutation({
    mutationFn: () => corporateApi.invite(form.email, form.role),
    onSuccess: () => {
      setForm({ email: '', role: 'employee' });
      void qc.invalidateQueries({ queryKey: ['corp-members'] });
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => corporateApi.removeMember(id), onSuccess: () => void qc.invalidateQueries({ queryKey: ['corp-members'] }) });

  return (
    <Screen header={<ScreenHeader large title="Members" />} onRefresh={() => void members.refetch()} refreshing={members.isRefetching}>
      <Card>
        <Text variant="heading">Invite a member</Text>
        <View style={{ gap: space.md, marginTop: space.md }}>
          <Input label="Work email" value={form.email} onChangeText={(t) => setForm({ ...form, email: t })} placeholder="jane@acme.com" keyboardType="email-address" autoCapitalize="none" autoComplete="off" />
          <Text variant="label">Role</Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {ROLES.map((r) => <Chip key={r.value} label={r.label} selected={form.role === r.value} onPress={() => setForm({ ...form, role: r.value })} />)}
          </View>
          <Button title="Invite" disabled={!form.email} loading={invite.isPending} onPress={() => invite.mutate()} />
        </View>
      </Card>
      {members.isPending ? <SkeletonList rows={3} height={64} /> : null}
      {members.data?.map((m) => (
        <Card key={m._id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label" numberOfLines={1}>{m.email}</Text>
              <Text variant="caption" tone="muted" style={{ textTransform: 'capitalize' }}>{m.role.replace('_', ' ')}</Text>
            </View>
            <Badge label={m.status} tone={m.status === 'active' ? 'success' : 'warning'} />
            {m.role !== 'corp_admin' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${m.email}`}
                hitSlop={10}
                onPress={async () => {
                  const { ok } = await confirm({ title: `Remove ${m.email} from the organization?`, description: 'They lose access to corporate booking and cost centers immediately.', confirmLabel: 'Remove member', tone: 'destructive' });
                  if (ok) remove.mutate(m._id);
                }}
              >
                <Trash2 size={18} color={c.destructive} />
              </Pressable>
            ) : null}
          </View>
        </Card>
      ))}
    </Screen>
  );
}
