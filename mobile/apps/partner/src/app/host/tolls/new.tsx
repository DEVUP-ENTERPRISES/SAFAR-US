import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lightbulb, Lock } from 'lucide-react-native';
import { Button, Input, RadioCard, Screen, ScreenHeader, Text, space, useTheme, useToast } from '@catodrive/ui';
import { RequireAuth } from '@catodrive/core';
import { TOLL_AGENCIES, agencyLabel, hostTollsApi } from '@catodrive/core/web/features/host/tolls-api';
import { ApiError } from '@catodrive/core/web/lib/api/types';
import { PasswordInput } from '@/features/host/PasswordInput';

/** The website's /host/tolls/new: pick the agency, then log in with that agency's details. */
function LinkTollAccount() {
  const { c } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const existing = useQuery({ queryKey: ['host-toll-accounts'], queryFn: () => hostTollsApi.accounts() });
  const [agency, setAgency] = useState<string | null>(null);
  const [step, setStep] = useState<'agency' | 'login'>('agency');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const defaultNickname = `${(agency ?? 'ntta').toUpperCase()}-${(existing.data?.length ?? 0) + 1}`;

  const link = useMutation({
    meta: { silentError: true },
    mutationFn: () => hostTollsApi.link({ agency: 'ntta', nickname: nickname.trim() || defaultNickname, username, password }),
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: ['host-toll-accounts'] });
      toast({ tone: 'success', title: 'Toll account linked', body: 'Now choose the cars that run on it.' });
      router.replace({ pathname: '/host/tolls/[id]', params: { id: a._id, edit: '1' } });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not link the account' }),
  });

  const back = () => (step === 'login' ? setStep('agency') : router.canGoBack() ? router.back() : router.replace('/host/tolls'));

  if (step === 'agency') {
    return (
      <Screen header={<ScreenHeader title="Choose your toll agency" onBack={back} />} footer={<Button title="Next" disabled={!agency} onPress={() => setStep('login')} />}>
        {TOLL_AGENCIES.map((a) => (
          <RadioCard
            key={a.id}
            selected={agency === a.id}
            disabled={!a.supported}
            onPress={() => setAgency(a.id)}
            title={a.label}
            aside={a.supported ? undefined : 'Coming soon'}
          />
        ))}
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Lightbulb size={16} color={c.mutedForeground} />
          <Text variant="caption" tone="muted" style={{ flex: 1 }}>For transponders that work across several agencies, choose the main agency of the account you use to manage invoices and payments.</Text>
        </View>
        <Text variant="caption" tone="muted">Don’t see your toll agency? Support for more agencies is coming soon.</Text>
      </Screen>
    );
  }

  return (
    <Screen
      header={<ScreenHeader title="Log in to link account" subtitle={`Use your ${agencyLabel(agency ?? 'ntta')} account details to log in.`} onBack={back} />}
      footer={<Button title="Log in" disabled={!username.trim() || !password} loading={link.isPending} onPress={() => link.mutate()} />}
    >
      <Input label="Account number or username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} autoComplete="off" />
      <PasswordInput label="Password" value={password} onChangeText={setPassword} />
      <Input label="Set account nickname" hint="Nicknames help you tell linked toll accounts apart." value={nickname} onChangeText={setNickname} placeholder={defaultNickname} />
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Lock size={16} color={c.mutedForeground} />
        <Text variant="caption" tone="muted" style={{ flex: 1 }}>
          Your account details are stored encrypted and never shown again. By linking your toll account, you authorize CatoDrive to retrieve toll transactions for your vehicles with CatoDrive trips.
        </Text>
      </View>
    </Screen>
  );
}

export default function LinkTollAccountScreen() {
  return (
    <RequireAuth>
      <LinkTollAccount />
    </RequireAuth>
  );
}
