import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, UserPlus, Users } from 'lucide-react-native';
import { Button, Card, EmptyState, ErrorState, Screen, ScreenHeader, SkeletonList, Text, space, useConfirm, useTheme, useToast } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { teamApi, type Captain } from '@catodrive/core/web/features/host/team-api';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { CaptainCard } from '@/features/host/CaptainCard';
import { CaptainInviteForm } from '@/features/host/CaptainInviteForm';

/** The website's /host/team: Captains get their own access to named cars and abilities - never the host's money. */
function Team() {
  const { c } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const team = useQuery({ queryKey: ['host-team'], queryFn: () => teamApi.list() });
  const vehicles = useQuery({ queryKey: ['host-team-vehicles'], queryFn: () => teamApi.assignableVehicles() });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['host-team'] });
  const fail = (e: unknown) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Something went wrong' });

  const invite = useMutation({
    meta: { silentError: true },
    mutationFn: teamApi.invite,
    onSuccess: () => {
      toast({ tone: 'success', title: 'Invite sent' });
      setAdding(false);
      refresh();
    },
    onError: fail,
  });
  const setStatus = useMutation({
    meta: { silentError: true },
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' }) => teamApi.setStatus(id, status),
    onSuccess: refresh,
    onError: fail,
  });
  const remove = useMutation({
    meta: { silentError: true },
    mutationFn: teamApi.remove,
    onSuccess: () => {
      toast({ tone: 'success', title: 'Captain removed' });
      refresh();
    },
    onError: fail,
  });

  const onRemove = async (cap: Captain) => {
    const { ok } = await confirm({ title: `Remove ${cap.name}?`, description: 'They lose access to your cars immediately. This cannot be undone.', confirmLabel: 'Remove', tone: 'destructive' });
    if (ok) remove.mutate(cap._id);
  };

  return (
    <Screen
      header={
        <ScreenHeader
          title="Captains"
          subtitle="The people who run your cars day to day - with their own access, not your password."
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/host/menu'))}
          right={<Button title={adding ? 'Cancel' : 'Add'} size="sm" full={false} variant={adding ? 'outline' : 'primary'} icon={adding ? undefined : <UserPlus size={16} color={c.primaryForeground} />} onPress={() => setAdding((v) => !v)} />}
        />
      }
      onRefresh={() => void team.refetch()}
      refreshing={team.isRefetching}
    >
      <Card style={{ backgroundColor: c.successSoft, borderColor: c.success }}>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <ShieldCheck size={18} color={c.success} />
          <Text variant="caption" style={{ flex: 1 }}>
            <Text variant="caption" style={{ fontWeight: '600' }}>Captains never touch your money.</Text> They cannot see earnings, change prices, edit payout details, or issue refunds. Those stay with you.
          </Text>
        </View>
      </Card>
      {adding ? <CaptainInviteForm vehicles={vehicles.data ?? []} busy={invite.isPending} onSubmit={(b) => invite.mutate(b)} /> : null}
      {team.isPending ? (
        <SkeletonList rows={2} height={160} />
      ) : team.isError ? (
        <ErrorState message="Couldn't load your team." onRetry={() => void team.refetch()} />
      ) : (team.data?.length ?? 0) === 0 ? (
        <EmptyState icon={<Users size={28} color={c.primary} />} title="No Captains yet" body="Add someone who handles your handovers, cleaning or servicing. They get their own access to only the cars you pick." />
      ) : (
        team.data!.map((cap) => (
          <CaptainCard
            key={cap._id}
            c={cap}
            vehicles={vehicles.data ?? []}
            busy={(setStatus.isPending && setStatus.variables?.id === cap._id) || (remove.isPending && remove.variables === cap._id)}
            onToggle={() => setStatus.mutate({ id: cap._id, status: cap.status === 'suspended' ? 'active' : 'suspended' })}
            onRemove={() => void onRemove(cap)}
          />
        ))
      )}
    </Screen>
  );
}

export default function TeamScreen() {
  return (
    <RequireAuth>
      <Team />
    </RequireAuth>
  );
}
