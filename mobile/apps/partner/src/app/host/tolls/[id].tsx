import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Pencil, User } from 'lucide-react-native';
import { Badge, Button, Card, Checkbox, Input, Screen, ScreenHeader, Section, Skeleton, SkeletonList, Text, space, useConfirm, useTheme, useToast } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { useHostMe } from '@catodrive/core/web/features/host/hooks';
import { TOLL_CAR_STATUS, TOLL_STATUS, agencyLabel, hostTollsApi } from '@catodrive/core/web/features/host/tolls-api';
import { useMyVehicles } from '@catodrive/core/web/features/vehicles/hooks';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { PasswordInput } from '@/features/host/PasswordInput';

/** The website's /host/tolls/[id]: who the account belongs to, its login, and the cars tracked on it. */
function TollAccount({ id, startEditing }: { id: string; startEditing: boolean }) {
  const { c } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const host = useHostMe();
  const account = useQuery({ queryKey: ['host-toll-account', id], queryFn: () => hostTollsApi.account(id) });
  const cars = useMyVehicles(true);
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [loginOpen, setLoginOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!account.data) return;
    setPicked(account.data.vehicleIds);
    if (startEditing) setEditing(true);
  }, [account.data, startEditing]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['host-toll-account', id] });
    void qc.invalidateQueries({ queryKey: ['host-toll-accounts'] });
  };
  const saveCars = useMutation({
    meta: { silentError: true },
    mutationFn: () => hostTollsApi.setVehicles(id, picked),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Linked vehicles saved' });
      setEditing(false);
      refresh();
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not save' }),
  });
  const saveLogin = useMutation({
    meta: { silentError: true },
    mutationFn: () => hostTollsApi.updateLogin(id, username, password),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Credentials updated' });
      setLoginOpen(false);
      setUsername('');
      setPassword('');
      refresh();
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not update' }),
  });
  const unlink = useMutation({
    meta: { silentError: true },
    mutationFn: () => hostTollsApi.unlink(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['host-toll-accounts'] });
      router.replace('/host/tolls');
    },
    onError: () => toast({ tone: 'error', title: 'Could not unlink the account' }),
  });

  const all = cars.data ?? [];
  const linked = useMemo(() => all.filter((v) => (editing ? true : account.data?.vehicleIds.includes(v._id))), [all, editing, account.data]);
  const a = account.data;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/host/tolls'));

  if (account.isPending) return <Screen header={<ScreenHeader title="Toll account" onBack={back} />}><Skeleton height={240} /></Screen>;
  if (!a) return <Screen header={<ScreenHeader title="Toll account" onBack={back} />}><Text tone="muted">This toll account wasn’t found.</Text></Screen>;

  return (
    <Screen
      header={<ScreenHeader title={agencyLabel(a.agency)} subtitle={a.nickname} onBack={back} />}
      footer={
        editing ? (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button title="Cancel" variant="outline" onPress={() => { setPicked(a.vehicleIds); setEditing(false); }} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title={`Save (${picked.length})`} loading={saveCars.isPending} onPress={() => saveCars.mutate()} />
            </View>
          </View>
        ) : undefined
      }
    >
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text variant="label" style={{ flex: 1 }}>Linked to this toll account</Text>
          <Badge label={TOLL_STATUS[a.status].label} tone={TOLL_STATUS[a.status].tone} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm }}>
          <User size={16} color={c.mutedForeground} />
          <Text>{host.data?.displayName ?? 'CatoDrive'}</Text>
        </View>
        {!loginOpen ? (
          <Button title="Update credentials" variant="ghost" size="sm" full={false} style={{ marginTop: space.sm }} onPress={() => setLoginOpen(true)} />
        ) : (
          <View style={{ gap: space.md, marginTop: space.md }}>
            <Input label="Account number or username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} autoComplete="off" />
            <PasswordInput label="Password" value={password} onChangeText={setPassword} />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Button title="Cancel" variant="outline" onPress={() => setLoginOpen(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Save" disabled={!username.trim() || !password} loading={saveLogin.isPending} onPress={() => saveLogin.mutate()} />
              </View>
            </View>
          </View>
        )}
        {a.status === 'manual' ? (
          <Text variant="caption" tone="muted" style={{ marginTop: space.sm }}>Tolls are added from NTTA statements for now; automatic sync turns on once NTTA opens access.</Text>
        ) : null}
      </Card>

      <Section
        title={editing ? 'Choose linked vehicles' : `Linked vehicles (${a.vehicleIds.length})`}
        action={
          !editing ? (
            <Button title="Edit" variant="ghost" size="sm" full={false} icon={<Pencil size={14} color={c.foreground} />} onPress={() => setEditing(true)} />
          ) : (
            <Button title={picked.length === all.length ? 'Clear all' : 'Select all'} variant="ghost" size="sm" full={false} onPress={() => setPicked(picked.length === all.length ? [] : all.map((v) => v._id))} />
          )
        }
      >
        {cars.isPending ? <SkeletonList rows={2} height={72} /> : null}
        {!cars.isPending && !linked.length ? <Text variant="caption" tone="muted">No cars linked yet. Tap Edit to choose them.</Text> : null}
        {linked.map((v) => {
          const cover = v.photos?.find((p) => p.isCover)?.url ?? v.photos?.[0]?.url;
          const row = (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View style={{ width: 64, height: 44, borderRadius: 8, overflow: 'hidden', backgroundColor: c.muted }}>
                {cover ? <Image source={{ uri: cover }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label">{v.make} {v.model} {v.year}</Text>
                <Text variant="caption" tone="muted">{v.registrationNumber ?? 'No plate'} · {TOLL_CAR_STATUS[v.status] ?? v.status}</Text>
                {!editing ? <Text variant="caption" tone="muted">Track via ‘license plate registered’</Text> : null}
              </View>
            </View>
          );
          return (
            <Card key={v._id}>
              {editing ? (
                <Checkbox checked={picked.includes(v._id)} onChange={() => setPicked((p) => (p.includes(v._id) ? p.filter((x) => x !== v._id) : [...p, v._id]))}>
                  {row}
                </Checkbox>
              ) : (
                row
              )}
            </Card>
          );
        })}
      </Section>

      {!editing ? (
        <Button
          title="Unlink toll account"
          variant="ghost"
          loading={unlink.isPending}
          onPress={async () => {
            const { ok } = await confirm({ title: 'Unlink this toll account?', description: 'Its saved login is deleted. Tolls already recorded stay on their trips.', confirmLabel: 'Unlink', tone: 'destructive' });
            if (ok) unlink.mutate();
          }}
        />
      ) : null}
    </Screen>
  );
}

export default function TollAccountScreen() {
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  return (
    <RequireAuth>
      <TollAccount id={id} startEditing={edit === '1'} />
    </RequireAuth>
  );
}
